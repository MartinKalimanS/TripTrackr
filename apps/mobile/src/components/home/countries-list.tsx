/**
 * `CountriesList` - the full detent of the Home sheet and the screen reader's alternative to
 * the globe (feature 005, T536 and F2; contract C5-23; FR-016, FR-017, FR-064, FR-084; owner
 * question Q-2; pictures `home-full.png` and `countries-scale1.5.png`). From the top: the
 * heading "Countries" (`headline`) over "14 of 195 . 4 continents" (`label`, `muted`) with the
 * round search button at the right, then the countries under sticky continent labels
 * ("EUROPE . 9", `eyebrow`, `muted`, a hairline under), in a FlashList.
 *
 *   <CountriesList overview={overview} onSelectCountry={flyTo} onCollapse={() => setDetent('half')}
 *     contentInsetBottom={tabZone + 16} />
 *
 * - **Search.** The pictured round button reveals the filter field that already exists
 *   (`countries-search`, "Search countries") under the heading and focuses it; pressed again
 *   ("Close search") it hides the field and clears the query. It is the real filter, not a
 *   coming-soon control (no capability is invented). With no countries there is nothing to
 *   search: no button and no field.
 * - **Collapse.** The picture has no collapse control (the handle lowers the sheet), but the one
 *   that was reachable stays so (FR-081): `countries-collapse` is an invisible, focusable button
 *   named "Collapse the countries list", for screen readers and switch access.
 * - The list is flat: one item per label and per country, `getItemType` is the item's type (so
 *   a label and a row recycle apart), and the labels' indices are `stickyHeaderIndices`. Each
 *   label is one element named "Europe, 9 countries" and announced as a header.
 * - Search filters by name, ignoring case and accents (`filterCountries`); a continent with no
 *   match loses its label and the counts are those of what is shown. It filters the LIST and not
 *   the figures above it. The query is component state: it resets when the sheet leaves the full
 *   detent (the screen unmounts the list), and nothing is stored.
 * - States (FR-064): no countries yet says how one appears; a search with no match says so in
 *   words and offers "Clear search". Loading is the screen's skeleton, not this component's.
 * - In a `Sheet` the list takes its scroll wiring (`useSheetScroll`): it scrolls only once the
 *   sheet has settled at full, does not bounce and hands the finger back to the sheet at its top.
 *   Outside one it is a plain list.
 * - The countries figure is `travelSummary`'s statistic, so planned trips and countries this
 *   device has no name for are counted there but cannot all be listed (`country-summary.ts`).
 *   195 is the fixed reference. It reads the traveller's own local records only (FR-084).
 * - **Every country is reachable** (SC-015): while a screen reader is on the list keeps all its
 *   rows mounted (`useReachAllDistance`), so each country is a node a reader finds by name; with
 *   none it recycles as usual.
 * - Margins: 20 dp at the sides, 16 dp on Android (`ScreenMargin`); the list ends
 *   `contentInsetBottom` above the bottom so the last row clears the tab pill.
 *
 * Ids: `countries-list`, `countries-search` (the input), `countries-search-toggle` (the round
 * button), `countries-collapse`, `countries-header-<continent>`.
 */
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { SheetScrollable, useSheetScroll } from '@/components/ui/sheet';
import { EmptyState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { countOf } from '@/features/home/home-format';
import {
  continentLabel,
  continentName,
  countriesSubtitle,
} from '@/features/passport/country-copy';
import {
  filterCountries,
  groupByContinent,
  type ContinentGroup,
  type ContinentName,
  type CountrySummary,
} from '@/features/passport/country-summary';
import type { CountryOverview } from '@/features/passport/use-country-overview';
import { useReachAllDistance } from '@/hooks/use-reach-all';
import { deviceLocale } from '@/lib/locale';
import { ScreenMargin } from '@/theme';

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

/** The side margin of the list: 20 dp, 16 dp on an Android list. */
const MARGIN =
  Platform.OS === 'android' ? ScreenMargin.androidList : ScreenMargin.default;

/** One item per label and per country, in order. */
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
 * A continent's sticky label, "EUROPE . 9", with a hairline under it inset by the margin.
 * FlashList draws the label that is pinned to the top as a SECOND copy over the list (`target`
 * is `'StickyHeader'`); that copy is decoration, hidden from assistive technology and without
 * the id, so the label is read, and found, once.
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
  const words = countOf(count, 'country', 'countries', languageTag);
  return (
    <View
      testID={pinned ? undefined : `countries-header-${continent}`}
      accessible={pinned ? undefined : true}
      accessibilityRole={pinned ? undefined : 'header'}
      accessibilityLabel={pinned ? undefined : `${continentName(continent)}, ${words}`}
      accessibilityElementsHidden={pinned || undefined}
      importantForAccessibility={pinned ? 'no-hide-descendants' : undefined}
      className="bg-surface"
      style={{ paddingHorizontal: MARGIN }}>
      <View className="border-b border-separator py-2">
        <Text variant="eyebrow" tone="muted">
          {continentLabel(continent, count, languageTag)}
        </Text>
      </View>
    </View>
  );
}

