/**
 * Mounts the sync triggers for the signed-in shell — tasks.md T135.
 *
 * The root layout is the one place that knows both who is signed in and
 * whether their encrypted database is open, so it is where the engine, the
 * upload queue and the four triggers are bound (`startSyncTriggers`) and
 * where they are unbound: on sign-out, when the traveller changes, when the
 * database is replaced, and when the layout unmounts.
 *
 * Until BOTH exist nothing is bound — there is nothing to sync without a
 * database and nobody to sync it for. A signed-out shell also forgets that a
 * first-launch cycle was requested, so the next sign-in gets its own.
 */
import { useEffect } from 'react';

import type { AppDatabase } from '@/db/client';

import { resetFirstLaunch, startSyncTriggers } from './triggers';

export function useSyncTriggers(db: AppDatabase | null, userId: string | null): void {
  useEffect(() => {
    if (!userId) {
      resetFirstLaunch();
      return;
    }
    if (!db) return;
    return startSyncTriggers({ db, userId });
  }, [db, userId]);
}
