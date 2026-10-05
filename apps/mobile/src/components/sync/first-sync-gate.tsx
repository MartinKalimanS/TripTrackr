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
 */
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { Surface } from '@/components/ui/surface';
import { Colors, Spacing } from '@/constants/theme';
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

function FirstSyncScreen({ view, busy, onRetry }: FirstSyncScreenProps) {
  const { theme, prefersLessMotion } = useAppearance();
  const { title, detail, retry } = PRESENTATION[view];
  const working = view === 'opening' || view === 'syncing';

  // `opening` is silent: it is a frame, not news.
  useAnnouncement(view === 'opening' ? null : [title, detail].join('. '), view);

  return (
    <Screen testID="first-sync-screen" style={styles.centred}>
      <Surface
        testID="first-sync-state"
        treatment="recessed"
        depth={1}
        radius="lg"
        accessibilityLiveRegion="polite"
        style={styles.card}>
        {working && !prefersLessMotion ? (
          <ActivityIndicator color={Colors[theme].accent} />
        ) : null}
        <ThemedText type="smallBold" style={styles.text}>
          {title}
        </ThemedText>
        {detail ? (
          <ThemedText type="small" themeColor="textMuted" style={styles.text}>
            {detail}
          </ThemedText>
        ) : null}
        {retry ? (
          <PressableSurface
            accessibilityLabel={FIRST_SYNC_COPY.retry}
            busy={busy}
            onPress={onRetry}
            style={styles.retry}>
            <ThemedText type="smallBold" style={styles.text}>
              {FIRST_SYNC_COPY.retry}
            </ThemedText>
          </PressableSurface>
        ) : null}
      </Surface>
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
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  text: { textAlign: 'center' },
  retry: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
