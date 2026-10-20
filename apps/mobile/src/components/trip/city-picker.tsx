/**
 * Country-filtered searchable city picker — tasks.md T067 (FR-014); on the Atlas adapters
 * since feature 004 (T437; contract C4-8, C4-10 rules 2 and 8; FR-009, FR-024, FR-025,
 * FR-029, FR-030, FR-037).
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
 *
 * What it is made of: a search `Field` (label on top, so the largest text size wraps it
 * instead of clipping a placeholder) and, under it, ONE `ListGroup` of `ListRow`s. A result
 * is a single pressable row, named exactly as the old button was (`Italy`, `Roma, Italy`,
 * `Country: Italy. Change country`), with the continent or the accent-free spelling as its
 * second line and a chevron for a cue. The loading, empty and error states are the
 * `state-view` presentations beside the field, never in place of it: a traveller who got
 * nothing retypes in the same field. The offline note is an `alert`, words only.
 *
 * It does NOT scroll by itself. It lives in a sheet whose body is the scroller (the stop
 * editor's `FormSheet`: a `KeyboardAwareScrollView` with `keyboardShouldPersistTaps=
 * "handled"`), so the list, the field and the dates move together and a tap on a result
 * is never swallowed by a dismissal of the keyboard. A scroller of its own would nest one
 * inside the other and fight for the gesture. The country list is capped at
 * `MAX_COUNTRY_ROWS` and says "Keep typing" past it.
 */
import type { City, Country } from '@triptrackr/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/ui/field';
import { ListGroup, ListRow } from '@/components/ui/list-group';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
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
    <Text type="callout" tone="muted" accessibilityRole="alert" className="px-1">
      {OFFLINE_NOTE}
    </Text>
  );
}

function matchesCountry(country: Country, needle: string): boolean {
  if (needle.length === 0) return true;
  return (
    foldAccents(country.name).toLowerCase().includes(needle) ||
    country.iso_code.toLowerCase() === needle
  );
}

type CountryRowsProps = {
  countries: readonly Country[];
  /** More countries match than are shown. */
  hasMore: boolean;
  onPick: (country: Country) => void;
};

function CountryRows({ countries, hasMore, onPick }: CountryRowsProps) {
  if (countries.length === 0) {
    return <EmptyState title="No country matches" detail="Try another spelling." />;
  }
  return (
    <View className="gap-2">
      <ListGroup testID="city-picker-country-list">
        {countries.map((country) => (
          <ListRow
            key={country.id}
            testID={`city-picker-country-${country.iso_code}`}
            title={country.name}
            description={country.continent}
            accessibilityLabel={country.name}
            onPress={() => onPick(country)}
          />
        ))}
      </ListGroup>
      {hasMore ? (
        <Text type="caption" tone="muted" className="px-1">
          Keep typing to narrow the list
        </Text>
      ) : null}
    </View>
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

  return (
    <View className="gap-3">
      <Field
        label="Country"
        value={filter}
        onChangeText={setFilter}
        placeholder="Start typing a country"
        autoCorrect={false}
        autoCapitalize="words"
        testID="city-picker-country-filter"
      />
      {countries.data.offline ? <OfflineNote /> : null}
      <CountryRows
        countries={matches.slice(0, MAX_COUNTRY_ROWS)}
        hasMore={matches.length > MAX_COUNTRY_ROWS}
        onPick={onPick}
      />
    </View>
  );
}

type CityResultsProps = {
  search: ReturnType<typeof useCitySearch>;
  country: Country;
  /** What the search ran for; decides which empty-state hint is true. */
  query: string;
  onPick: (city: City) => void;
};

/** The search's loading, error, empty and populated presentations, in that order. */
function CityResults({ search, country, query, onPick }: CityResultsProps) {
  if (search.isError) {
    return (
      <ErrorState
        title="Couldn’t search cities"
        detail="Check your connection and try again."
        onRetry={() => void search.refetch()}
      />
    );
  }
  if (search.isPending) return <LoadingState title="Searching cities" />;
  if (search.data.items.length === 0) {
    return (
      <EmptyState
        title="No city matches"
        detail={query.trim() ? 'Try another spelling.' : 'Start typing a city name.'}
      />
    );
  }
  return (
    <ListGroup testID="city-picker-city-list">
      {search.data.items.map((city) => (
        <ListRow
          key={city.id}
          testID={`city-picker-city-${city.id}`}
          title={city.name}
          description={city.ascii_name !== city.name ? city.ascii_name : undefined}
          accessibilityLabel={`${city.name}, ${country.name}`}
          onPress={() => onPick(city)}
        />
      ))}
    </ListGroup>
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
    <View className="gap-3">
      <ListGroup>
        <ListRow
          testID="city-picker-change-country"
          title={country.name}
          accessibilityLabel={`Country: ${country.name}. Change country`}
          trailing={
            <Text type="callout" tone="accent">
              Change
            </Text>
          }
          onPress={onChangeCountry}
        />
      </ListGroup>

      <Field
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
      <CityResults search={cities} country={country} query={debounced} onPick={onPick} />
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
