/**
 * A trip's offline maps — tasks.md T105 (FR-044; User Story 4, Acceptance
 * Scenarios 3 and 4); research D-06, D-30.
 *
 * One row per city of the trip — a city visited twice appears once — with
 * what its saved map is doing, in words rather than colour alone (feature 002
 * FR-010), and the actions that state allows: Download, Stop, Remove, Try
 * again. The packs are `useOfflinePacks` (features/trips/use-offline-pack.ts);
 * a city this device has no position for is explained, never guessed at.
 *
 * Nothing is asked of Mapbox until it is configured (`useMapboxReady`): the
 * native tile store takes the access token when it is first created.
 *
 * Visibility posture: device-only. The trip's stops are read from the
 * encrypted local store; the maps saved are public tiles for public cities,
 * kept in the device's Mapbox tile store. Nothing about the trip leaves the
 * phone, and no other traveller can see what was saved.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { describePlace } from '@/components/trip/stop-row';
import { InlineError } from '@/components/ui/inline-error';
import {
  PressableSurface,
  type RestingTreatment,
} from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import {
  packStatusText,
  tripCities,
  type OfflineCity,
  type OfflinePackState,
  type TripCities,
} from '@/features/trips/offline-packs';
import { useOfflinePacks } from '@/features/trips/use-offline-pack';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useMapboxReady } from '@/hooks/use-mapbox-ready';

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

type HeaderProps = { tripTitle: string | null; onBack: () => void };

function OfflineMapsHeader({ tripTitle, onBack }: HeaderProps) {
  return (
    <View style={styles.header}>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={onBack}
        style={styles.back}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>
      <ThemedText type="subtitle" testID="offline-maps-title">
        {tripTitle ? `Offline maps · ${tripTitle}` : 'Offline maps'}
      </ThemedText>
      <ThemedText type="small" themeColor="textMuted">
        Save a city’s map so it opens without a connection. Saved maps stay on this
        device, shared by every trip that visits the city.
      </ThemedText>
    </View>
  );
}

type PackActionProps = {
  testID: string;
  label: string;
  text: string;
  onPress: () => void;
  treatment?: RestingTreatment;
  danger?: boolean;
};

function PackAction({
  testID,
  label,
  text,
  onPress,
  treatment = 'flat',
  danger = false,
}: PackActionProps) {
  return (
    <PressableSurface
      testID={testID}
      accessibilityLabel={label}
      treatment={treatment}
      radius="sm"
      onPress={onPress}
      style={styles.action}>
      <ThemedText type="smallBold" themeColor={danger ? 'danger' : undefined}>
        {text}
      </ThemedText>
    </PressableSurface>
  );
}

type CityPackRowProps = {
  city: OfflineCity;
  state: OfflinePackState;
  onDownload: () => void;
  onStop: () => void;
  onRemove: () => void;
};

/**
 * What a traveller can do with a city's map in its current state: download
 * it (or try again), stop a download, or remove what is saved.
 */
function PackActions({ city, state, onDownload, onStop, onRemove }: CityPackRowProps) {
  const { cityId, cityName } = city;
  const retry = state.kind === 'error';
  const canRemove = state.kind === 'ready' || (state.kind === 'error' && state.partial);
  return (
    <View style={styles.actions}>
      {state.kind === 'none' || retry ? (
        <PackAction
          testID={`offline-download-${cityId}`}
          label={
            retry
              ? `Try downloading ${cityName} again`
              : `Download ${cityName} for offline use`
          }
          text={retry ? 'Try again' : 'Download'}
          onPress={onDownload}
          treatment="raised"
        />
      ) : null}
      {state.kind === 'downloading' ? (
        <PackAction
          testID={`offline-stop-${cityId}`}
          label={`Stop downloading ${cityName}`}
          text="Stop"
          onPress={onStop}
          danger
        />
      ) : null}
      {canRemove ? (
        <PackAction
          testID={`offline-remove-${cityId}`}
          label={`Remove ${cityName}’s offline map`}
          text="Remove"
          onPress={onRemove}
          danger
        />
      ) : null}
    </View>
  );
}

function PackStatus({ cityId, state }: { cityId: number; state: OfflinePackState }) {
  const testID = `offline-status-${cityId}`;
  if (state.kind === 'error') {
    return <InlineError testID={testID} message={state.message} />;
  }
  const { text, spoken } = packStatusText(state);
  return (
    <ThemedText
      type="small"
      themeColor={state.kind === 'none' ? 'textMuted' : undefined}
      testID={testID}
      accessibilityLabel={spoken}>
      {text}
    </ThemedText>
  );
}

function CityPackRow(props: CityPackRowProps) {
  const { city, state } = props;
  return (
    <Surface
      treatment="raised"
      depth={1}
      radius="lg"
      testID={`offline-city-${city.cityId}`}
      style={styles.row}>
      <View style={styles.place}>
        <ThemedText type="default" style={styles.cityName}>
          {city.cityName}
        </ThemedText>
        {city.countryName ? (
          <ThemedText type="small" themeColor="textMuted">
            {city.countryName}
          </ThemedText>
        ) : null}
        <PackStatus cityId={city.cityId} state={state} />
      </View>
      <PackActions {...props} />
    </Surface>
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
  if (packs.loading) return <LoadingState title="Checking saved maps" />;

  return (
    <View style={styles.list}>
      {cities.placed.map((city) => (
        <CityPackRow
          key={city.cityId}
          city={city}
          state={packs.stateOf(city.cityId)}
          onDownload={() => void packs.download(city)}
          onStop={() => confirmStop(city, () => void packs.remove(city))}
          onRemove={() => confirmRemove(city, () => void packs.remove(city))}
        />
      ))}
      {cities.unplaced.length > 0 ? (
        <ThemedText type="small" themeColor="textMuted" testID="offline-unplaced">
          {unplacedSentence(cities.unplaced)}
        </ThemedText>
      ) : null}
    </View>
  );
}

type BodyProps = { stops: LiveResult<StopWithPlace[]>; cities: TripCities };

function OfflineMapsBody({ stops, cities }: BodyProps) {
  const mapbox = useMapboxReady();

  if (stops.error) {
    return (
      <ErrorState
        title="Couldn’t read the trip’s cities"
        detail="The local store did not answer."
      />
    );
  }
  if (stops.loading) return <LoadingState title="Loading the trip’s cities" />;
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
  if (mapbox === 'unavailable') {
    return (
      <ErrorState
        title="Offline maps aren’t available in this build"
        detail="Map access isn’t set up in this version of the app."
      />
    );
  }
  if (mapbox === 'starting') return <LoadingState title="Getting maps ready" />;
  return <CityPackList cities={cities} />;
}

export default function OfflineMapsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const cities = useMemo(() => tripCities(stops.data), [stops.data]);

  return (
    <Screen testID="offline-maps-screen">
      <OfflineMapsHeader
        tripTitle={trip.data?.title ?? null}
        onBack={() => router.back()}
      />
      <OfflineMapsBody stops={stops} cities={cities} />
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
  list: {
    gap: Spacing.three,
  },
  row: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  place: {
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  cityName: {
    fontWeight: 600,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
