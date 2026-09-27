/**
 * Country-filtered searchable city picker — tasks.md T067 (FR-014).
 *
 * Two steps, one component: choose a country from the full list (filtered as
 * the traveller types), then type a city and pick from the server's ranked
 * matches. Both steps read through `use-geography`, so both keep working in
 * aeroplane mode from the local cache — and say so, rather than pretending
 * the cache is the world (Constitution II, IV).
 *
 * Selection returns the wire `City` (with its coordinates), which the stop
 * editor stores by `city_id`; the row itself is already in the local cache
 * because the search that offered it wrote it there.
 */
import type { City, Country } from '@triptrackr/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useCitySearch, useCountries } from '@/features/geography/use-geography';
import { foldAccents } from '@/db/repositories/geography';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

export const CITY_QUERY_DEBOUNCE_MS = 250;
const MAX_COUNTRY_ROWS = 40;

export type CityPickerProps = {
  onSelect: (city: City, country: Country) => void;
};

const OFFLINE_NOTE = 'Offline — showing saved places';

function OfflineNote() {
  return (
    <ThemedText
      type="small"
      themeColor="textMuted"
      accessibilityRole="alert"
      style={styles.note}>
      {OFFLINE_NOTE}
    </ThemedText>
  );
}

function matchesCountry(country: Country, needle: string): boolean {
  if (needle.length === 0) return true;
  return (
    foldAccents(country.name).toLowerCase().includes(needle) ||
    country.iso_code.toLowerCase() === needle
  );
}

type CountryStepProps = { onPick: (country: Country) => void };

function CountryStep({ onPick }: CountryStepProps) {
  const [filter, setFilter] = useState('');
  const countries = useCountries();

  if (countries.isPending) return <LoadingState title="Loading countries" />;
  if (countries.isError) {
    return (
      <ErrorState
        title="Couldn’t load countries"
        detail="Check your connection and try again."
        onRetry={() => void countries.refetch()}
      />
    );
  }

  const needle = foldAccents(filter.trim()).toLowerCase();
  const matches = countries.data.items.filter((country) =>
    matchesCountry(country, needle),
  );
  const visible = matches.slice(0, MAX_COUNTRY_ROWS);

  return (
    <View style={styles.step}>
      <TextField
        label="Country"
        value={filter}
        onChangeText={setFilter}
        placeholder="Start typing a country"
        autoCorrect={false}
        autoCapitalize="words"
        testID="city-picker-country-filter"
      />
      {countries.data.offline ? <OfflineNote /> : null}
      {visible.length === 0 ? (
        <EmptyState title="No country matches" detail="Try another spelling." />
      ) : (
        <View style={styles.list} testID="city-picker-country-list">
          {visible.map((country) => (
            <PressableSurface
              key={country.id}
              testID={`city-picker-country-${country.iso_code}`}
              accessibilityLabel={country.name}
              treatment="flat"
              onPress={() => onPick(country)}
              style={styles.row}>
              <ThemedText>{country.name}</ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {country.continent}
              </ThemedText>
            </PressableSurface>
          ))}
          {matches.length > visible.length ? (
            <ThemedText type="small" themeColor="textMuted" style={styles.note}>
              Keep typing to narrow the list
            </ThemedText>
          ) : null}
        </View>
      )}
    </View>
  );
}

type CityStepProps = {
  country: Country;
  onChangeCountry: () => void;
  onPick: (city: City) => void;
};

function CityStep({ country, onChangeCountry, onPick }: CityStepProps) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, CITY_QUERY_DEBOUNCE_MS);
  const cities = useCitySearch(country.id, debounced);

  return (
    <View style={styles.step}>
      <PressableSurface
        testID="city-picker-change-country"
        accessibilityLabel={`Country: ${country.name}. Change country`}
        treatment="flat"
        onPress={onChangeCountry}
        style={styles.row}>
        <ThemedText type="smallBold">{country.name}</ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          Change
        </ThemedText>
      </PressableSurface>

      <TextField
        label="City"
        value={query}
        onChangeText={setQuery}
        placeholder={`A city in ${country.name}`}
        autoCorrect={false}
        autoCapitalize="words"
        autoFocus
        testID="city-picker-city-query"
      />

      {cities.data?.offline ? <OfflineNote /> : null}
      {cities.isError ? (
        <ErrorState
          title="Couldn’t search cities"
          detail="Check your connection and try again."
          onRetry={() => void cities.refetch()}
        />
      ) : cities.isPending ? (
        <LoadingState title="Searching cities" />
      ) : cities.data.items.length === 0 ? (
        <EmptyState
          title="No city matches"
          detail={
            debounced.trim() ? 'Try another spelling.' : 'Start typing a city name.'
          }
        />
      ) : (
        <View style={styles.list} testID="city-picker-city-list">
          {cities.data.items.map((city) => (
            <PressableSurface
              key={city.id}
              testID={`city-picker-city-${city.id}`}
              accessibilityLabel={`${city.name}, ${country.name}`}
              treatment="flat"
              onPress={() => onPick(city)}
              style={styles.row}>
              <ThemedText>{city.name}</ThemedText>
              {city.ascii_name !== city.name ? (
                <ThemedText type="small" themeColor="textMuted">
                  {city.ascii_name}
                </ThemedText>
              ) : null}
            </PressableSurface>
          ))}
        </View>
      )}
    </View>
  );
}

export function CityPicker({ onSelect }: CityPickerProps) {
  const [country, setCountry] = useState<Country | null>(null);

  if (!country) return <CountryStep onPick={setCountry} />;

  return (
    <CityStep
      country={country}
      onChangeCountry={() => setCountry(null)}
      onPick={(city) => onSelect(city, country)}
    />
  );
}

const styles = StyleSheet.create({
  step: { gap: Spacing.two },
  list: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  note: { paddingHorizontal: Spacing.one },
});
