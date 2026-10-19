/**
 * The ring card at the top of the Countries list (feature 005, T536; contract C5-23; FR-016,
 * FR-076; owner question Q-2): the share of the world as a ring with the number in it, "14 of
 * 195", "4 of 7 continents . 19 trips", and the stamps of the two newest visits.
 *
 * It is read as ONE element ("14 of 195 countries, 4 of 7 continents, 19 trips"); the ring and
 * the stamps are decoration, hidden from assistive technology (the stamps are the passport's art,
 * and the rows below name every country). At a font scale of 1.15 and above the stamps are left
 * out so the words keep the room. 195 and 7 are fixed reference numbers (Q-2); the countries
 * figure is `travelSummary`'s.
 *
 * Ids: `countries-ring`, `countries-stamps`, `countries-stamp-<iso2>`.
 */
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Stamp } from '@/components/ui/stamp';
import { stampSpec } from '@/components/ui/stamp-spec';
import { Text } from '@/components/ui/text';
import { countOf, countParts } from '@/features/home/home-format';
import type { CountrySummary, WorldTotals } from '@/features/passport/country-summary';
import { deviceLocale } from '@/lib/locale';

export interface CountriesSummaryCardProps {
  totals: WorldTotals;
  /** The countries of the newest stamps, newest first: at most two. */
  stamps: readonly CountrySummary[];
  /** Large text: no stamps. */
  stacked: boolean;
}

/** The newest stamps side by side, the second tilted over the first. */
function Stamps({ stamps }: { stamps: readonly CountrySummary[] }) {
  return (
    <View
      testID="countries-stamps"
      className="flex-row"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {stamps.map((country, index) => (
        <View key={country.iso2} className={index === 0 ? '' : '-ml-7 mt-3'}>
          <Stamp
            spec={stampSpec(country.iso2, country.firstVisit, country.name)}
            size={64}
            testID={`countries-stamp-${country.iso2}`}
          />
        </View>
      ))}
    </View>
  );
}

export function CountriesSummaryCard({
  totals,
  stamps,
  stacked,
}: CountriesSummaryCardProps) {
  const { languageTag } = deviceLocale();
  const { countries, countriesOf, continents, continentsOf, trips } = totals;
  const figure = countParts(countries, 'country', 'countries', languageTag).figure;
  const tripWords = countOf(trips, 'trip', 'trips', languageTag);
  const headline = `${figure} of ${countriesOf}`;

  return (
    <View
      accessible
      accessibilityLabel={`${headline} countries, ${continents} of ${continentsOf} continents, ${tripWords}`}
      className="px-5 pb-2 pt-3">
      <Card variant="tile">
        <View className="flex-row items-center gap-4">
          <ProgressRing
            value={countries}
            max={countriesOf}
            size={72}
            testID="countries-ring">
            <Text variant="headline">{figure}</Text>
          </ProgressRing>
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="title">{headline}</Text>
            <Text variant="label" tone="muted">
              {`${continents} of ${continentsOf} continents \u00b7 ${tripWords}`}
            </Text>
          </View>
          {stacked || stamps.length === 0 ? null : <Stamps stamps={stamps} />}
        </View>
      </Card>
    </View>
  );
}