/** An invisible, focusable stand-in for the control the picture does not draw (FR-081). */
function CollapseControl({ onCollapse }: { onCollapse: () => void }) {
  return (
    <Pressable
      testID="countries-collapse"
      accessible
      accessibilityRole="button"
      accessibilityLabel="Collapse the countries list"
      onPress={onCollapse}
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1 }}
    />
  );
}

interface CountriesHeaderProps {
  subtitle: string;
  searchable: boolean;
  searching: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleSearch: () => void;
  onCollapse: () => void;
}

/** The heading, its second line, the round search button and, when open, the filter field. */
function CountriesHeader(props: CountriesHeaderProps) {
  const { subtitle, searchable, searching, query, onQueryChange } = props;
  return (
    <View style={{ paddingHorizontal: MARGIN }} className="gap-3 pb-3">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text variant="headline">Countries</Text>
          <Text variant="label" tone="muted">
            {subtitle}
          </Text>
        </View>
        {searchable ? (
          <IconButton
            icon="search"
            variant="tonal"
            accessibilityLabel={searching ? 'Close search' : 'Search countries'}
            onPress={props.onToggleSearch}
            testID="countries-search-toggle"
          />
        ) : null}
      </View>
      {searchable && searching ? (
        <Field
          label="Search countries"
          value={query}
          onChangeText={onQueryChange}
          testID="countries-search"
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      ) : null}
      <CollapseControl onCollapse={props.onCollapse} />
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
    <View style={{ paddingHorizontal: MARGIN }} className="pt-2">
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

/** The flat list: a label and its countries, per continent, filtered by the search. */
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

/** How each item is drawn: a label (or its pinned copy), or a country's row. */
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
      <View style={{ paddingHorizontal: MARGIN }}>
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
  const sheet = useSheetScroll();
  const { languageTag } = deviceLocale();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const { summaries, totals } = overview;
  const { items, sticky } = useCountryItems(overview, query);
  const drawDistance = useReachAllDistance(items.length);
  const toggleSearch = () => {
    if (searching) setQuery('');
    setSearching(!searching);
  };

  return (
    <View testID="countries-list" className="flex-1">
      <CountriesHeader
        subtitle={countriesSubtitle(totals, languageTag)}
        searchable={summaries.length > 0}
        searching={searching}
        query={query}
        onQueryChange={setQuery}
        onToggleSearch={toggleSearch}
        onCollapse={onCollapse}
      />
      <SheetScrollable>
        <FlashList
          {...sheet?.scrollProps}
          {...(drawDistance === undefined ? null : { drawDistance })}
          data={items}
          renderItem={itemRenderer(onSelectCountry)}
          keyExtractor={(item) => item.key}
          getItemType={(item) => item.type}
          stickyHeaderIndices={sticky}
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
