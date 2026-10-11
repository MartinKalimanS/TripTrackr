/**
 * A trip's offline maps — tasks.md T105, 004 T444 (FR-044; User Story 4, Acceptance
 * Scenarios 3 and 4; 004 FR-005, FR-007, FR-015, FR-021, FR-035, FR-037); research D-06,
 * D-30, D4-06.
 *
 * One card per city of the trip — a city visited twice appears once — with what its saved
 * map is doing, in words and an icon rather than colour alone (feature 002 FR-010, 004
 * FR-025), and the actions that state allows: Download, Stop, Remove, Try again
 * (`CityPackCard`). The packs are `useOfflinePacks` (features/trips/use-offline-pack.ts);
 * a city this device has no position for is explained, never guessed at. Under the list,
 * a caption says what this trip's saved maps take on the device (`storageCaption`).
 *
 * Under a native header (`_layout.tsx`): the title "Offline maps" and the Back control are
 * the navigator's, so the screen is `underHeader` and draws neither. The page opens with
 * the trip's name (`offline-maps-title`, which named the trip and the screen together
 * before) and what the screen is for. Every state is designed (C4-10 rule 2): placeholder
 * cards while the stops, Mapbox or the device's packs load; a message that names the next
 * step when there is nothing to list; an error, with Try again where something can be
 * re-run (the saved-maps read). The trip's stops are a live query and the Mapbox token a
 * build setting, so their errors offer none, as the Trips screen's does not.
 *
 * Nothing is asked of Mapbox until it is configured (`useMapboxReady`): the native tile
 * store takes the access token when it is first created.
 *
 * Visibility posture: device-only. The trip's stops are read from the encrypted local
 * store; the maps saved are public tiles for public cities, kept in the device's Mapbox
 * tile store. Nothing about the trip leaves the phone, and no other traveller can see what
 * was saved.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, type ReactElement } from 'react';
import { Alert, View } from 'react-native';

import { CityPackCard } from '@/components/trip/offline-city-card';
import { describePlace } from '@/components/trip/stop-row';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  tripCities,
  type OfflineCity,
  type OfflinePackState,
  type TripCities,
} from '@/features/trips/offline-packs';
import { storageCaption } from '@/features/trips/offline-storage';
import { useOfflinePacks } from '@/features/trips/use-offline-pack';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useMapboxReady } from '@/hooks/use-mapbox-ready';

/** Placeholder cards while something loads: two say "a list" without filling the screen. */
const PLACEHOLDER_CARDS = 2;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "City #777 can’t be saved yet: this device doesn’t have its location." */
function unplacedSentence(cities: TripCities['unplaced']): string {
  const names = cities.map((city) => describePlace(city)).join(', ');
  const whose = cities.length === 1 ? 'its' : 'their';
  return `${names} can’t be saved yet: this device doesn’t have ${whose} location.`;
}

