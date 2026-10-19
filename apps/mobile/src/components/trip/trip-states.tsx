/**
 * What stands in for the pieces of the trip screen until they exist - tasks.md T546 (spec
 * FR-042, FR-043, FR-064; contract C5-31): the trip itself (a skeleton shaped like the screen,
 * an error in words, or "not here"), and the stops (a skeleton, an error, a ghost stamp for a
 * trip with none, or the timeline with its dashed "Add stop" row at the end).
 *
 * The error comes first: a live read that fails can still report `loading` (its first-result
 * timestamp never arrives), and the words must win over the skeleton. A screen never shows its
 * empty state while its first read is resolving.
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { TripDetailSkeleton } from '@/components/ui/screen-skeletons';
import { GhostStamp } from '@/components/ui/stamp';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/state-view';
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
        />
      )}
    </Screen>
  );
}

/** "Stops" and how many there are, as the heading of the timeline. */
export function StopsHeader({ count }: { count: number }) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text variant="headline" accessibilityRole="header">
        Stops
      </Text>
      <Text variant="headline" tone="muted" testID="trip-stops-count">
        {count}
      </Text>
    </View>
  );
}

/** A trip with no stops: a ghost stamp, the words, and the one primary action of the screen. */
export function ZeroStops({ onAdd }: { onAdd: () => void }) {
  return (
    <View className="items-center gap-3 py-6" testID="trip-empty">
      <GhostStamp size={96} />
      <Text variant="callout" className="text-center">
        No stops yet
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        Add the first city you are going to, with its dates.
      </Text>
      <Button
        testID="trip-add-stop"
        variant="primary"
        icon="plus"
        accessibilityLabel="Add stop"
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
  if (stops.loading) return <ListSkeleton variant="row" rows={2} label="Loading stops" />;
  if (stops.data.length === 0) return <ZeroStops onAdd={onAdd} />;
  return (
    <>
      <StopList stops={stops.data} {...list} />
      <AddStopRow onPress={onAdd} />
    </>
  );
}
