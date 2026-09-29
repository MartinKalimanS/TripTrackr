/**
 * Trip overview and stops editor — tasks.md T068 (FR-010–FR-013, FR-015).
 *
 * Everything on this screen is read from and written to the encrypted local
 * store; the stops list is a live query so a write shows up the moment SQLite
 * commits it (Constitution II). The status pill is derived from the stops on
 * every render (FR-013). `useLocalSearchParams` is the v57 hook for a screen's
 * own params (https://docs.expo.dev/router/reference/url-parameters.md).
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StatusPill } from '@/components/trip/status-pill';
import {
  StopEditor,
  type StopEditorMode,
  type StopEditorValues,
} from '@/components/trip/stop-editor';
import { StopList } from '@/components/trip/stop-list';
import { describePlace } from '@/components/trip/stop-row';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Colors, Spacing } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import { deriveTripStatus } from '@/features/trips/trip-status';
import { useTrip, useTripActions, useTripStops } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { Sentry } from '@/lib/sentry';

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

export default function TripScreen() {
  const router = useRouter();
  const { theme } = useAppearance();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const actions = useTripActions();
  const [editor, setEditor] = useState<Editor>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  /** Local writes are synchronous; a failure is reported AND shown, never dropped. */
  const attempt = (write: () => void) => {
    try {
      setWriteError(null);
      write();
    } catch (error) {
      Sentry.captureException(error);
      setWriteError(WRITE_FAILED);
    }
  };

  const openAdd = () => {
    const previous = stops.data[stops.data.length - 1] ?? null;
    setEditor({ mode: { kind: 'add', previousStop: previous }, stopId: null });
  };

  const openEdit = (stop: StopWithPlace) =>
    setEditor({
      mode: { kind: 'edit', stop, placeName: describePlace(stop) },
      stopId: stop.id,
    });

  const submitEditor = (values: StopEditorValues) => {
    const current = editor;
    setEditor(null);
    if (!current) return;
    attempt(() => {
      if (current.stopId) {
        actions.updateStopDates(current.stopId, values);
      } else {
        actions.addStop({ trip_id: tripId, ...values });
      }
    });
  };

  const confirmRemove = (stop: StopWithPlace) => {
    Alert.alert(`Remove ${describePlace(stop)}?`, 'The stop is removed from this trip.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => attempt(() => actions.removeStop(stop.id)),
      },
    ]);
  };

  const status = deriveTripStatus(stops.data);

  return (
    <Screen testID="trip-screen">
      <View style={styles.header}>
        <PressableSurface
          accessibilityLabel="Back"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.back}>
          <ThemedText type="smallBold">Back</ThemedText>
        </PressableSurface>

        {trip.data ? (
          <>
            <ThemedText type="subtitle" testID="trip-title">
              {trip.data.title}
            </ThemedText>
            <View style={styles.meta}>
              <StatusPill status={status} />
              <ThemedText type="small" themeColor="textMuted">
                {trip.data.home_currency}
              </ThemedText>
              {trip.data.is_dirty ? <SyncBadge state="pending" /> : null}
            </View>
          </>
        ) : trip.loading ? (
          <LoadingState title="Loading trip" />
        ) : (
          <EmptyState
            title="This trip isn’t on this device"
            detail="It may have been removed, or it has not synced here yet."
          />
        )}
      </View>

      {trip.data ? (
        <>
          {/* The daily-use loop (US2): notes and spending for this trip. */}
          <View style={styles.links}>
            <PressableSurface
              testID="trip-open-notes"
              accessibilityLabel="Notes for this trip"
              treatment="raised"
              onPress={() => router.push(`/trip/${tripId}/notes`)}
              style={styles.link}>
              <ThemedText type="smallBold">Notes</ThemedText>
            </PressableSurface>
            <PressableSurface
              testID="trip-open-expenses"
              accessibilityLabel="Spending for this trip"
              treatment="raised"
              onPress={() => router.push(`/trip/${tripId}/expenses`)}
              style={styles.link}>
              <ThemedText type="smallBold">Spending</ThemedText>
            </PressableSurface>
            {/* Preparing to travel (US4, T105): each city's map saved for use offline. */}
            <PressableSurface
              testID="trip-open-offline-maps"
              accessibilityLabel="Offline maps for this trip"
              treatment="raised"
              onPress={() => router.push(`/trip/${tripId}/offline-maps`)}
              style={styles.link}>
              <ThemedText type="smallBold">Offline maps</ThemedText>
            </PressableSurface>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold">Stops</ThemedText>
            <PressableSurface
              testID="trip-add-stop"
              accessibilityLabel="Add stop"
              depth={2}
              onPress={openAdd}
              style={styles.addStop}>
              <ThemedText type="smallBold">Add stop</ThemedText>
            </PressableSurface>
          </View>

          {stops.error ? (
            <ErrorState
              title="Couldn’t read the stops"
              detail="The local store did not answer."
            />
          ) : stops.loading ? (
            <LoadingState title="Loading stops" />
          ) : stops.data.length === 0 ? (
            <EmptyState
              title="No stops yet"
              detail="Add the first city you are going to, with its dates."
            />
          ) : (
            <StopList
              stops={stops.data}
              onMove={(stopId, direction) =>
                attempt(() => actions.moveStop(stopId, direction))
              }
              onReorder={(orderedIds) =>
                attempt(() => actions.reorderStops(tripId, orderedIds))
              }
              onEdit={openEdit}
              onRemove={confirmRemove}
            />
          )}

          {writeError ? (
            <ThemedText
              testID="trip-write-error"
              type="small"
              accessibilityRole="alert"
              style={{ color: Colors[theme].danger }}>
              {writeError}
            </ThemedText>
          ) : null}

          {editor ? (
            <StopEditor
              visible
              mode={editor.mode}
              onCancel={() => setEditor(null)}
              onSubmit={submitEditor}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  // Three links share the row; at large text sizes they wrap onto a second
  // line rather than squeeze their labels (FR-016).
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  link: {
    flexGrow: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  addStop: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