function confirmRemove(city: OfflineCity, onRemove: () => void) {
  Alert.alert(
    `Remove ${city.cityName}’s offline map?`,
    `It is removed from this device for every trip that visits ${city.cityName}. You can download it again.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onRemove },
    ],
  );
}

function confirmStop(city: OfflineCity, onStop: () => void) {
  Alert.alert(
    `Stop downloading ${city.cityName}?`,
    'What has been saved so far is removed.',
    [
      { text: 'Keep downloading', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: onStop },
    ],
  );
}

/** The trip's name, once it is read, and what the screen is for. */
function OfflineMapsIntro({ tripTitle }: { tripTitle: string | null }) {
  return (
    <View className="gap-1">
      {tripTitle ? (
        <Text type="headline" testID="offline-maps-title">
          {tripTitle}
        </Text>
      ) : null}
      <Text type="callout" tone="muted">
        Save a city’s map so it opens without a connection. Saved maps stay on this
        device, shared by every trip that visits the city.
      </Text>
    </View>
  );
}

/** What this trip's saved maps take on the device: a quiet caption under the cards. */
function StorageCaption({ states }: { states: readonly OfflinePackState[] }) {
  const { text, spoken } = storageCaption(states);
  return (
    <Text
      type="caption"
      tone="muted"
      testID="offline-storage"
      accessibilityLabel={spoken}>
      {text}
    </Text>
  );
}

/** Mounted only once Mapbox is configured, so the tile store starts with its token. */
function CityPackList({ cities }: { cities: TripCities }) {
  const packs = useOfflinePacks(cities.placed);

  if (packs.error) {
    return (
      <ErrorState
        title="Couldn’t check the saved maps"
        detail="The map store on this device did not answer."
        onRetry={packs.retry}
      />
    );
  }
  if (packs.loading) {
    return (
      <ListSkeleton variant="card" rows={PLACEHOLDER_CARDS} label="Checking saved maps" />
    );
  }

  const stateOf = (city: OfflineCity) => packs.stateOf(city.cityId);
  return (
    <View className="gap-3">
      {cities.placed.map((city) => (
        <CityPackCard
          key={city.cityId}
          city={city}
          state={stateOf(city)}
          onDownload={() => void packs.download(city)}
          onStop={() => confirmStop(city, () => void packs.remove(city))}
          onRemove={() => confirmRemove(city, () => void packs.remove(city))}
        />
      ))}
      <StorageCaption states={cities.placed.map(stateOf)} />
      {cities.unplaced.length > 0 ? (
        <Text type="caption" tone="muted" testID="offline-unplaced">
          {unplacedSentence(cities.unplaced)}
        </Text>
      ) : null}
    </View>
  );
}

type BodyProps = { stops: LiveResult<StopWithPlace[]>; cities: TripCities };

/**
 * What stands in for the list while the trip's cities are unread, unreadable, absent or
 * unplaceable; null once there are cities to list.
 */
function tripCitiesNotice({ stops, cities }: BodyProps): ReactElement | null {
  // The error first: a live read that fails can still report `loading`.
  if (stops.error) {
    return (
      <ErrorState
        title="Couldn’t read the trip’s cities"
        detail="The local store did not answer."
      />
    );
  }
  if (stops.loading) {
    return (
      <ListSkeleton
        variant="card"
        rows={PLACEHOLDER_CARDS}
        label="Loading the trip’s cities"
      />
    );
  }
  if (stops.data.length === 0) {
    return (
      <EmptyState
        title="No cities yet"
        detail="Add a stop to this trip, then save its city’s map here."
      />
    );
  }
  if (cities.placed.length === 0) {
    return (
      <EmptyState
        title="No city can be saved yet"
        detail={unplacedSentence(cities.unplaced)}
      />
    );
  }
  return null;
}

/** What stands in for the list until Mapbox is configured; null once it is. */
function mapboxNotice(mapbox: ReturnType<typeof useMapboxReady>): ReactElement | null {
  if (mapbox === 'unavailable') {
    return (
      <ErrorState
        title="Offline maps aren’t available in this build"
        detail="Map access isn’t set up in this version of the app."
      />
    );
  }
  if (mapbox === 'starting') {
    return (
      <ListSkeleton variant="card" rows={PLACEHOLDER_CARDS} label="Getting maps ready" />
    );
  }
  return null;
}

/** The list of cities, or the designed state that stands in for it. */
function OfflineMapsBody(props: BodyProps) {
  const mapbox = useMapboxReady();
  return (
    tripCitiesNotice(props) ??
    mapboxNotice(mapbox) ?? <CityPackList cities={props.cities} />
  );
}

export default function OfflineMapsScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const cities = useMemo(() => tripCities(stops.data), [stops.data]);

  return (
    <Screen testID="offline-maps-screen" underHeader>
      <OfflineMapsIntro tripTitle={trip.data?.title ?? null} />
      <OfflineMapsBody stops={stops} cities={cities} />
    </Screen>
  );
}
