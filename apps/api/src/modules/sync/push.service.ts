import { Injectable, Logger } from '@nestjs/common';
import type { PushResponse, PushResult, SyncTable } from '@triptrackr/contracts';

import {
  requireCurrentUserId,
  requireRlsTransaction,
  runInRlsContext,
} from '@/common/rls/rls-context';

import { bindHandler, type ApplyOutcome, type BoundHandler } from './push-apply';
import { clampToServerClock } from './push-conflict';
import type { PushEnvelope } from './push-envelope';
import { PushFailure, refusalFor, sqlStateOf } from './push-errors';
import { ExpenseCategoriesPushHandler, ExpensesPushHandler } from './push-money';
import { NotesPushHandler } from './push-notes';
import { DocumentsPushHandler, PhotosPushHandler } from './push-media';
import { TripStopsPushHandler, TripsPushHandler } from './push-trips';
import { PullService } from './pull.service';

/**
 * `POST /sync/push` (sync-protocol.md §2; FR-039, FR-040, FR-041; research D-02,
 * D-08, D-15, D-16; tasks.md T123–T125, T128, T199, T200).
 *
 * One request is one table's batch, applied record by record in the order sent,
 * each record's outcome reported in that order:
 *
 *   - `applied` — stored, or already stored exactly so (a retry). A trip pushed
 *     by an account at its allowance is applied with `warnings:
 *     ['over_allowance']`: kept, never rejected (D-08, Constitution V).
 *   - `conflict` — the stored row won; the answer carries it as `server_version`
 *     in the table's PULL shape, produced by `PullService.readOne` so that shape
 *     exists in one place. The device overwrites its row and tells the traveller.
 *   - `rejected` — `invalid` (the record fails its table's strict schema, or a
 *     value the database cannot hold), `parent_missing` (a parent that does not
 *     exist, is not the caller's, or is deleted — one answer for all three; also
 *     a photo or document with no row yet), `id_unavailable` (the id is held by a
 *     row the caller cannot see; nothing of that row is said).
 *
 * The decision between versions is not here. It is `resolveConflict`, reached
 * through `applyRecord` for every table (push-apply.ts, push-conflict.ts).
 *
 * ## What the whole request is, and is not
 *
 * The request runs in the request's RLS transaction (RlsSessionMiddleware): one
 * traveller's identity, set once, for every record. Each record is additionally
 * run in its own SAVEPOINT. A failed statement aborts a PostgreSQL transaction,
 * so without one a single refused record — an id collision, a value out of range
 * — would fail every record after it and the whole request with them; with one,
 * the refusal rolls back only its own writes and the batch goes on. The
 * savepoint is also what makes "a rejected record applies nothing" true of a
 * refusal found after a write. The context is re-entered on the savepoint's
 * handle, so every query the handlers issue — and every service they reuse —
 * runs inside it without knowing.
 *
 * The body is `{table, records}` with 1..`MAX_PUSH_BATCH` records (500). A
 * record that fails its table's strict schema is `rejected`/`invalid` alone. A
 * record with no parseable `id` cannot be reported by id at all, so it fails the
 * request with 400 before anything is applied (push-envelope.ts).
 *
 * **The same id twice in one batch** is not special-cased: the records are
 * applied in order, the second judged by the same rule against what the first
 * stored. Two identical copies are one row, twice `applied`; a newer one after an
 * older applies both, the older after the newer is answered `conflict`. One
 * result per input record, always.
 *
 * **Payload ceiling.** The JSON body limit is the API-wide megabyte
 * (`BODY_LIMIT`, app.setup.ts), and this route has no parser of its own. A
 * single record cannot exceed it — a note's 20,000 characters are at worst
 * about 120 KB of JSON even when every character needs a six-byte escape — so a
 * client that chunks its batches to about 800 KB always makes progress. A body
 * over a megabyte is answered 413 `PAYLOAD_TOO_LARGE` by the body parser,
 * before this service runs and with nothing applied; the client halves the batch
 * and sends it again. A route-specific parser as the document upload has was
 * rejected: that route exists because a document's bytes have nowhere else to
 * go, while a batch can always be split.
 *
 * ## Clock (sync-protocol.md §2, "Server clock decides")
 *
 * A record's `updated_at` more than `SYNC_CLOCK_TOLERANCE_MS` ahead of the
 * moment the request was received is clamped to that moment, and the clamp is
 * logged: table, record id, skew in seconds — never a field of the record. The
 * stored `updated_at` is the clamped value.
 *
 * ## Failures and logs
 *
 * A failure that is not a refusal surfaces as a 500 — and rolls the request back,
 * which is safe because every push is idempotent and the device retries. It is
 * re-thrown as a `PushFailure` naming the table, the id and the SQLSTATE: a
 * Drizzle error carries the failed statement AND its parameters, and the
 * parameters of a note are the traveller's journal.
 *
 * Visibility posture: owner-only. Every row read or written is reached through
 * the caller's own trips (push-scope.ts), `expenses` and `documents` have no
 * visibility field on the wire or in the table, and a refusal reveals nothing of
 * a row the caller does not own.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly handlers: ReadonlyMap<SyncTable, BoundHandler>;

  constructor(
    trips: TripsPushHandler,
    stops: TripStopsPushHandler,
    categories: ExpenseCategoriesPushHandler,
    notes: NotesPushHandler,
    expenses: ExpensesPushHandler,
    photos: PhotosPushHandler,
    documents: DocumentsPushHandler,
    private readonly pull: PullService,
  ) {
    const bound = [
      bindHandler(trips),
      bindHandler(stops),
      bindHandler(categories),
      bindHandler(notes),
      bindHandler(expenses),
      bindHandler(photos),
      bindHandler(documents),
    ];

    this.handlers = new Map(bound.map((handler) => [handler.table, handler]));
  }

  async push(envelope: PushEnvelope): Promise<PushResponse> {
    const handler = this.handlers.get(envelope.table);
    if (!handler) throw new Error(`No push handler for ${envelope.table}.`);

    // One receipt time for the whole request: the clamp and the tombstone time
    // are the same instant for every record, whatever order they are applied in.
    const receivedAt = new Date();
    const results: PushResult[] = [];

    for (const raw of envelope.records) {
      results.push(await this.pushRecord(handler, raw, receivedAt));
    }

    return { results };
  }

  private async pushRecord(
    handler: BoundHandler,
    raw: { readonly id: string },
    receivedAt: Date,
  ): Promise<PushResult> {
    const { id } = raw;
    const prepared = handler.prepare(raw);
    if (!prepared) return { id, status: 'rejected', reason: 'invalid' };

    const clamp = clampToServerClock(prepared.claimedAt, receivedAt);
    if (clamp.clamped) this.logClamp(handler.table, id, clamp.skewSeconds);

    let outcome: ApplyOutcome;
    try {
      outcome = await this.inSavepoint(() =>
        prepared.apply({ updatedAt: clamp.updatedAt, deletedAt: receivedAt }),
      );
    } catch (error: unknown) {
      const reason = refusalFor(error);
      if (reason === null) throw new PushFailure(handler.table, id, sqlStateOf(error));

      return { id, status: 'rejected', reason };
    }

    if (outcome.status === 'conflict') return this.conflictResult(handler.table, id);

    return outcome.warnings.length === 0
      ? { id, status: 'applied' }
      : { id, status: 'applied', warnings: [...outcome.warnings] };
  }

  /** The stored row, in its pull shape, for the device that lost. */
  private async conflictResult(table: SyncTable, id: string): Promise<PushResult> {
    const serverVersion = await this.pull.readOne(table, id);

    if (serverVersion === null) {
      // The row was found, locked and judged a moment ago in this very
      // transaction; it cannot have gone. Fail loudly rather than tell a device
      // it lost to nothing.
      throw new Error(`The winning version of ${table} ${id} could not be read back.`);
    }

    return { id, status: 'conflict', server_version: serverVersion };
  }

  /**
   * Runs `work` in a savepoint of the request's transaction, as the same
   * traveller. A throw rolls back to the savepoint and propagates; the
   * transaction is left usable.
   */
  private inSavepoint(work: () => Promise<ApplyOutcome>): Promise<ApplyOutcome> {
    const tx = requireRlsTransaction();
    const userId = requireCurrentUserId();

    return tx.savepoint((savepoint) => runInRlsContext({ tx: savepoint, userId }, work));
  }

  private logClamp(table: SyncTable, recordId: string, skewSeconds: number): void {
    this.logger.warn({
      event: 'sync.clock_clamped',
      table,
      record_id: recordId,
      skew_seconds: skewSeconds,
    });
  }
}
