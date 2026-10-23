/**
 * What stands in for the pieces of the trip screen until they exist - tasks.md T546 (spec
 * FR-042, FR-043, FR-064; contract C5-31): the trip itself (a skeleton shaped like the screen,
 * an error in words, or "not here", which names the way back as T559 asks of every empty
 * state), and the stops (a skeleton, an error, a ghost stamp for a trip with none, or the
 * timeline with its dashed "Add stop" row at the end).
 *
 * The error comes first: a live read that fails can still report `loading` (its first-result
 * timestamp never arrives), and the words must win over the skeleton. A screen never shows its
 * empty state while its first read is resolving.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedPill, type SegmentOption } from '@/components/ui/segmented-pill';
import { StopsSkeleton, TripDetailSkeleton } from '@/components/ui/screen-skeletons';
import { GhostStamp } from '@/components/ui/stamp';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { LiveResult } from '@/features/trips/use-trips';
import { Space } from '@/theme';

import { AddStopRow } from './add-stop-row';
import { StopList, type StopListProps } from './stop-list';

/** Room for the native header (44 dp on iOS, 56 on Android) over a state that has no hero. */
const HEADER_ROOM = Space[10] + Space[4];

/**
 * What stands in for the trip until there is one: reading it (a skeleton shaped like the
 * screen), unreadable, or not here. The header is transparent, so the states keep clear of it.
 */
export function TripPlaceholder({
  loading,
  failed,
}: {
  loading: boolean;
  failed: boolean;
}) {
  const router = useRouter();
  if (!failed && loading) {
    return (
      <View testID="trip-screen" className="flex-1 bg-background">
        <TripDetailSkeleton />
      </View>
    );
  }
  return (
    <Screen testID="trip-screen" style={{ paddingTop: HEADER_ROOM }}>
      {failed ? (
        <ErrorState
          title="Couldn’t read this trip"
          detail="The local store did not answer."
        />
      ) : (
        <EmptyState
          title="This trip isn’t on this device"
          detail="It may have been removed, or it has not synced here yet."
          action={{
            label: 'Back to your trips',
            testID: 'trip-missing-back',
            onPress: () =>
              router.canGoBack() ? router.back() : router.replace('/trips'),
          }}
        />
      )}
    </Screen>
  );
}

/** The pictured toggle is 136 dp wide (`.seg` in `build.py`); it grows with the text, never shrinks. */
const VIEW_TOGGLE_WIDTH = 136;

const LIST_OPTION: SegmentOption = {
  key: 'list',
  label: 'List',
  testID: 'trip-stops-view-list',
  accessibilityLabel: 'List',
};

const MAP_OPTION: SegmentOption = {
  key: 'map',
  label: 'Map',
  testID: 'coming-soon-trip-map',
  accessibilityLabel: 'Map',
  accessibilityHint: COMING_SOON_HINT,
};

const VIEW_OPTIONS = [LIST_OPTION, MAP_OPTION] as const;

/**
 * The pictured List / Map toggle. The trip has no map view of its own (the globe is the one
 * map), so it is a coming-soon control (Q-11): List is what is shown, Map shows one toast.
 */
function StopsViewToggle() {
  const soon = useComingSoon('Map view');
  return (
    <View testID="trip-stops-view-box" style={{ minWidth: VIEW_TOGGLE_WIDTH }}>
      <SegmentedPill
        testID="trip-stops-view"
        role="radiogroup"
        size="sm"
        accessibilityLabel="Stops view"
        options={VIEW_OPTIONS}
        selectedKey="list"
        onSelect={(key) => {
          if (key === 'map') soon();
        }}
      />
    </View>
  );
}

/** "Stops", how many there are, and the toggle: the heading of the timeline (`.sec-cap`). */
export function StopsHeader({ count }: { count: number }) {
  return (
    <View
      testID="trip-stops-head"
      className="flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <View className="flex-row items-baseline gap-2">
        <Text variant="headline" accessibilityRole="header">
          Stops
        </Text>
        <Text variant="headline" tone="muted" testID="trip-stops-count">
          {count}
        </Text>
      </View>
      <StopsViewToggle />
    </View>
  );
}

const STAMP = 96;
/** The prototype draws the 24 dp plane at 2x in a 120 unit stamp: 48 / 120 of 96 dp. */
const PLANE_SCALE = 1.6;

/** The ghost stamp of a trip with no stops: the dashed rings with a plane in the middle. */
function GhostPlane() {
  return (
    <View
      style={{
        width: STAMP,
        height: STAMP,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View style={StyleSheet.absoluteFill}>
        <GhostStamp size={STAMP} />
      </View>
      <View
        testID="trip-empty-plane"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ transform: [{ scale: PLANE_SCALE }] }}>
        <Icon name="plane" size={24} tone="subtle" />
      </View>
    </View>
  );
}

/** A trip with no stops: a ghost stamp, the words, and the one primary action of the screen. */
export function ZeroStops({ onAdd }: { onAdd: () => void }) {
  return (
    <View className="items-center gap-2 px-4 py-6" testID="trip-empty">
      <View className="mb-2">
        <GhostPlane />
      </View>
      <Text variant="callout" className="text-center">
        No stops yet
      </Text>
      <Text
        variant="label"
        tone="muted"
        className="max-w-[280px] text-center"
        testID="trip-empty-detail">
        Add the first city you are going to, with its dates.
      </Text>
      <Button
        testID="trip-add-stop"
        variant="primary"
        icon="plus"
        accessibilityLabel="Add stop"
        className="mt-3"
        onPress={onAdd}>
        Add stop
      </Button>
    </View>
  );
}

export type StopsBodyProps = {
  stops: LiveResult<StopWithPlace[]>;
  onAdd: () => void;
} & Omit<StopListProps, 'stops'>;

/** The timeline, or the designed state that stands in for it. */
export function StopsBody({ stops, onAdd, ...list }: StopsBodyProps) {
  if (stops.error) {
    return (
      <ErrorState
        title="Couldn’t read the stops"
        detail="The local store did not answer."
      />
    );
  }
  if (stops.loading) return <StopsSkeleton />;
  if (stops.data.length === 0) return <ZeroStops onAdd={onAdd} />;
  return (
    <>
      <StopList stops={stops.data} {...list} />
      <AddStopRow onPress={onAdd} />
    </>
  );
}
