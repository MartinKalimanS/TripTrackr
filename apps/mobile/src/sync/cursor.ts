import { syncRepository, type SyncExecutor } from '@/db/repositories/sync';

/**
 * The pull cursor and the "first sync complete" flag (tasks.md T131;
 * sync-protocol.md §1, §3; FR-042; SC-011).
 *
 * WHERE. Both live in the local `sync_state` table of the SAME encrypted
 * database the rows live in. There is one database file per account
 * (`db/client.ts`), so both are per account by construction, and there is no
 * second store that could disagree with the rows about what has been applied.
 *
 * ATOMICITY. `writePullCursor` and `markFirstSyncComplete` take a database OR a
 * transaction. `pull.ts` calls them inside the transaction that applies a page,
 * so the cursor advances if and only if the page's rows were written: a crash
 * between two pages resumes at exactly the next page, nothing lost, nothing
 * applied twice (SC-011, sync-protocol.md §6 rows 9 and 10).
 *
 * THE FIRST-SYNC RULE. `firstSyncComplete` means "a full snapshot has finished
 * on this device": the syncing screen stands in for an empty screen until then
 * (FR-042). It is set by the transaction that applies the last page of a pull
 * (`has_more = false`). The resulting rule for a device that pre-dates the flag:
 *
 *   flag stored            -> its value.
 *   no flag, cursor stored -> false. A snapshot began and did not finish;
 *                             half a history is not a history, and the pull
 *                             resumes from the cursor.
 *   no flag, no cursor, the store already holds rows
 *                          -> true, and persisted. This is a device that
 *                             recorded trips before sync shipped (or a
 *                             traveller who created content offline before the
 *                             first snapshot could run). It must never be shut
 *                             behind a "syncing" screen away from its own data
 *                             (Constitution V). With no cursor, the next pull
 *                             is still a full snapshot; it merges into what is
 *                             here by the ordinary pull rules, dirty rows
 *                             included, so no local edit is lost to it.
 *   no flag, no cursor, empty store
 *                          -> false: a new device, the snapshot is the wait.
 */
const PULL_CURSOR_KEY = 'pull_cursor';
const FIRST_SYNC_KEY = 'first_sync_complete';
const FLAG_SET = '1';

/** The opaque cursor of the last applied page, or `null` before any: the next pull is a snapshot. */
export function readPullCursor(db: SyncExecutor): string | null {
  return syncRepository.getState(db, PULL_CURSOR_KEY);
}

/** Store the cursor. Call it inside the transaction that applied the page it names. */
export function writePullCursor(db: SyncExecutor, cursor: string): void {
  syncRepository.setState(db, PULL_CURSOR_KEY, cursor);
}

/** Whether a full snapshot has finished — the stored flag only, no adoption rule. */
export function isFirstSyncComplete(db: SyncExecutor): boolean {
  return syncRepository.getState(db, FIRST_SYNC_KEY) === FLAG_SET;
}

/** Record that a snapshot finished. Call it inside the transaction of the last page. */
export function markFirstSyncComplete(db: SyncExecutor): void {
  syncRepository.setState(db, FIRST_SYNC_KEY, FLAG_SET);
}

/**
 * The flag, applying the rule for a device that pre-dates it (see the header),
 * and persisting an adoption so the answer is stable across launches.
 */
export function resolveFirstSyncComplete(db: SyncExecutor): boolean {
  if (isFirstSyncComplete(db)) return true;
  if (readPullCursor(db) !== null) return false;
  if (!syncRepository.hasAnyRow(db)) return false;
  markFirstSyncComplete(db);
  return true;
}
