/**
 * `CountriesList` - the full detent of the Home sheet and the screen reader's alternative to
 * the globe (feature 005, T536; contract C5-23; FR-016, FR-017, FR-064, FR-084; owner question
 * Q-2). From the top: the heading "Countries" with a collapse control, a search field, a ring
 * card ("14 of 195", "4 of 7 continents . 19 trips") with the stamps of the two newest visits,
 * then the countries under continent headers that stay in view, in a FlashList.
 *
 *   <CountriesList overview={overview} onSelectCountry={flyTo} onCollapse={() => setDetent('half')}
 *     contentInsetBottom={tabZone + 16} />
 *
 * - The list is flat: one item per header and per country, `getItemType` is the item's type (so
 *   a header and a row recycle apart), and the headers' indices are `stickyHeaderIndices`. Each
 *   header is one element named "Europe, 9 countries" and announced as a header.
 * - Search filters by name, ignoring case and accents (`filterCountries`); a continent with no
 *   match loses its header and the counts are those of what is shown. It filters the LIST and not
 *   the figures above it. The query is component state: it resets when the sheet leaves the full
 *   detent (the screen unmounts the list), and nothing is stored.
 * - States (FR-064): no countries yet says how one appears; a search with no match says so in
 *   words and offers "Clear search". Loading is the screen's skeleton, not this component's.
 * - In a `Sheet` the list takes its scroll wiring (`useSheetScroll`): it scrolls only once the
 *   sheet has settled at full, does not bounce and hands the finger back to the sheet at its top.
 *   Outside one it is a plain list.
 * - The countries figure is `travelSummary`'s statistic, so planned trips and countries this
 *   device has no name for are counted there but cannot all be listed (`country-summary.ts`).
 *   It reads the traveller's own local records only and shows nobody else's (FR-084).
 *
 * Ids: `countries-list`, `countries-search` (the input), `countries-collapse`, `countries-ring`,
 * `countries-stamps` with `countries-stamp-<iso2>`, `countries-header-<continent>`.
 */
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { isLargeText } from '@/components/ui/reflow';
import { SheetScrollable, useSheetScroll } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { countOf } from '@/features/home/home-format';
import {
  filterCountries,
  groupByContinent,
  recentVisits,
  type ContinentGroup,
  type ContinentName,
  type CountrySummary,
} from '@/features/passport/country-summary';
import type { CountryOverview } from '@/features/passport/use-country-overview';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';

import { CountriesSummaryCard } from './countries-summary-card';
import { CountryRow } from './country-row';

export interface CountriesListProps {
  overview: CountryOverview;
  /** A row was pressed: the Home lowers the sheet to half and flies the globe to it. */
  onSelectCountry: (country: CountrySummary) => void;
  /** The collapse control: the Home lowers the sheet to half. */
  onCollapse: () => void;
  /** Room under the last row for the tab pill, in dp. Default 0. */
  contentInsetBottom?: number;
}

type ListItem =
  | { type: 'header'; key: string; continent: ContinentName; count: number }
  | { type: 'country'; key: string; country: CountrySummary };

/** The header text of a group of countries that is not on a continent. */
const OTHER = 'Other';

const headerName = (continent: ContinentName) =>
  continent === 'Unknown' ? OTHER : continent;

/** One item per header and per country, in order. */
function listItems(groups: readonly ContinentGroup[]): ListItem[] {
  return groups.flatMap((group): ListItem[] => [
    {
      type: 'header',
      key: `continent-${group.continent}`,
      continent: group.continent,
      count: group.countries.length,
    },
    ...group.countries.map((country): ListItem => ({
      type: 'country',
      key: `country-${country.countryId}`,
      country,
    })),
  ]);
}

/**
 * A continent's header. FlashList draws the header that is pinned to the top as a SECOND copy
 * over the list (`target` is `'StickyHeader'`); that copy is decoration, hidden from assistive
 * technology and without the id, so the header is read, and found, once.
 */
