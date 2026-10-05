import { PullResponse, SYNC_TABLES, type SyncTable } from '@triptrackr/contracts';

import { syncRepository, type SyncExecutor } from '@/db/repositories/sync';
import { nowIso } from '@/db/repositories/shared';
import { apiFetch } from '@/lib/api-client';

import { assertCurrent, type SyncContext } from './context';
import { markFirstSyncComplete, readPullCursor, writePullCursor } from './cursor';
import { noticeForOverwrite, raiseConflicts } from './conflicts';
import { SyncContractError, classifyFailure } from './failure';
import { instantMs, toLocalValues, type WireRecord } from './records';
import type { ConflictNotice, SyncFailure } from './types';

/**
 * Pull: apply the server's changes to the local store (tasks.md T131, T133;
 * sync-protocol.md §1; FR-039, FR-040, FR-042; SC-011; research D-15, D-16).
 *
 * THE LOOP. Pages are fetched from the stored cursor (none = a full snapshot)
 * until `has_more` is false. Each page is applied and the cursor advanced in
 * ONE transaction (`applyPage`): a failure inside it rolls the page back and
 * leaves the cursor where it was, and a failure between pages leaves the cursor
 * at the last page that landed, so the next cycle resumes rather than restarts
 * (rows 9 and 10 of the acceptance suite). The transaction that applies the
 * last page also records that the first sync is complete.
 *
 * THE RULE PER RECORD (`applyRecord`).
 *   - no local row              -> insert (a tombstone is inserted as one).
 *   - local row, not dirty      -> overwrite: the server is authoritative. One
 *                                  guard: a live version OLDER than a local
 *                                  tombstone is stale and never resurrects it.
 *   - local row, dirty          -> last-write-wins, mirroring the server's rule
 *                                  (research D-02): the local edit is kept if
 *                                  its `updated_at` is strictly newer (it will
 *                                  win at push time); otherwise the server's
 *                                  version overwrites it and, when the
 *                                  traveller's content differed, a
 *                                  `ConflictNotice` is raised (FR-040). A tie
 *                                  goes to the server: that is the shape of a
 *                                  push whose acknowledgement was lost, where
 *                                  the two versions are the same and no notice
 *                                  is due.
 *   Tombstones (`deleted_at` set) are written like any other version, so live
 *   queries — which filter `deleted_at` — stop showing the row.
 *
 * THE FOREIGN-KEY PROBLEM. The local schema keeps `trip_id -> trips` foreign
 * keys, but the server pages by `(updated_at, id)` across all seven tables, not
 * by dependency: a note can arrive on an earlier page than its trip when the
 * trip was edited later. Inside a page rows apply in `SYNC_TABLES` order, which
 * settles the common case; ACROSS pages nothing can be assumed. Options
 * weighed: (a) `PRAGMA defer_foreign_keys` — still fails the COMMIT of the page
 * that carries the orphan; (b) hold orphans back in a side table — a second
 * store that has to agree with the cursor through a crash; (c) drop the foreign
 * keys by a table-rebuild migration — loses the cascade and rewrites five
 * tables on devices that hold data. Chosen: suspend enforcement around the
 * page transaction (`withForeignKeysSuspended`, synchronous, so no other code
 * runs on the connection meanwhile) and AUDIT with `PRAGMA foreign_key_check`
 * once the pull completes. A child parked ahead of its parent is inert — every
 * read path scopes by trip — until the parent's page lands. Orphans that
 * remain after a COMPLETE pull are reported (`orphans`), not deleted: the rows
 * are the server's, harmless, and deleting on suspicion is the wrong direction
 * for a product that must never lose what a traveller recorded.
 *
 * SAFETY. The context is re-checked before each request and before applying
 * each response: a cycle that outlived its account binding writes nothing
 * (context.ts).
 */
export interface PullOutcome {
  /** Records written locally (inserted or overwritten). */
  pulled: number;
  /** Dirty local rows replaced with different content — one notice each. */
  conflicts: number;
  pages: number;
  /** True when the last page (`has_more = false`) was applied. */
  complete: boolean;
  /** Rows whose parent is missing after a complete pull (`foreign_key_check`). */
  orphans: number;
  failure: SyncFailure | null;
}

interface PageResult {
  written: number;
  notices: ConflictNotice[];
}

function pullPath(cursor: string | null): string {
  return cursor === null
    ? '/sync/pull'
    : `/sync/pull?cursor=${encodeURIComponent(cursor)}`;
}

/** A live version older than a local tombstone: stale, never a resurrection. */
function isStaleResurrection(local: WireRecord, incoming: WireRecord): boolean {
  return (
    local.deleted_at !== null &&
    incoming.deleted_at === null &&
    instantMs(String(incoming.updated_at)) < instantMs(String(local.updated_at))
  );
}

function applyRecord(
  tx: SyncExecutor,
  table: SyncTable,
  incoming: WireRecord,
  now: string,
): { written: boolean; notice: ConflictNotice | null } {
  const id = String(incoming.id);
  const local = syncRepository.findRow(tx, table, id);
  const values = { ...toLocalValues(incoming), is_dirty: false, synced_at: now };

  if (!local) {
    syncRepository.insertRow(tx, table, values);
    return { written: true, notice: null };
  }
  if (!local.is_dirty) {
    if (isStaleResurrection(local, incoming)) return { written: false, notice: null };
    syncRepository.updateRow(tx, table, id, values);
    return { written: true, notice: null };
  }
  if (instantMs(local.updated_at) > instantMs(String(incoming.updated_at))) {
    return { written: false, notice: null };
  }
  const notice = noticeForOverwrite(table, local, incoming, now);
  syncRepository.updateRow(tx, table, id, values);
  return { written: true, notice };
}

/** One page and the cursor that names it, in one transaction (SC-011). */
function applyPage(db: SyncContext['db'], response: PullResponse): PageResult {
  const now = nowIso();
  const notices: ConflictNotice[] = [];
  let written = 0;

  syncRepository.withForeignKeysSuspended(db, () =>
    db.transaction((tx) => {
      for (const table of SYNC_TABLES) {
        for (const incoming of response.changes[table] as WireRecord[]) {
          const applied = applyRecord(tx, table, incoming, now);
          if (applied.written) written += 1;
          if (applied.notice) notices.push(applied.notice);
        }
      }
      writePullCursor(tx, response.next_cursor);
      if (!response.has_more) markFirstSyncComplete(tx);
    }),
  );
  return { written, notices };
}

/**
 * Pull every page after the stored cursor. Never throws: a failure is the
 * outcome's `failure`, with whatever was applied before it counted.
 */
export async function pullChanges(ctx: SyncContext): Promise<PullOutcome> {
  const tally = { pulled: 0, conflicts: 0, pages: 0 };
  try {
    let cursor = readPullCursor(ctx.db);
    for (;;) {
      assertCurrent(ctx);
      const response = await apiFetch(PullResponse, pullPath(cursor));
      assertCurrent(ctx);
      if (response.has_more && response.next_cursor === cursor) {
        throw new SyncContractError(
          'The server offered more pages without moving the cursor.',
        );
      }

      const page = applyPage(ctx.db, response);
      raiseConflicts(page.notices);
      tally.pulled += page.written;
      tally.conflicts += page.notices.length;
      tally.pages += 1;

      cursor = response.next_cursor;
      if (!response.has_more) break;
    }
    return {
      ...tally,
      complete: true,
      orphans: syncRepository.foreignKeyViolations(ctx.db),
      failure: null,
    };
  } catch (error) {
    return { ...tally, complete: false, orphans: 0, failure: classifyFailure(error) };
  }
}
