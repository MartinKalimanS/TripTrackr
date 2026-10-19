/**
 * Every write the trip screen makes to its stops, and the stop editor it opens - tasks.md T068,
 * T071b, 004 T431, moved out of the route by 005 T546 so the screen is composition.
 *
 * Everything is written to the encrypted local store through the repositories; a failure is
 * reported to Sentry AND shown (`writeError`), never dropped, and the next attempt clears it.
 * A removal asks first: a removed stop is a tombstone the server will apply. Nothing here
 * touches the network (Constitution II).
 */
import { useState } from 'react';
import { Alert } from 'react-native';

import type { StopWithPlace } from '@/db/repositories/stops';
import { useTripActions } from '@/features/trips/use-trips';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

import type { StopEditorMode, StopEditorValues } from './stop-editor';
import { describePlace } from './stop-row';

export const WRITE_FAILED =
  'That change could not be saved on this device. Please try again.';

/** Asks first: a removed stop is a tombstone the server will apply. */
function confirmRemove(stop: StopWithPlace, remove: () => void) {
  Alert.alert(`Remove ${describePlace(stop)}?`, 'The stop is removed from this trip.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: remove },
  ]);
}

/**
 * Every write the screen makes. Local writes are synchronous; a failure is reported to
 * Sentry AND shown (`writeError`), never dropped, and the next attempt clears it. `attempt`
 * is for the other local writes of the screen (retrying the photos that failed to upload).
 */
export function useStopWrites(tripId: string) {
  const actions = useTripActions();
  const { writeError, attempt, attemptSave, attemptRemoval } =
    useWriteAttempt(WRITE_FAILED);

  return {
    writeError,
    attempt,
    move: (stopId: string, direction: 'up' | 'down') =>
      attempt(() => actions.moveStop(stopId, direction)),
    reorder: (orderedIds: string[]) =>
      attempt(() => actions.reorderStops(tripId, orderedIds)),
    remove: (stop: StopWithPlace) =>
      confirmRemove(stop, () => attemptRemoval(() => actions.removeStop(stop.id))),
    /** `stopId` null adds a stop to the trip; otherwise it moves that stop's dates. */
    save: (stopId: string | null, values: StopEditorValues) =>
      attemptSave(() => {
        if (stopId) {
          actions.updateStopDates(stopId, values);
        } else {
          actions.addStop({ trip_id: tripId, ...values });
        }
      }),
  };
}

type Editor = { mode: StopEditorMode; stopId: string | null } | null;

/** Which stop editor is open, if any: a new stop after the last, or one stop's dates. */
export function useStopEditor(
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
