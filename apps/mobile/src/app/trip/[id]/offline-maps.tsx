/**
 * A trip's offline maps — tasks.md T105, 004 T444 (FR-044; User Story 4, Acceptance
 * Scenarios 3 and 4; 004 FR-005, FR-007, FR-015, FR-021, FR-035, FR-037); research D-06,
 * D-30, D4-06. Feature 005, F11 (tasks.md T552; UI-SPEC 9.2; picture `more/offline-maps`).
 *
 * As pictured: the shared `AreaHeader` (Back, the title "Offline maps", "Maps keep working
 * with no signal."), the cream storage card (`StorageBar`: what this trip's finished maps
 * take, the room the device reports, the bar), "For this trip" (a row per city, a city visited
 * twice appears once: `CityPackCard`, with what its saved map is doing in words and an icon
 * rather than colour alone, and the actions that state allows: Download, Stop, Remove, Try
 * again), "Downloaded" (the finished maps, each with the trash icon, which is the real
 * Remove) and the FAB "New area". The pictured "Map >" links and "New area" are coming-soon
 * controls (Q-11): the app saves a trip's cities and nothing else, so there is no area to
 * pick and no map to open from here. The packs are `useOfflinePacks`
 * (features/trips/use-offline-pack.ts); a city this device has no position for is
 * explained, never guessed at. No size or date is drawn that the app cannot read: a map not
 * saved yet has no size, the free space is the device's own reading or it is not drawn.
 *
 * The navigator's header is hidden for this route (`trip/[id]/_layout.tsx`): the screen draws
 * the pictured header itself. Every state is designed (C4-10 rule 2): placeholder rows while
 * the stops, Mapbox or the device's packs load (`OfflineMapsSkeleton`); a message that names
 * the next step when there is nothing to list; an error, with Try again where something can
 * be re-run (the saved-maps read). The trip's stops are a live query and the Mapbox token a
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useContext, useMemo, useState, type ReactElement } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { OfflineMapsSkeleton } from '@/components/trip/offline-maps-skeleton';
import { CityPackCard } from '@/components/trip/offline-city-card';
import { StorageBar } from '@/components/trip/storage-bar';
import { describePlace } from '@/components/trip/stop-row';
import { AreaFab, areaFabClearance } from '@/components/ui/area-fab';
import { AreaHeader, areaMargin } from '@/components/ui/area-header';
import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  splitByPack,
  tripCities,
  type OfflineCity,
  type TripCities,
} from '@/features/trips/offline-packs';
import { storageCaption, storageFigures } from '@/features/trips/offline-storage';
import { useOfflinePacks } from '@/features/trips/use-offline-pack';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { useFontScale } from '@/hooks/use-font-scale';
import { useHaptics } from '@/hooks/use-haptics';
import { useMapboxReady } from '@/hooks/use-mapbox-ready';
import { freeDiskBytes } from '@/lib/disk-space';
import { Space } from '@/theme';

/** Placeholder rows while something loads: two say "a list" without filling the screen. */
const PLACEHOLDER_CARDS = 2;

const SUBTITLE = 'Maps keep working with no signal.';
const NOTE =
  'Save a city’s map so it opens without a connection. Saved maps stay on this device, shared by every trip that visits the city.';

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

/** A section's heading, as the picture: callout, heavier, with room above. */
function SectionHead({ title, trip = false }: { title: string; trip?: boolean }) {
  return (
    <Text
      variant="callout"
      strong
      accessibilityRole="header"
      testID={trip ? 'offline-maps-trip' : undefined}
      style={{ marginTop: Space[6], marginBottom: Space[2] }}>
      {title}
    </Text>
  );
}

/** The room the device reports, read again whenever what the maps take changes. */
function useFreeDisk(mapsBytes: number): number | null {
  const [reading, setReading] = useState(() => ({
    at: mapsBytes,
    free: freeDiskBytes(),
  }));
  if (reading.at === mapsBytes) return reading.free;
  const next = { at: mapsBytes, free: freeDiskBytes() };
  setReading(next);
  return next.free;
}

type ListProps = { cities: TripCities; tripTitle: string | null };

