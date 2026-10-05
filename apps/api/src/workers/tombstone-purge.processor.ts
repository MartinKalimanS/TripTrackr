import type { Sql, TransactionSql } from 'postgres';

import type { StorageBucket, StorageService } from '@/common/storage/storage.service';

/**
 * The tombstone retention purge — tasks.md T129 (sync-protocol.md §5;
 * Constitution V; FR-039).
 *
 * A deletion is a row with `deleted_at` set, kept so that a device which has
 * not synchronised yet learns the row is gone instead of pushing it back. The
 * protocol states how long that protection lasts — 90 days, sized for a device
 * that is offline for an extended trip — and promises it is "honoured; it is
 * not a pretext for retaining data". This is the job that honours it: once a
 * tombstone is older than {@link TOMBSTONE_RETENTION_DAYS}, the row is deleted
 * for good, and so are the bytes it pointed at.
 *
 * Runs in the worker as a BullMQ job scheduler's job (queue `tombstone-purge`,
 * once a day; queue.constants.ts), on the API role's connection, outside any
 * request. That role does not own the tables and, under FORCE ROW LEVEL
 * SECURITY, sees no traveller's rows without a traveller's identity — which is
 * correct, and is why the purge cannot be a plain `DELETE`. It goes through two
 * SECURITY DEFINER keyholes owned by the migration role (0013), which take the
 * retention window and nothing else, refuse any window under 90 days, and reach
 * only rows tombstoned longer ago than that.
 *
 * **The bytes go before the row.** A photo or document row is the only place
 * the object's key is recorded. Delete the row first and a crash — or a store
 * that refuses the delete — strands an object in a private bucket that nothing
 * will ever remove: a traveller's deleted file, kept forever. So the first
 * keyhole LISTS the objects of the rows that are due (photo originals, their
 * derived thumbnails, sealed documents), they are removed, and only then does
 * the second keyhole delete the rows. Removal is `removeObject`, which throws on
 * anything but "already gone" — unlike `deleteObject`, which logs and carries
 * on — so a refusal aborts the run while every key is still on its row, and
 * BullMQ's retry (queue.module.ts) resumes from exactly there. Removing an
 * object that is already gone is success, so a retry after a partial run repeats
 * nothing harmful.
 *
 * **One transaction.** The keyholes compute their cutoff from `now()`, which is
 * the transaction's start, so inside one transaction both see the same cutoff
 * and the second deletes exactly the rows the first listed. The first also locks
 * those rows, so a device that pushes a late edit to one of them waits for the
 * purge rather than un-deleting it in the gap between its objects being removed
 * and its row following. If anything throws, the transaction rolls back and no
 * row is deleted.
 *
 * Visibility posture: touches no traveller-facing surface. Reads keys, not
 * content; logs counts, never a key, an id or a traveller.
 */

/** How long a tombstone is kept (sync-protocol.md §5). The keyholes refuse anything shorter. */
export const TOMBSTONE_RETENTION_DAYS = 90;

/** How many objects are removed at once: enough to be quick, few enough to be polite to the store. */
const REMOVAL_CONCURRENCY = 16;

/** The two buckets there are (StorageBucket); anything else from the database is a defect. */
const KNOWN_BUCKETS: readonly StorageBucket[] = ['photos', 'documents'];

export type PurgeStorage = Pick<StorageService, 'removeObject'>;

export interface TombstonePurgeDeps {
  /** The API role's connection, with no traveller identity (bootstrap.ts). */
  readonly sql: Sql;
  readonly storage: PurgeStorage;
}

export interface TombstonePurgeResult {
  readonly retentionDays: number;
  /** Objects removed from the buckets (originals, thumbnails, sealed documents). */
  readonly objectsRemoved: number;
  /** Rows hard-deleted, by table. */
  readonly purged: Readonly<Record<string, number>>;
}

interface DueObject {
  readonly bucket: StorageBucket;
  readonly key: string;
}

export function purgeTombstones({
  sql,
  storage,
}: TombstonePurgeDeps): Promise<TombstonePurgeResult> {
  return sql.begin(async (tx) => {
    const due = await listDueObjects(tx);
    await removeAll(storage, due);

    const counts = await tx<{ table_name: string; purged: string }[]>`
      SELECT table_name, purged FROM tombstone_purge(${TOMBSTONE_RETENTION_DAYS}::integer)
    `;

    return {
      retentionDays: TOMBSTONE_RETENTION_DAYS,
      objectsRemoved: due.length,
      purged: Object.fromEntries(counts.map((c) => [c.table_name, Number(c.purged)])),
    };
  });
}

/** The objects of every photo and document whose tombstone is past the window; locks those rows. */
async function listDueObjects(tx: TransactionSql): Promise<DueObject[]> {
  const rows = await tx<{ bucket: string; object_key: string }[]>`
    SELECT bucket, object_key
    FROM tombstone_purge_objects(${TOMBSTONE_RETENTION_DAYS}::integer)
  `;

  return rows.map((row) => ({ bucket: knownBucket(row.bucket), key: row.object_key }));
}

function knownBucket(name: string): StorageBucket {
  const bucket = KNOWN_BUCKETS.find((known) => known === name);
  if (!bucket) {
    // Never delete from a bucket the database merely names.
    throw new Error(
      `The purge was handed an unknown bucket "${name}"; nothing was deleted.`,
    );
  }

  return bucket;
}

/** In groups, so a large purge neither serialises thousands of round trips nor floods the store. */
async function removeAll(
  storage: PurgeStorage,
  due: readonly DueObject[],
): Promise<void> {
  for (let start = 0; start < due.length; start += REMOVAL_CONCURRENCY) {
    const group = due.slice(start, start + REMOVAL_CONCURRENCY);
    await Promise.all(
      group.map((object) => storage.removeObject(object.bucket, object.key)),
    );
  }
}
