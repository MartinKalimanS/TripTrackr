/**
 * Trip overview and stops editor - tasks.md T068, 004 T431, 005 T543 to T546 (FR-010 to FR-013,
 * FR-015; 004 FR-007, FR-013, FR-029, FR-035; 005 FR-025, FR-037 to FR-043).
 *
 * The route reads the trip and hands it to `TripDetail`, which is the screen (the hero, the status
 * row, the five areas, the day strip and the timeline of stops; see its header). What stands in
 * for the trip until there is one is `TripPlaceholder`: a skeleton shaped like the screen while it
 * is read, an error in words when the store cannot answer, "not on this device" when it answered
 * and the trip is not there. The error comes first: a live read that fails can still report
 * `loading` (its first-result timestamp never arrives), and the words must win over the skeleton.
 *
 * Under a transparent native header (`_layout.tsx`: the glass Back control and no title), so the
 * hero runs under the status bar. `useLocalSearchParams` is the v57 hook for a screen's own params
 * (https://docs.expo.dev/router/reference/url-parameters.md).
 *
 * Everything on this screen is read from and written to the encrypted local store; the stops list
 * is a live query so a write shows up the moment SQLite commits it (Constitution II). The status
 * is derived from the stops on every render (FR-013).
 */
import { useLocalSearchParams } from 'expo-router';

import { TripDetail } from '@/components/trip/trip-detail';
import { TripPlaceholder } from '@/components/trip/trip-states';
import { useTrip } from '@/features/trips/use-trips';

/**
 * A dynamic segment can arrive as an array when the same key appears twice in
 * a URL. A trip has one id, so the first wins rather than the screen crashing
 * on `.length`.
 */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const trip = useTrip(firstParam(id) ?? '');

  return trip.data ? (
    <TripDetail trip={trip.data} />
  ) : (
    <TripPlaceholder loading={trip.loading} failed={trip.error !== null} />
  );
}
