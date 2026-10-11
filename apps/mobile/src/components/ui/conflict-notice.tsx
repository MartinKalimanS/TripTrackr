/**
 * Conflict notice — tasks.md T133 (UI half; FR-040; sync-protocol.md §2); restyled for
 * Atlas by T449 (004 FR-005, FR-024, FR-025, FR-030, FR-035).
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
 * Each notice is a banner: a raised `Card` with a sync glyph beside the heading, the
 * engine's sentence in plain words, and its controls as buttons that wrap (never
 * primary: a notice is news, not a task, FR-005). The card announces nothing of its own;
 * the region around the banners is the polite live region, as it was. It is a banner in
 * the flow and not a transient toast: a toast leaves by itself, and FR-040 is that the
 * traveller is told, so a notice stays until it is dismissed or looked at.
 *
 * Mounted once, in the signed-in shell (`app/_layout.tsx`). Renders nothing
 * while there is nothing to tell, so it costs the layout nothing.
 */
import { useRouter } from 'expo-router';
import { useContext, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MaxContentWidth } from '@/constants/theme';
import { CONFLICT_COPY, describeMoreNotices } from '@/features/sync/sync-copy';
import { announceWhereNoLiveRegion } from '@/hooks/use-announcement';
import { useConflictNotices, useConflictStore } from '@/sync/conflicts';
import type { ConflictNotice } from '@/sync/types';
import { AtlasSpacing } from '@/theme';

/** Notices shown in full at once; the rest are counted. */
export const MAX_VISIBLE_NOTICES = 3;

/** Something changed here because of another device. */
const UPDATED: IconName = { ios: 'arrow.triangle.2.circlepath', android: 'sync' };

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
    <Card testID={base} className="gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name={UPDATED} size={20} tone="accent" testID={`${base}-icon`} />
        <Text type="headline" className="shrink">
          {CONFLICT_COPY.heading}
        </Text>
      </View>
      <Text type="callout">{notice.summary}</Text>
      <View className="flex-row flex-wrap gap-2">
        {onOpenTrip ? (
          <Button
            variant="secondary"
            size="sm"
            testID={`${base}-open`}
            accessibilityLabel={CONFLICT_COPY.openTripLabel}
            onPress={onOpenTrip}>
            {CONFLICT_COPY.openTrip}
          </Button>
        ) : null}
        <Button
          variant="text"
          size="sm"
          testID={`${base}-dismiss`}
          accessibilityLabel={CONFLICT_COPY.dismissLabel}
          onPress={onDismiss}>
          {CONFLICT_COPY.dismiss}
        </Button>
      </View>
    </Card>
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
    <View className="flex-row flex-wrap items-center justify-between gap-2">
      <Text type="callout" tone="muted">
        {describeMoreNotices(hidden)}
      </Text>
      <Button
        variant="text"
        size="sm"
        accessibilityLabel={CONFLICT_COPY.dismissAllLabel}
        onPress={onDismissAll}>
        {CONFLICT_COPY.dismissAll}
      </Button>
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
        { paddingTop: AtlasSpacing.two + (insets?.top ?? 0) },
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
    gap: AtlasSpacing.two,
    paddingHorizontal: AtlasSpacing.three,
    paddingBottom: AtlasSpacing.two,
  },
});
