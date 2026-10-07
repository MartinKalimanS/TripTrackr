/**
 * The shared accessibility store behind `useAppearance` — contract C4-4, tasks.md T461.
 *
 * One module-level store holds the platform's accessibility flags for the whole app, so
 * that however many components call `useAppearance()` (every `Button` does, through
 * `useHaptics`; a list can mount thousands) the app registers ONE `AccessibilityInfo`
 * listener per event type and runs ONE read per signal.
 *
 * - Lazy and ref-counted: the native subscriptions and a read start when the first listener
 *   subscribes and are removed when the last one unsubscribes. Nothing runs at import, and a
 *   suite that mounts no consumer registers nothing.
 * - A stable snapshot: `getAppearanceSnapshot()` returns the same frozen object until a
 *   value changes, which is what `useSyncExternalStore` needs to skip a re-render, so a
 *   change event that re-reports the same flags wakes nobody.
 * - A late consumer needs no read of its own: the snapshot is current whenever the store is
 *   running, so its very first render already has the traveller's settings.
 * - Stale while revalidate: when the last listener leaves, only the native subscriptions
 *   stop; the snapshot (the flags AND `ready`) is kept. The next first listener re-reads at
 *   once and publishes only a result that differs. So a same-commit handover (one consumer
 *   out, another in), Fast Refresh and StrictMode's mount, clean up and mount again never
 *   flash the defaults, and `ready` never goes false again after the first read settles, for
 *   the life of the JavaScript runtime. The kept flags may be out of date after a stretch
 *   with no listener; the re-read corrects them as soon as the OS answers.
 *
 * What the flags mean, and the per-platform mapping, stay in `src/theme/accessibility.ts`.
 * The colour scheme and the font scale are per-component subscriptions and are composed in
 * `useAppearance`, not held here.
 */
import { AccessibilityInfo, Platform } from 'react-native';

import {
  accessibleFallbackFlags,
  appearanceChangeEvents,
  platformQueries,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
} from '@/theme/accessibility';

export interface AppearanceSnapshot {
  readonly prefersMoreContrast: boolean;
  readonly prefersLessMotion: boolean;
  readonly prefersLessTransparency: boolean;
  /**
   * True once the FIRST read has settled, whether it answered or failed (research D4-05).
   * Later change events never reset it, and neither does the store stopping and starting
   * again: it stays true for the life of the JavaScript runtime.
   */
  readonly ready: boolean;
}

type AccessibilityFlags = Omit<AppearanceSnapshot, 'ready'>;

/** What is known before the first read has answered. */
const UNREAD: AppearanceSnapshot = Object.freeze({
  prefersMoreContrast: false,
  prefersLessMotion: false,
  prefersLessTransparency: false,
  ready: false,
});

/** One subscriber. An object, so the same function subscribed twice counts twice. */
interface Entry {
  readonly listener: () => void;
}

let snapshot: AppearanceSnapshot = UNREAD;
const entries = new Set<Entry>();
/** Removes the native subscriptions of the running session; null while nobody listens. */
let stopSession: (() => void) | null = null;

/**
 * Reads the three signals. Each reader already falls back to the MORE accessible value when
 * its own query fails (contract C4), so null means the read as a whole failed (see `publish`
 * for what that means for the snapshot).
 */
async function readFlags(): Promise<AccessibilityFlags | null> {
  const os = Platform.OS;
  try {
    const [prefersMoreContrast, prefersLessMotion, prefersLessTransparency] =
      await Promise.all([
        readPrefersMoreContrast(os, platformQueries),
        readPrefersLessMotion(os, platformQueries),
        readPrefersLessTransparency(os, platformQueries),
      ]);
    return { prefersMoreContrast, prefersLessMotion, prefersLessTransparency };
  } catch {
    return null;
  }
}

/**
 * Settles a read, and always settles `ready`, so a failed read cannot hold the splash up for
 * good. A read that failed as a whole (`answered` is null) means:
 * - the FIRST read: nothing is known, so the flags fall back to the MORE accessible set
 *   (`accessibleFallbackFlags`, contract C4: never the less accessible rendering), not to
 *   the less accessible defaults;
 * - a LATER read: the flags there are were read from the platform, so they are kept.
 * Listeners hear about it only when something differs from the snapshot they already have.
 */
