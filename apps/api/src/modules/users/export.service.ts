import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { DataExport, ExportResponse } from '@triptrackr/contracts';
import type { Queue } from 'bullmq';
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { apiError, notFound } from '@/common/errors/api-error';
import { QUEUE_NAMES, queueToken } from '@/common/queue/queue.constants';
import { requireCurrentUserId, requireRlsTransaction } from '@/common/rls/rls-context';
import { StorageService } from '@/common/storage/storage.service';
import { dataExports, users } from '@/db/schema';
import { PasswordService } from '@/modules/auth/password.service';

/**
 * `POST /me/export` checks a password with a valid access token in hand, so it is a place to guess
 * one: a few tries an hour per address (FR-071), as `DELETE /me`.
 */
export const START_EXPORT_RATE_LIMIT = { limit: 5, windowSeconds: 3_600 } as const;

/** The name of the job on the `account-export` queue that builds one archive. */
export const EXPORT_JOB = 'export';

/** One export a day (spec 009 FR-002). */
const DAY_SECONDS = 86_400;

/** What a browser saves a download as. */
const DOWNLOAD_NAME = 'triptrackr-export.zip';

type ExportRow = typeof dataExports.$inferSelect;

/**
 * Export my data (rest-api.md §2; FR-007; spec 009). The request records a pending row and queues
 * the job; `workers/account-export.processor.ts` builds the archive. This is the route's half.
 *
 * Re-authenticated like deletion: an export is the largest exfiltration path of the system, so an
 * account with a password must send it (`403 REAUTHENTICATION_REQUIRED`; a Google or Apple account
 * has none, and the provider re-check is tracked with step S-09). One a day: a second request
 * while an export of the last 24 hours is pending or ready is `429` and names it. Audit-logged by
 * export id and outcome, never by content.
 *
 * A signed link is issued at each read and lasts minutes; the archive behind it lasts 24 hours
 * (`expires_at`), and an archive past that reads as `expired` here even before the cleanup removes
 * it, so a late link cannot be issued.
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly passwords: PasswordService,
    private readonly storage: StorageService,
    @Inject(queueToken(QUEUE_NAMES.accountExport)) private readonly queue: Queue,
  ) {}

  async start(password: string | undefined): Promise<ExportResponse> {
    const userId = requireCurrentUserId();
    const db = rlsDb();

    const [account] = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!account) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in again.');
    }

    if (account.hash !== null) {
      const proven =
        password !== undefined && (await this.passwords.verify(account.hash, password));
      if (!proven) {
        this.logger.warn('Export refused: the password was missing or wrong.');
        throw apiError(
          HttpStatus.FORBIDDEN,
          'REAUTHENTICATION_REQUIRED',
          'Enter your password to export your data.',
        );
      }
    }

    // Two requests at once must not both pass the daily check.
    await requireRlsTransaction()`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const [recent] = await db
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(
        and(
          eq(dataExports.userId, userId),
          inArray(dataExports.status, ['pending', 'ready']),
          gt(dataExports.requestedAt, sql`now() - make_interval(secs => ${DAY_SECONDS})`),
        ),
      )
      .orderBy(desc(dataExports.requestedAt))
      .limit(1);
    if (recent) {
      this.logger.log(
        `Export ${recent.id} already exists for today; a new one was refused.`,
      );
      throw apiError(
        HttpStatus.TOO_MANY_REQUESTS,
        'EXPORT_RATE_LIMITED',
        'You can export your data once a day. Your earlier export is still available.',
        { export_id: recent.id },
      );
    }

    const [created] = await db.insert(dataExports).values({ userId }).returning();
    if (!created) throw new Error('The export row was not created.');

    await this.queue.add(
      EXPORT_JOB,
      { exportId: created.id, userId },
      { jobId: `export-${created.id}`, attempts: 1 },
    );
    this.logger.log(`Export ${created.id} requested.`);

    return { export: await this.present(created) };
  }

  async get(exportId: string): Promise<ExportResponse> {
    const userId = requireCurrentUserId();
    const [row] = await rlsDb()
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
      .limit(1);
    if (!row) throw notFound('EXPORT_NOT_FOUND', 'That export');

    return { export: await this.present(row) };
  }

  private async present(row: ExportRow): Promise<DataExport> {
    const lapsed =
      row.status === 'ready' && row.expiresAt !== null && row.expiresAt <= new Date();
    const status = lapsed ? 'expired' : row.status;
    const live = status === 'ready' && row.objectKey !== null;

    return {
      id: row.id,
      status,
      requested_at: row.requestedAt.toISOString(),
      expires_at: row.expiresAt === null ? null : row.expiresAt.toISOString(),
      download_url: live
        ? await this.storage.createDownloadUrl('documents', row.objectKey!, DOWNLOAD_NAME)
        : null,
    };
  }
}