/** Mounted only once Mapbox is configured, so the tile store starts with its token. */
function CityPackList({ cities, tripTitle }: ListProps) {
  const packs = useOfflinePacks(cities.placed);
  const haptics = useHaptics();
  const stateOf = (city: OfflineCity) => packs.stateOf(city.cityId);
  const states = cities.placed.map(stateOf);
  const caption = storageCaption(states);
  const mapsBytes = storageFigures(states, null).mapsBytes;
  // Read again when what the maps take changes: a finished download or a removal.
  const free = useFreeDisk(mapsBytes);

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
    return <OfflineMapsSkeleton rows={PLACEHOLDER_CARDS} label="Checking saved maps" />;
  }

  /** Both confirmations end the same way: the warning haptic, then the pack goes. */
  const discard = (city: OfflineCity) => {
    haptics.warning();
    void packs.remove(city);
  };
  const { todo, saved } = splitByPack(cities.placed, stateOf);
  const row = (city: OfflineCity, index: number) => (
    <CityPackCard
      key={city.cityId}
      city={city}
      state={stateOf(city)}
      separated={index > 0}
      onDownload={() => void packs.download(city)}
      onStop={() => confirmStop(city, () => discard(city))}
      onRemove={() => confirmRemove(city, () => discard(city))}
    />
  );

  return (
    <View>
      <StorageBar figures={storageFigures(states, free)} caption={caption} />
      <SectionHead title={tripTitle ? `For ${tripTitle}` : 'For this trip'} trip />
      {todo.length > 0 ? (
        todo.map(row)
      ) : (
        <Text variant="body" tone="muted" testID="offline-all-saved">
          Every city of this trip is saved on this device.
        </Text>
      )}
      {saved.length > 0 ? <SectionHead title="Downloaded" /> : null}
      {saved.map(row)}
      {cities.unplaced.length > 0 ? (
        <Text
          variant="caption"
          tone="muted"
          testID="offline-unplaced"
          style={{ marginTop: Space[4] }}>
          {unplacedSentence(cities.unplaced)}
        </Text>
      ) : null}
      <Text
        variant="caption"
        tone="muted"
        testID="offline-maps-note"
        style={{ marginTop: Space[4] }}>
        {NOTE}
      </Text>
    </View>
  );
}

type BodyProps = {
  stops: LiveResult<StopWithPlace[]>;
  cities: TripCities;
  /** The way out of a trip with no city to save a map for. */
  onBack: () => void;
};

const BACK_TO_TRIP = {
  label: 'Back to the trip',
  testID: 'offline-maps-empty-back',
} as const;

/**
 * What stands in for the list while the trip's cities are unread, unreadable, absent or
 * unplaceable; null once there are cities to list.
 */
function tripCitiesNotice({ stops, cities, onBack }: BodyProps): ReactElement | null {
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
      <OfflineMapsSkeleton rows={PLACEHOLDER_CARDS} label="Loading the trip’s cities" />
    );
  }
  if (stops.data.length === 0) {
    return (
      <EmptyState
        title="No cities yet"
        detail="Add a stop to this trip, then save its city’s map here."
        action={{ ...BACK_TO_TRIP, onPress: onBack }}
      />
    );
  }
  if (cities.placed.length === 0) {
    return (
      <EmptyState
        title="No city can be saved yet"
        detail={unplacedSentence(cities.unplaced)}
        action={{ ...BACK_TO_TRIP, onPress: onBack }}
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
    return <OfflineMapsSkeleton rows={PLACEHOLDER_CARDS} label="Getting maps ready" />;
  }
  return null;
}

/** The list of cities, or the designed state that stands in for it. */
function OfflineMapsBody(props: BodyProps & { tripTitle: string | null }) {
  const mapbox = useMapboxReady();
  return (
    tripCitiesNotice(props) ??
    mapboxNotice(mapbox) ?? (
      <CityPackList cities={props.cities} tripTitle={props.tripTitle} />
    )
  );
}

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

export default function OfflineMapsScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const cities = useMemo(() => tripCities(stops.data), [stops.data]);
  const router = useRouter();
  const { tokens } = useAppearance();
  const fontScale = useFontScale();
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const margin = areaMargin();
  const newArea = useComingSoon('New area');

  return (
    <View
      testID="offline-maps-screen"
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}>
      <AreaHeader
        title="Offline maps"
        subtitle={SUBTITLE}
        testID="offline-maps-header"
        titleTestID="offline-maps-title"
        subtitleTestID="offline-maps-subtitle"
      />
      <ScrollView
        testID="offline-maps-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: Space[4],
          paddingStart: margin + insets.left,
          paddingEnd: margin + insets.right,
          paddingBottom: areaFabClearance(Platform.OS, fontScale) + insets.bottom,
        }}>
        <OfflineMapsBody
          stops={stops}
          cities={cities}
          onBack={() => router.back()}
          tripTitle={trip.data?.title ?? null}
        />
      </ScrollView>
      <AreaFab
        label="New area"
        accessibilityLabel="Download a new area"
        accessibilityHint={COMING_SOON_HINT}
        icon="map-pin"
        testID="coming-soon-offline-new-area"
        onPress={newArea}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});
