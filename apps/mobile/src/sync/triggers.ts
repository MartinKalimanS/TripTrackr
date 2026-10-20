/**
 * The four sync triggers — tasks.md T135 (FR-038; sync-protocol.md §3).
 *
 * The engine knows HOW to run a cycle; this file knows WHEN one is wanted:
 *
 *   - every 30 s while the app is in the foreground  → `syncNow('timer')`
 *   - connectivity restored (offline → online)       → `syncNow('reconnect')`
 *   - the app comes back to the foreground           → `syncNow('foreground')`
 *   - the first launch after a sign-in               → `syncNow('first-launch')`
 *
 * The fifth row of the table, sign-out, belongs to the sign-out guard
 * (`features/auth/use-sign-out.ts`). Reconnect and foreground also nudge the
 * upload queue, because a photo's bytes travel on their own channel and are
 * the definition of "saved" (FR-041). A first launch nudges it too: an upload
 * interrupted by the app being killed must resume on the next run, or
 * "100% of offline content reaches the server" (SC-009) would depend on the
 * traveller happening to go offline and online again.
 *
 * Nothing here queues work. `syncNow` is single-flight, so a trigger that fires
 * while a cycle runs joins it; all this file has to guarantee is that it never
 * fires more than the table says — one timer at most, one request per
 * offline → online transition, one first launch per sign-in — and that none of
 * it outlives the signed-in shell that started it.
 *
 * expo-network is used as documented for SDK 57
 * (https://docs.expo.dev/versions/v57.0.0/sdk/network/): `getNetworkStateAsync`
 * seeds the state and `addNetworkStateListener` reports changes. On iOS
 * `isInternetReachable` always equals `isConnected`; on Android it is the
 * stricter of the two (a Wi-Fi network with no route out is connected but not
 * reachable), so reachability decides whenever the platform reports it.
 */
import { addNetworkStateListener, getNetworkStateAsync } from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

import type { AppDatabase } from '@/db/client';
import { Sentry } from '@/lib/sentry';

import { startSyncEngine, syncNow } from './engine';
import type { SyncReason } from './types';
import { kickUploadQueue, startUploadQueue } from './upload-queue';

/** sync-protocol.md §3: "Every 30s while foregrounded". */
export const SYNC_INTERVAL_MS = 30_000;

export interface SyncTriggerOptions {
  /** The signed-in traveller's open, migrated database. */
  db: AppDatabase;
  /** Whose sign-in this is; the first-launch cycle is once per sign-in. */
  userId: string;
}

/**
 * The traveller a first-launch cycle has already been asked for. Module-level
 * on purpose: React may restart the triggers (a retried store open, Fast
 * Refresh, StrictMode) without the traveller having signed in again, and none
 * of those is a "first launch".
 */
let firstLaunchFor: string | null = null;

/** Forget it — the traveller signed out, so their next sign-in is a first launch. */
export function resetFirstLaunch(): void {
  firstLaunchFor = null;
}

/**
 * Same definition as `useAppActive`: `inactive` (iOS mid-transition) is away
 * too, and an unknown state at launch counts as foreground.
 */
function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

/**
 * Online means a connection that can reach the internet. `isConnected` is the
 * floor; `isInternetReachable`, where the platform reports it, is the ceiling.
 */
function isOnline(state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}): boolean {
  const connected = state.isConnected ?? state.isInternetReachable;
  return connected === true && state.isInternetReachable !== false;
}

function report(error: unknown): void {
  Sentry.captureException(error);
}

/** At most one interval: starting while one runs, or stopping when none does, is a no-op. */
function createForegroundTimer(onTick: () => void) {
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    start() {
      if (timer === null) timer = setInterval(onTick, SYNC_INTERVAL_MS);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
  };
}

/**
 * Reports each move between foreground and away — never a repeat of the state
 * the app is already in. Returns where the app is now, and how to stop.
 */
function watchForeground(onChange: (foreground: boolean) => void) {
  let foreground = isForeground(AppState.currentState);
  const subscription = AppState.addEventListener('change', (next) => {
    const now = isForeground(next);
    if (now === foreground) return;
    foreground = now;
    onChange(now);
  });
  return { foreground, remove: () => subscription.remove() };
}

/**
 * Reports each offline → online transition and nothing else. `null` until the
 * platform has said anything: an unknown state is not an offline one, so the
 * first real reading is never mistaken for a reconnect.
 */
function watchReconnect(onReconnect: () => void): () => void {
  let stopped = false;
  let online: boolean | null = null;

  const subscription = addNetworkStateListener((state) => {
    if (stopped) return;
    const wasOffline = online === false;
    online = isOnline(state);
    if (wasOffline && online) onReconnect();
  });

  getNetworkStateAsync()
    .then((state) => {
      // An event that got here first is newer than this reading.
      if (!stopped && online === null) online = isOnline(state);
    })
    .catch(report);

  return () => {
    stopped = true;
    subscription.remove();
  };
}

/**
 * Bind the engine and the upload queue to `db` and start watching for the four
 * triggers. Returns the function that undoes all of it.
 */
export function startSyncTriggers({ db, userId }: SyncTriggerOptions): () => void {
  let stopped = false;
  const stopEngine = startSyncEngine(db);
  const stopQueue = startUploadQueue(db);

  const requestCycle = (reason: SyncReason) => {
    if (!stopped) syncNow(reason).catch(report);
  };
  const nudgeQueue = (reason: SyncReason) => {
    if (!stopped) kickUploadQueue(reason).catch(report);
  };
  const requestBoth = (reason: SyncReason) => {
    requestCycle(reason);
    nudgeQueue(reason);
  };

  const timer = createForegroundTimer(() => requestCycle('timer'));
  const app = watchForeground((foreground) => {
    if (stopped) return;
    if (!foreground) return timer.stop();
    timer.start();
    requestBoth('foreground');
  });
  const stopNetwork = watchReconnect(() => requestBoth('reconnect'));

  if (app.foreground) timer.start();
  if (firstLaunchFor !== userId) {
    firstLaunchFor = userId;
    requestBoth('first-launch');
  }

  return () => {
    if (stopped) return;
    stopped = true;
    timer.stop();
    app.remove();
    stopNetwork();
    stopQueue();
    stopEngine();
  };
}
