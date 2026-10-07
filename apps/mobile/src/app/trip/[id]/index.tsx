/**
 * Trip overview and stops editor — tasks.md T068, 004 T431 (FR-010–FR-013, FR-015;
 * 004 FR-007, FR-013, FR-029, FR-035).
 *
 * Everything on this screen is read from and written to the encrypted local
 * store; the stops list is a live query so a write shows up the moment SQLite
 * commits it (Constitution II). The status chip is derived from the stops on
 * every render (FR-013). `useLocalSearchParams` is the v57 hook for a screen's
 * own params (https://docs.expo.dev/router/reference/url-parameters.md).
 *
 * Under a native header (`_layout.tsx`: the Back control and no title), so the screen
 * is `underHeader` and has no bar of its own. Top to bottom:
 *
 * 1. The hero: the trip's title as a large title (it is the screen's heading, FR-007), and
 *    one row (`trip-header-row`) with the derived status, the home currency and, while the
 *    trip only exists on this device, the pending marker.
 * 2. The five areas as ONE row of icon chips that scrolls sideways (`trip-links`; 003
 *    FR-018) and bleeds to the screen edges, so the next chip peeks in. Nothing wraps and
 *    nothing is capped, so the row is still reachable at the largest text size.
 * 3. "Stops": a heading and a secondary "Add stop" (the only control of its weight; the
 *    screen has no primary), then the timeline, or its loading, empty or error state.
 *
 * 003 FR-018 asked for Back and the status on ONE row; 004 FR-007 and FR-008 moved Back
 * into the native header, so the status row is now the one beneath the title.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  StopEditor,
  type StopEditorMode,
  type StopEditorValues,
} from '@/components/trip/stop-editor';
import { StopList } from '@/components/trip/stop-list';
import { describePlace } from '@/components/trip/stop-row';
import { Button } from '@/components/ui/button';
import { Chip, StatusChip } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import {
  EmptyState,
  ErrorState,
  ListSkeleton,
  LoadingState,
} from '@/components/ui/state-view';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { deriveTripStatus } from '@/features/trips/trip-status';
import { useTrip, useTripActions, useTripStops } from '@/features/trips/use-trips';
import { useWriteAttempt } from '@/hooks/use-write-attempt';
import { AtlasSpacing } from '@/theme';

/**
 * A dynamic segment can arrive as an array when the same key appears twice in
 * a URL. A trip has one id, so the first wins rather than the screen crashing
 * on `.length`.
 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const WRITE_FAILED = 'That change could not be saved on this device. Please try again.';

type Editor = { mode: StopEditorMode; stopId: string | null } | null;

/**
 * Where the rest of a trip lives, each its own screen: the daily-use loop
 * (US2), photos and travel documents (US5), and preparing to travel (US4).
 * Shown as one row that scrolls sideways (feature 003 FR-018) rather than
 * wrapping into rows of large buttons.
 */
const TRIP_LINKS: readonly {
  segment: string;
  label: string;
  text: string;
  icon: IconName;
}[] = [
  {
    segment: 'notes',
    label: 'Notes for this trip',
    text: 'Notes',
    icon: { ios: 'note.text', android: 'sticky_note_2' },
  },
  {
    segment: 'expenses',
    label: 'Spending for this trip',
    text: 'Spending',
    icon: { ios: 'creditcard', android: 'payments' },
  },
  {
    segment: 'photos',
    label: 'Photos for this trip',
    text: 'Photos',
    icon: { ios: 'photo', android: 'photo_library' },
  },
  {
    segment: 'documents',
    label: 'Travel documents for this trip',
    text: 'Documents',
    icon: { ios: 'doc.text', android: 'description' },
  },
  {
    segment: 'offline-maps',
    label: 'Offline maps for this trip',
    text: 'Offline maps',
    icon: { ios: 'map', android: 'map' },
  },
];

const ADD: IconName = { ios: 'plus', android: 'add' };

function TripLinks({ tripId }: { tripId: string }) {
  const router = useRouter();
  return (
    <ScrollView
      testID="trip-links"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.linksBleed}
      contentContainerStyle={styles.links}>
      {TRIP_LINKS.map(({ segment, label, text, icon }) => (
        <Chip
          key={segment}
          testID={`trip-open-${segment}`}
          label={text}
          leading={icon}
          accessibilityLabel={label}
          onPress={() => router.push(`/trip/${tripId}/${segment}`)}
        />
      ))}
    </ScrollView>
  );
}

function TripHero({ trip, stops }: { trip: TripRow; stops: readonly StopWithPlace[] }) {
  return (
    <View className="gap-3">
      <Text type="largeTitle" testID="trip-title">
        {trip.title}
      </Text>
      <View testID="trip-header-row" className="flex-row flex-wrap items-center gap-2">
        <StatusChip status={deriveTripStatus(stops)} />
        <Text type="callout" tone="muted">
          {trip.home_currency}
        </Text>
        {trip.is_dirty ? <SyncBadge state="pending" /> : null}
      </View>
    </View>
  );
}