function ContinentHeader({
  continent,
  count,
  pinned,
}: {
  continent: ContinentName;
  count: number;
  pinned: boolean;
}) {
  const { languageTag } = deviceLocale();
  const name = headerName(continent);
  const words = countOf(count, 'country', 'countries', languageTag);
  return (
    <View
      testID={pinned ? undefined : `countries-header-${continent}`}
      accessible={pinned ? undefined : true}
      accessibilityRole={pinned ? undefined : 'header'}
      accessibilityLabel={pinned ? undefined : `${name}, ${words}`}
      accessibilityElementsHidden={pinned || undefined}
      importantForAccessibility={pinned ? 'no-hide-descendants' : undefined}
      className="flex-row items-baseline justify-between border-b border-separator bg-surface px-5 pb-2 pt-4">
      <Text variant="eyebrow" tone="muted">
        {name}
      </Text>
      <Text variant="label" tone="muted">
        {words}
      </Text>
    </View>
  );
}

/** The heading with its collapse control, and the search field once there is something to search. */
function CountriesHeader({
  searchable,
  query,
  onQueryChange,
  onCollapse,
}: {
  searchable: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onCollapse: () => void;
}) {
  return (
    <View className="gap-3 px-5 pb-1">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="title">Countries</Text>
        <IconButton
          icon="chevron-down"
          variant="tonal"
          accessibilityLabel="Collapse the countries list"
          onPress={onCollapse}
          testID="countries-collapse"
        />
      </View>
      {searchable ? (
        <Field
          label="Search countries"
          value={query}
          onChangeText={onQueryChange}
          testID="countries-search"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      ) : null}
    </View>
  );
}

/** What the list says when it has no rows: no countries yet, or a search that found none. */
function NoCountries({
  query,
  onClear,
}: {
  query: string;
  onClear: (() => void) | null;
}) {
  return (
    <View className="px-5 pt-2">
      {onClear === null ? (
        <EmptyState
          variant="ghost-stamp"
          title="No countries yet"
          detail="Add a stop to a trip and its country appears here."
        />
      ) : (
        <EmptyState
          variant="filtered"
          title={`No countries match \u201c${query.trim()}\u201d`}
          detail="Try another name."
          action={{ label: 'Clear search', onPress: onClear }}
        />
      )}
    </View>
  );
}

/** The flat list: a header and its countries, per continent, filtered by the search. */
function useCountryItems(overview: CountryOverview, query: string) {
  const { summaries, groups } = overview;
  return useMemo(() => {
    const shown = filterCountries(summaries, query);
    const items = listItems(shown === summaries ? groups : groupByContinent(shown));
    const sticky = items.flatMap((item, index) =>
      item.type === 'header' ? [index] : [],
    );
    return { items, sticky };
  }, [summaries, groups, query]);
}

/** How each item is drawn: a header (or its pinned copy), or a country's row. */
function itemRenderer(
  onSelect: (country: CountrySummary) => void,
): ListRenderItem<ListItem> {
  const renderItem: ListRenderItem<ListItem> = ({ item, target }) =>
    item.type === 'header' ? (
      <ContinentHeader
        continent={item.continent}
        count={item.count}
        pinned={target === 'StickyHeader'}
      />
    ) : (
      <View className="px-5">
        <CountryRow country={item.country} onSelect={onSelect} />
      </View>
    );
  return renderItem;
}

export function CountriesList({
  overview,
  onSelectCountry,
  onCollapse,
  contentInsetBottom = 0,
}: CountriesListProps) {
  const { fontScale } = useAppearance();
  const sheet = useSheetScroll();
  const [query, setQuery] = useState('');
  const { summaries, totals } = overview;
  const { items, sticky } = useCountryItems(overview, query);
  const stamps = useMemo(() => recentVisits(summaries, 2), [summaries]);

  return (
    <View testID="countries-list" className="flex-1">
      <CountriesHeader
        searchable={summaries.length > 0}
        query={query}
        onQueryChange={setQuery}
        onCollapse={onCollapse}
      />
      <SheetScrollable>
        <FlashList
          {...sheet?.scrollProps}
          data={items}
          renderItem={itemRenderer(onSelectCountry)}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          stickyHeaderIndices={sticky}
          ListHeaderComponent={
            <CountriesSummaryCard
              totals={totals}
              stamps={stamps}
              stacked={isLargeText(fontScale)}
            />
          }
          ListEmptyComponent={
            <NoCountries
              query={query}
              onClear={summaries.length === 0 ? null : () => setQuery('')}
            />
          }
          contentContainerStyle={{ paddingBottom: contentInsetBottom }}
          keyboardShouldPersistTaps="handled"
        />
      </SheetScrollable>
    </View>
  );
}
