/**
 * First-sync state — tasks.md T136 (FR-042; sync-protocol.md §1, §6 scenario 7).
 *
 * A gate, not a route. tasks.md names `(tabs)/syncing.tsx`, but a file in
 * `(tabs)` becomes a tab of its own, and sending the traveller to it would
 * mean a redirect on the way in and another on the way out — each a chance to
 * flash the wrong screen, and a deep link to a tab would land on nothing in
 * between. As a gate it simply takes the tab navigator's place until the
 * first snapshot has arrived: there is no tab bar to tap, no empty list to
 * look at, and the instant `firstSyncComplete` flips the real tabs mount.
 *
 * What the traveller sees, and never anything blank:
 *
 *   opening       the moment before the engine has said anything — the same
 *                 words as the store gate, so a device that already has its
 *                 data passes through without a "syncing" claim it did not earn
 *   syncing       a full snapshot is on its way; no made-up progress figure
 *   offline       "connect to load your trips", with a retry — an ordinary
 *                 state, not an error
 *   failed        calm copy and a retry
 *   session-ended the session went; there is nothing to retry
 *
 * The engine owns `firstSyncComplete`; this component only reads it.
 * The grace period exists because the engine binds in an effect, after the
 * first frame: for a few milliseconds a device that HAS its data reads
 * "not complete" too, and showing "syncing" for that long would be a small
 * lie followed by a flash. A known failure skips the wait.
 *
 * Accessibility (feature 002 C13): `Screen` is the scroll container, so the
 * state and its retry stay reachable at fontScale 1.8; the card is a polite
 * live region (Android) and each change is announced explicitly (iOS, which
 * has none); the spinner is omitted under reduced motion; no colour is
 * literal and no text is truncated.
 *
 * On the Atlas state views (T449; 004 FR-005, FR-025, FR-030, FR-035): the working states
 * are a `LoadingState` (one `progressbar` named by its title, the detail its value text,
 * a centred spinner); offline and session-ended are a neutral `EmptyState` with a glyph
 * (an ordinary state is not an error); a failed sync is an `ErrorState` (words, alert
 * icon, danger ink). The retry is the state's only control and a secondary one (FR-005),
 * announced busy and inert while its cycle runs. The surface keeps its id
 * (`first-sync-state`) and its polite live region; the words, the announcements and the
 * grace period are the engine's and are not touched.
 */
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { FIRST_SYNC_COPY } from '@/features/sync/sync-copy';
import { announceWhereNoLiveRegion, useAnnouncement } from '@/hooks/use-announcement';
import { useAppearance } from '@/hooks/use-appearance';
import { Sentry } from '@/lib/sentry';
import { syncNow, useSyncStatus } from '@/sync/engine';
import type { SyncStatus } from '@/sync/types';

/**
 * How long a device with no failure to report waits, reading "opening", for
 * the engine to confirm the first sync is already done. Long enough for the
 * engine's one local read; short enough that a brand-new device is not kept
 * from its "syncing" state.
 */
export const FIRST_SYNC_GRACE_MS = 400;

export type FirstSyncView =
  'opening' | 'syncing' | 'offline' | 'failed' | 'session-ended';

/** Which state the traveller is in. Pure, so every branch is testable without a screen. */
export function firstSyncView(
  status: Pick<SyncStatus, 'failure'>,
  settled: boolean,
): FirstSyncView {
  switch (status.failure) {
    case 'offline':
      return 'offline';
    case 'unauthorized':
      return 'session-ended';
    case 'server':
    case 'invalid_response':
      return 'failed';
    default:
      return settled ? 'syncing' : 'opening';
  }
}

type Presentation = { title: string; detail: string | null; retry: boolean };

const PRESENTATION: Record<FirstSyncView, Presentation> = {
  opening: { title: FIRST_SYNC_COPY.opening, detail: null, retry: false },
  syncing: { ...FIRST_SYNC_COPY.syncing, retry: false },
  offline: { ...FIRST_SYNC_COPY.offline, retry: true },
  failed: { ...FIRST_SYNC_COPY.failed, retry: true },
  'session-ended': { ...FIRST_SYNC_COPY.sessionEnded, retry: false },
};

function useSettled(delayMs: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return settled;
}

function useManualRetry() {
  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    setRetrying(true);
    syncNow('manual')
      .catch((error: unknown) => Sentry.captureException(error))
      .finally(() => setRetrying(false));
  };
  return { retrying, retry };
}

type FirstSyncScreenProps = { view: FirstSyncView; busy: boolean; onRetry: () => void };

const OFFLINE: IconName = { ios: 'wifi.slash', android: 'wifi_off' };
const SIGNED_OUT: IconName = { ios: 'person.crop.circle', android: 'account_circle' };

/** The surface every state shares: the id a flow waits on and the polite live region. */
const SURFACE = {
  testID: 'first-sync-state',
  accessibilityLiveRegion: 'polite',
} as const;

/** The state the traveller is in, on the Atlas state view that fits it. */
function FirstSyncState({ view, busy, onRetry }: FirstSyncScreenProps) {
  const { prefersLessMotion } = useAppearance();
  const { title, detail, retry } = PRESENTATION[view];
  const words = { title, detail: detail ?? undefined, ...SURFACE };
  const action = retry
    ? { label: FIRST_SYNC_COPY.retry, onPress: onRetry, busy }
    : undefined;

  if (view === 'opening' || view === 'syncing') {
    return <LoadingState {...words} spinner={!prefersLessMotion} />;
  }
  if (view === 'failed') {
    return (
      <ErrorState {...words} onRetry={retry ? onRetry : undefined} retryBusy={busy} />
    );
  }
  return (
    <EmptyState
      {...words}
      icon={view === 'offline' ? OFFLINE : SIGNED_OUT}
      action={action}
    />
  );
}

function FirstSyncScreen(props: FirstSyncScreenProps) {
  const { title, detail } = PRESENTATION[props.view];

  // `opening` is silent: it is a frame, not news.
  useAnnouncement(
    props.view === 'opening' ? null : [title, detail].join('. '),
    props.view,
  );

  return (
    <Screen testID="first-sync-screen" style={styles.centred}>
      <FirstSyncState {...props} />
    </Screen>
  );
}

export function FirstSyncGate({ children }: PropsWithChildren) {
  const status = useSyncStatus();
  const settled = useSettled(FIRST_SYNC_GRACE_MS);
  const { retrying, retry } = useManualRetry();
  const view = firstSyncView(status, settled);

  // Once the tabs are up they stay up for as long as this gate does. The
  // engine clears its status when it unbinds, which on sign-out happens a
  // moment before this layout is unmounted; reading that as "not synced yet"
  // would flash the syncing state over a traveller who is leaving.
  const [completed, setCompleted] = useState(false);
  if (status.firstSyncComplete && !completed) setCompleted(true);
  const complete = status.firstSyncComplete || completed;

  // Only a traveller who actually waited is told the wait is over.
  const waited = useRef(false);
  useEffect(() => {
    if (!status.firstSyncComplete) {
      if (view !== 'opening') waited.current = true;
    } else if (waited.current) {
      announceWhereNoLiveRegion(FIRST_SYNC_COPY.ready);
      waited.current = false;
    }
  }, [status.firstSyncComplete, view]);

  if (complete) return <>{children}</>;

  return (
    <FirstSyncScreen
      view={view}
      busy={retrying || status.phase !== 'idle'}
      onRetry={retry}
    />
  );
}

const styles = StyleSheet.create({
  centred: { justifyContent: 'center' },
});
