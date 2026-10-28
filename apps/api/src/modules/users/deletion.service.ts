import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { DeleteMeResponse } from '@triptrackr/contracts';
import type { Queue } from 'bullmq';
import { eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { apiError } from '@/common/errors/api-error';
import { QUEUE_NAMES, queueToken } from '@/common/queue/queue.constants';
import { requireCurrentUserId, requireRlsTransaction } from '@/common/rls/rls-context';
import { users } from '@/db/schema';
import { PasswordService } from '@/modules/auth/password.service';

/**
 * `DELETE /me` checks a password with a valid access token in hand, so it is a place to guess
 * one: a few tries an hour per address, far below the global ceiling (FR-071). A traveller
 * deleting their account makes one request.
 */
export const DELETE_ME_RATE_LIMIT = { limit: 5, windowSeconds: 3_600 } as const;

/** The name of the job on the `storage-sweep` queue that deletes one account. */
export const ACCOUNT_DELETION_JOB = 'account-deletion';

/**
 * The job is delayed a few seconds so the request transaction (which marks the account and
 * ends its sessions) has committed before the worker looks; the keyhole refuses an account
 * that is not marked, and the retries below absorb a slower commit as well.
 */
const START_DELAY_MS = 5_000;
const JOB_ATTEMPTS = 8;

/**
 * `DELETE /me` (rest-api.md §2; FR-006; data-model §9; tasks.md T188).
 *
 * The request does the part that must happen at once and can be undone by nothing: it checks
 * the caller is the traveller and not a stolen access token (an account with a password must
 * send it; an account that only ever signed in with a provider has none to send, and the
 * provider re-check is tracked with the authentication audit, S-09), marks the account,
 * ends every session, and queues the sweep. All in the one request transaction: the mark and
 * the revoked tokens commit together or not at all, so a failure leaves the traveller signed
 * in with nothing half-done.
 *
 * It does NOT delete rows or files. The sweep (`workers/account-deletion.processor.ts`)
 * removes the objects first and the rows last, and the deletion is complete only when it
 * confirms; the response says only that deletion was requested (202).
 *
 * Idempotent: an account already marked answers 202 again and queues nothing more (the job
 * id is the traveller's id as well, so even a race cannot queue two). Once marked, the
 * account cannot sign in or refresh (migrations 0006, 0008 refuse it) and its profile route
 * answers 401.
 */
@Injectable()
export class DeletionService {
  constructor(
    private readonly passwords: PasswordService,
    @Inject(queueToken(QUEUE_NAMES.storageSweep)) private readonly queue: Queue,
  ) {}

  async request(password: string | undefined): Promise<DeleteMeResponse> {
    const userId = requireCurrentUserId();
    const db = rlsDb();

    const [row] = await db
      .select({ hash: users.passwordHash, requestedAt: users.deletionRequestedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in again.');
    }
    if (row.requestedAt !== null) return { status: 'deletion_requested' };

    if (row.hash !== null) {
      const proven =
        password !== undefined && (await this.passwords.verify(row.hash, password));
      if (!proven) {
        throw apiError(
          HttpStatus.FORBIDDEN,
          'REAUTHENTICATION_REQUIRED',
          'Enter your password to delete your account.',
        );
      }
    }

    await db
      .update(users)
      .set({ deletionRequestedAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
    // The one door that retires tokens (0006), as logout-all does: the API role may not
    // touch `refresh_tokens` directly.
    await requireRlsTransaction()`
      SELECT auth_revoke_refresh_tokens(NULL, ${userId}::uuid)
    `;

    await this.queue.add(
      ACCOUNT_DELETION_JOB,
      { userId },
      {
        jobId: `account-deletion-${userId}`,
        delay: START_DELAY_MS,
        attempts: JOB_ATTEMPTS,
      },
    );

    return { status: 'deletion_requested' };
  }
}