/** What stands in for the trip until there is one: reading, unreadable, or not here. */
function TripPlaceholder({ loading, failed }: { loading: boolean; failed: boolean }) {
  if (loading) return <LoadingState title="Loading trip" />;
  if (failed) {
    return (
      <ErrorState
        title="Couldn’t read this trip"
        detail="The local store did not answer."
      />
    );
  }
  return (
    <EmptyState
      title="This trip isn’t on this device"
      detail="It may have been removed, or it has not synced here yet."
    />
  );
}

type StopsBodyProps = {
  stops: ReturnType<typeof useTripStops>;
  onMove: (stopId: string, direction: 'up' | 'down') => void;
  onReorder: (orderedIds: string[]) => void;
  onEdit: (stop: StopWithPlace) => void;
  onRemove: (stop: StopWithPlace) => void;
};

/** The timeline, or the designed state that stands in for it. */
function StopsBody({ stops, ...handlers }: StopsBodyProps) {
  if (stops.error) {
    return (
      <ErrorState
        title="Couldn’t read the stops"
        detail="The local store did not answer."
      />
    );
  }
  if (stops.loading) return <ListSkeleton variant="row" rows={2} label="Loading stops" />;
  if (stops.data.length === 0) {
    return (
      <EmptyState
        title="No stops yet"
        detail="Add the first city you are going to, with its dates."
      />
    );
  }
  return <StopList stops={stops.data} {...handlers} />;
}

/** Asks first: a removed stop is a tombstone the server will apply. */
function confirmRemove(stop: StopWithPlace, remove: () => void) {
  Alert.alert(`Remove ${describePlace(stop)}?`, 'The stop is removed from this trip.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: remove },
  ]);
}

/**
 * Every write this screen makes. Local writes are synchronous; a failure is reported to
 * Sentry AND shown (`writeError`), never dropped, and the next attempt clears it.
 */
function useStopWrites(tripId: string) {
  const actions = useTripActions();
  const { writeError, attempt } = useWriteAttempt(WRITE_FAILED);

  return {
    writeError,
    move: (stopId: string, direction: 'up' | 'down') =>
      attempt(() => actions.moveStop(stopId, direction)),
    reorder: (orderedIds: string[]) =>
      attempt(() => actions.reorderStops(tripId, orderedIds)),
    remove: (stop: StopWithPlace) =>
      confirmRemove(stop, () => attempt(() => actions.removeStop(stop.id))),
    /** `stopId` null adds a stop to the trip; otherwise it moves that stop's dates. */
    save: (stopId: string | null, values: StopEditorValues) =>
      attempt(() => {
        if (stopId) {
          actions.updateStopDates(stopId, values);
        } else {
          actions.addStop({ trip_id: tripId, ...values });
        }
      }),
  };
}

/** Which stop editor is open, if any: a new stop after the last, or one stop's dates. */
function useStopEditor(
  stops: readonly StopWithPlace[],
  save: (stopId: string | null, values: StopEditorValues) => void,
) {
  const [editor, setEditor] = useState<Editor>(null);

  return {
    editor,
    openAdd: () =>
      setEditor({
        mode: { kind: 'add', previousStop: stops[stops.length - 1] ?? null },
        stopId: null,
      }),
    openEdit: (stop: StopWithPlace) =>
      setEditor({
        mode: { kind: 'edit', stop, placeName: describePlace(stop) },
        stopId: stop.id,
      }),
    close: () => setEditor(null),
    submit: (values: StopEditorValues) => {
      const current = editor;
      setEditor(null);
      if (current) save(current.stopId, values);
    },
  };
}

function TripDetails({ trip }: { trip: TripRow }) {
  const stops = useTripStops(trip.id);
  const writes = useStopWrites(trip.id);
  const editing = useStopEditor(stops.data, writes.save);

  return (
    <>
      <TripHero trip={trip} stops={stops.data} />
      <TripLinks tripId={trip.id} />

      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text type="headline" accessibilityRole="header">
          Stops
        </Text>
        <Button
          testID="trip-add-stop"
          variant="secondary"
          size="sm"
          icon={ADD}
          accessibilityLabel="Add stop"
          onPress={editing.openAdd}>
          Add stop
        </Button>
      </View>

      <StopsBody
        stops={stops}
        onMove={writes.move}
        onReorder={writes.reorder}
        onEdit={editing.openEdit}
        onRemove={writes.remove}
      />

      <InlineError testID="trip-write-error" message={writes.writeError} />

      {editing.editor ? (
        <StopEditor
          visible
          mode={editing.editor.mode}
          onCancel={editing.close}
          onSubmit={editing.submit}
        />
      ) : null}
    </>
  );
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const trip = useTrip(firstParam(id) ?? '');

  return (
    <Screen testID="trip-screen" underHeader>
      {trip.data ? (
        <TripDetails trip={trip.data} />
      ) : (
        <TripPlaceholder loading={trip.loading} failed={trip.error !== null} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // The row bleeds into the screen's own side padding (`Screen`: `Spacing.four`) so a chip
  // is cut by the screen edge, not by an invisible one 24 dp inside it, and gives its
  // content that padding back so the first chip lines up with the title. The vertical room
  // is for the focus ring a chip draws outside itself, which a scroller would clip.
  linksBleed: {
    marginHorizontal: -Spacing.four,
  },
  links: {
    flexDirection: 'row',
    gap: AtlasSpacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: AtlasSpacing.one,
  },
});
