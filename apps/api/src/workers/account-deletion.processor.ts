import { Uuid } from '@triptrackr/contracts';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';

import type { StorageBucket, StorageService } from '@/common/storage/storage.service';

/**
 * The account-deletion sweep — tasks.md T188 (FR-006, SC-015; data-model §9;
 * Constitution V).
 *
 * `DELETE /me` (modules/users/deletion.service.ts) marks the account, ends every session
 * and queues this job; deletion is not complete until this finishes. It removes what a
 * database cascade alone would leave: every photo, thumbnail and sealed document in the
 * private buckets, and then the traveller's rows.
 *
 * Runs in the worker on the API role's connection, outside any request and with no
 * traveller identity, so it reaches the rows only through two SECURITY DEFINER keyholes
 * (migration 0014), both of which refuse an account that has not asked to be deleted.
 *
 * **The bytes go before the rows.** A photo or document row is the only place its
 * object's key is written, and storage keys are `<ownerId>/<uuid>`. So the sweep removes
 * (1) the keys the rows name and (2) EVERYTHING listed under `<userId>/` in each bucket,
 * which also catches an object no row points at; only then does it delete the account, and
 * it lists the prefixes once more and throws if anything is left. `removeObject` throws on
 * anything but "already gone", so a refusing or unreachable store aborts the run with the
 * account marked and intact, and BullMQ's retry (queue.module.ts) resumes from the same
 * place. Removing what is already gone is success, so a retry repeats nothing harmful.
 *
 * **One transaction.** The keyholes and the final listing run in it, so if the last check
 * finds a straggler (an upload that landed on an unexpired token) the deletion of the rows
 * rolls back and the retry sweeps again. If the traveller no longer exists the job lists
 * nothing and deletes nothing: a second run of a finished job is a no-op.
 *
 * Visibility posture: touches no traveller-facing surface. Reads keys, not content; the
 * result carries counts, and nothing here logs a key, an id or a traveller.
 */

const BUCKETS: readonly StorageBucket[] = ['photos', 'documents'];

/** How many objects are removed at once: quick, but polite to the store. */
const REMOVAL_CONCURRENCY = 16;

export type DeletionStorage = Pick<StorageService, 'removeObject' | 'listObjects'>;

export interface AccountDeletionDeps {
  /** The API role's connection, with no traveller identity (bootstrap.ts). */
  readonly sql: Sql;
  readonly storage: DeletionStorage;
}

/** The job's data, checked where it enters: a malformed job fails here, before it reaches any query. */
export const AccountDeletionJob = z.strictObject({ userId: Uuid });
export type AccountDeletionJob = z.infer<typeof AccountDeletionJob>;

export interface AccountDeletionResult {
  /** The sweep finished: no object under the traveller's prefix, and the account is gone. */
  readonly completed: true;
  /** Objects found in the buckets and removed (a retry after a finished run finds none). */
  readonly objectsRemoved: number;
  /** Whether this run deleted the account row (false when an earlier run already had). */
  readonly accountDeleted: boolean;
}

interface Target {
  readonly bucket: StorageBucket;
  readonly key: string;
}

export function processAccountDeletion(
  deps: AccountDeletionDeps,
  job: unknown,
): Promise<AccountDeletionResult> {
  const { userId } = AccountDeletionJob.parse(job);
  const prefix = `${userId}/`;

  return deps.sql.begin(async (tx) => {
    const named = await namedByRows(tx, userId);
    const listed = await listAll(deps.storage, prefix);

    await removeAll(deps.storage, uniqueTargets([...named, ...listed]));

    const [finalised] = await tx<{ deleted: boolean }[]>`
      SELECT account_deletion_finalise(${userId}::uuid) AS deleted
    `;

    // The proof: nothing is left under the prefix once the rows are gone.
    const left = await listAll(deps.storage, prefix);
    if (left.length > 0) {
      throw new Error(
        `${left.length} object(s) remain under the traveller's prefix after the sweep; the deletion is rolled back and will be retried.`,
      );
    }

    return {
      completed: true,
      objectsRemoved: listed.length,
      accountDeleted: finalised?.deleted === true,
    };
  });
}

/** The keys the traveller's rows point at (raises when deletion was not requested). */
async function namedByRows(tx: TransactionSql, userId: string): Promise<Target[]> {
  const rows = await tx<{ bucket: string; object_key: string }[]>`
    SELECT bucket, object_key FROM account_deletion_objects(${userId}::uuid)
  `;
  return rows.map((row) => ({ bucket: knownBucket(row.bucket), key: row.object_key }));
}

async function listAll(storage: DeletionStorage, prefix: string): Promise<Target[]> {
  const found: Target[] = [];
  for (const bucket of BUCKETS) {
    for (const key of await storage.listObjects(bucket, prefix))
      found.push({ bucket, key });
  }
  return found;
}

function knownBucket(name: string): StorageBucket {
  const bucket = BUCKETS.find((known) => known === name);
  if (!bucket) {
    // Never delete from a bucket the database merely names.
    throw new Error(
      `The sweep was handed an unknown bucket "${name}"; nothing was deleted.`,
    );
  }
  return bucket;
}

function uniqueTargets(targets: readonly Target[]): Target[] {
  const seen = new Map<string, Target>();
  for (const target of targets) seen.set(`${target.bucket}/${target.key}`, target);
  return [...seen.values()];
}

/** In groups, so a large account neither serialises thousands of round trips nor floods the store. */
async function removeAll(
  storage: DeletionStorage,
  targets: readonly Target[],
): Promise<void> {
  for (let start = 0; start < targets.length; start += REMOVAL_CONCURRENCY) {
    const group = targets.slice(start, start + REMOVAL_CONCURRENCY);
    await Promise.all(group.map((t) => storage.removeObject(t.bucket, t.key)));
  }
}
