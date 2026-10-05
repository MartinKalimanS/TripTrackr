/**
 * Conflict notice — tasks.md T133 (UI half; FR-040; sync-protocol.md §2).
 *
 * When a newer version replaces something the traveller wrote on this device,
 * the local row takes the winning content and the traveller is TOLD — a
 * silent overwrite of something they typed is exactly what FR-040 forbids.
 * The engine raises a `ConflictNotice` (`sync/conflicts.ts`) whose `summary`
 * is already a plain sentence; this component only presents them.
 *
 *   - One notice per overwrite, each dismissible with its own control.
 *     When the record belongs to a trip there is also a way to go and look.
 *   - A long queue stays manageable: three are shown in full, the rest are
 *     counted ("and 2 more") and can be cleared together. After a long trip
 *     offline a traveller may come back to many, and they must not bury the
 *     app.
 *   - It sits IN the flow above the app's content, never over it. Nothing is
 *     tinted, shadowed or laid across a map or a photograph (feature 002
 *     FR-024), and the region is a scroll container capped at a share of the
 *     screen so that at fontScale 1.8 the notices stay readable and the
 *     content below stays reachable (contract C13, FR-016).
 *   - Announced: a polite live region on Android, an explicit announcement on
 *     iOS (which has none), each notice once — dismissing one does not read
 *     the next aloud again.
 *
 * Mounted once, in the signed-in shell (`app/_layout.tsx`). Renders nothing
 * while there is nothing to tell, so it costs the layout nothing.
 */
import { useRouter } from 'expo-router';
import { useContext, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { CONFLICT_COPY, describeMoreNotices } from '@/features/sync/sync-copy';
import { announceWhereNoLiveRegion } from '@/hooks/use-announcement';
import { useConflictNotices, useConflictStore } from '@/sync/conflicts';
import type { ConflictNotice } from '@/sync/types';

/** Notices shown in full at once; the rest are counted. */
export const MAX_VISIBLE_NOTICES = 3;

export type ConflictNoticeBannerProps = {
  notice: ConflictNotice;
  onDismiss: () => void;
  /** Present only when there is somewhere to go (the notice belongs to a trip). */
  onOpenTrip?: () => void;
};

/** One notice: what happened, in words, and what the traveller can do about it. */
export function ConflictNoticeBanner({
  notice,
  onDismiss,
  onOpenTrip,
}: ConflictNoticeBannerProps) {
  const base = `conflict-notice-${notice.id}`;

  return (
    <Surface testID={base} treatment="raised" depth={1} radius="lg" style={styles.banner}>
      <ThemedText type="smallBold">{CONFLICT_COPY.heading}</ThemedText>
      <ThemedText type="small">{notice.summary}</ThemedText>
      <View style={styles.actions}>
        {onOpenTrip ? (
          <PressableSurface
            testID={`${base}-open`}
            accessibilityLabel={CONFLICT_COPY.openTripLabel}
            onPress={onOpenTrip}
            style={styles.action}>
            <ThemedText type="smallBold">{CONFLICT_COPY.openTrip}</ThemedText>
          </PressableSurface>
        ) : null}
        <PressableSurface
          testID={`${base}-dismiss`}
          accessibilityLabel={CONFLICT_COPY.dismissLabel}
          treatment="flat"
          onPress={onDismiss}
          style={styles.action}>
          <ThemedText type="smallBold">{CONFLICT_COPY.dismiss}</ThemedText>
        </PressableSurface>
      </View>
    </Surface>
  );
}

/** Says each notice aloud once, on the platform that has no live region to. */
function useAnnounceNewNotices(notices: readonly ConflictNotice[]): void {
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const fresh = notices.filter((notice) => !announced.current.has(notice.id));
    if (fresh.length === 0) return;
    for (const notice of fresh) announced.current.add(notice.id);
    announceWhereNoLiveRegion(
      [CONFLICT_COPY.heading, ...fresh.map((notice) => notice.summary)].join('. '),
    );
  }, [notices]);
}

/** "and 2 more", with the one control that clears them all. */
function OverflowRow({
  hidden,
  onDismissAll,
}: {
  hidden: number;
  onDismissAll: () => void;
}) {
  return (
    <View style={styles.overflow}>
      <ThemedText type="small" themeColor="textMuted">
        {describeMoreNotices(hidden)}
      </ThemedText>
      <PressableSurface
        accessibilityLabel={CONFLICT_COPY.dismissAllLabel}
        treatment="flat"
        onPress={onDismissAll}
        style={styles.action}>
        <ThemedText type="smallBold">{CONFLICT_COPY.dismissAll}</ThemedText>
      </PressableSurface>
    </View>
  );
}

/**
 * Where a notice can take the traveller, if anywhere. Having gone to look, the
 * notice has done its job and is cleared.
 */
function useTripOpener() {
  const router = useRouter();
  const dismiss = useConflictStore((state) => state.dismiss);

  return (notice: ConflictNotice): (() => void) | undefined => {
    const { tripId, id } = notice;
    if (tripId === null) return undefined;
    return () => {
      router.push(`/trip/${tripId}`);
      dismiss(id);
    };
  };
}

export function ConflictNotices() {
  const notices = useConflictNotices();
  const dismiss = useConflictStore((state) => state.dismiss);
  const clear = useConflictStore((state) => state.clear);
  const openTrip = useTripOpener();
  // Provided by expo-router at the root of the app; outside it (a component
  // test) there is no inset to honour, not an error to raise.
  const insets = useContext(SafeAreaInsetsContext);

  useAnnounceNewNotices(notices);

  if (notices.length === 0) return null;

  const visible = notices.slice(0, MAX_VISIBLE_NOTICES);
  const hidden = notices.length - visible.length;

  return (
    <ScrollView
      testID="conflict-notices"
      accessibilityLiveRegion="polite"
      style={styles.region}
      contentContainerStyle={[
        styles.stack,
        { paddingTop: Spacing.two + (insets?.top ?? 0) },
      ]}>
      {visible.map((notice) => (
        <ConflictNoticeBanner
          key={notice.id}
          notice={notice}
          onDismiss={() => dismiss(notice.id)}
          onOpenTrip={openTrip(notice)}
        />
      ))}
      {hidden > 0 ? <OverflowRow hidden={hidden} onDismissAll={clear} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A share of the screen, not all of it: the notices scroll inside it and the
  // app beneath always keeps room (C13).
  region: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: '40%',
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  stack: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  banner: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  overflow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