function publish(answered: AccessibilityFlags | null): void {
  const flags =
    answered ?? (snapshot.ready ? snapshot : accessibleFallbackFlags(Platform.OS));
  const unchanged =
    snapshot.ready &&
    flags.prefersMoreContrast === snapshot.prefersMoreContrast &&
    flags.prefersLessMotion === snapshot.prefersLessMotion &&
    flags.prefersLessTransparency === snapshot.prefersLessTransparency;
  if (unchanged) return;

  snapshot = Object.freeze({
    prefersMoreContrast: flags.prefersMoreContrast,
    prefersLessMotion: flags.prefersLessMotion,
    prefersLessTransparency: flags.prefersLessTransparency,
    ready: true,
  });
  notify();
}

/** Reports an error without unwinding the caller: it surfaces on its own tick, unhandled. */
function reportLater(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Tells everyone who is listening NOW. The round runs over a copy, so a listener that
 * subscribes during it hears the next round; one that was removed by an earlier listener in
 * this round is skipped; and one that throws cannot starve the rest.
 */
function notify(): void {
  for (const entry of [...entries]) {
    if (!entries.has(entry)) continue;
    try {
      entry.listener();
    } catch (error) {
      reportLater(error);
    }
  }
}

type NativeSubscription =
  ReturnType<typeof AccessibilityInfo.addEventListener> | undefined;

/**
 * Removes every subscription, whatever one of them does: a `remove()` that throws is
 * reported on its own tick and the rest are still removed.
 */
function removeAll(subscriptions: readonly NativeSubscription[]): void {
  for (const subscription of subscriptions) {
    try {
      subscription?.remove();
    } catch (error) {
      reportLater(error);
    }
  }
}

/**
 * Reads now and again on each change event, so the context updates live rather than only at
 * launch. The event names differ per platform (`appearanceChangeEvents`). Once stopped, a
 * session answers to nobody: a read still in flight is dropped, not published.
 *
 * Exception-safe: if a registration throws, the ones already made are removed, the session
 * is stopped and the error goes to the caller, so nothing is left half-started.
 */
function startSession(): () => void {
  let active = true;
  /** The id of the newest read; only that read may publish. */
  let latest = 0;
  const subscriptions: NativeSubscription[] = [];

  const stop = () => {
    active = false;
    removeAll(subscriptions);
  };

  const refresh = async () => {
    if (!active) return;
    const id = ++latest;
    const answered = await readFlags();
    // A newer read has started since: this answer may be older than what that one will say,
    // so it is dropped. `ready` still settles, from whichever read is the newest.
    if (active && id === latest) publish(answered);
  };

  try {
    void refresh();

    // The event's payload is ignored on purpose: every event re-reads all three signals, so a
    // payload for one signal can never be applied over another (no torn state).
    for (const event of appearanceChangeEvents(Platform.OS)) {
      subscriptions.push(
        AccessibilityInfo.addEventListener(
          event as Parameters<typeof AccessibilityInfo.addEventListener>[0],
          () => void refresh(),
        ),
      );
    }
  } catch (error) {
    stop();
    throw error;
  }

  return stop;
}

/** Ends the running session, if any. What it read stays: see "stale while revalidate". */
function stopNative(): void {
  const stop = stopSession;
  stopSession = null;
  stop?.();
}

/**
 * `useSyncExternalStore`'s `subscribe`. The first listener starts the native session; the
 * returned function (safe to call twice) ends it when the last listener has left.
 */
export function subscribeToAppearance(listener: () => void): () => void {
  const entry: Entry = { listener };
  // Started BEFORE the entry is added: a start that throws leaves nothing to roll back, and
  // no listener can be told before the first (asynchronous) read settles.
  if (stopSession === null) stopSession = startSession();
  entries.add(entry);

  return () => {
    if (!entries.delete(entry)) return;
    if (entries.size === 0) stopNative();
  };
}

/** `useSyncExternalStore`'s `getSnapshot`: the same object until a value changes. */
export function getAppearanceSnapshot(): AppearanceSnapshot {
  return snapshot;
}

/** `useSyncExternalStore`'s `getServerSnapshot`: nothing has been read on a server. */
export function getAppearanceServerSnapshot(): AppearanceSnapshot {
  return UNREAD;
}

/**
 * Test isolation only: removes the native subscriptions, forgets every listener and returns
 * the snapshot to the unread default, which is the one thing nothing else ever does. An
 * unsubscribe handed out before the reset is a no-op. Call it in `afterEach` of every suite
 * that mounts `useAppearance`, so isolation does not depend on the order of cleanup hooks.
 *
 * @internal Not part of the store's API: production code must never call it.
 */
export function __resetAppearanceStoreForTests(): void {
  entries.clear();
  stopNative();
  snapshot = UNREAD;
}
