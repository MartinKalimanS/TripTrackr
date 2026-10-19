/**
 * `StatsRow` - the three figures of the half sheet (feature 005, T535; contracts C5-18 and
 * C5-23; FR-014, FR-060, FR-074, FR-076, FR-077; research D5-11): countries "N /195", trips and
 * kilometres, three `StatTile`s with a hairline between them, each figure counting up once
 * (`AnimatedNumber`, the three one after the other).
 *
 *   <StatsRow countries={14} trips={22} distanceKm={61480} onOpenCountries={full} onOpenTrips={trips} />
 *
 * What a flow reads is what it was: `globe-stat-countries` is the PLAIN number ("5": the
 * "/195" is a sibling, flow 03 asserts the number), `globe-stat-distance` the plain distance
 * (the unit is the label, "Kilometres" or "Miles", so the number has the room: a 36 dp numeral
 * in a third of the width shrinks to fit rather than clip), `globe-stats` the container.
 * `globe-stat-trips` is new.
 *
 * What a screen reader hears is the FINAL value, once, in words: "14 of 195 countries",
 * "22 trips", "61,480 kilometres travelled". The countries tile is a button that opens the
 * Countries list (the full detent) and the trips tile one that opens the Trips tab; the
 * kilometres are announced and are not a control (FR-014).
 *
 * Figures follow the device (FR-077): `Intl` groups the digits, the distance is in miles where
 * the device measures in them, and from seven digits a figure goes compact ("1.26M") instead of
 * overflowing. At a font scale of 1.15 and above the three stack into rows (the tile itself
 * trades its figure and label into a row, `StatTile`), with the hairlines across.
 */
import { View } from 'react-native';

import { AnimatedNumber } from '@/components/ui/animated-number';
import { isLargeText } from '@/components/ui/reflow';
import { StatTile } from '@/components/ui/stat-tile';
import { countOf, figureFormat } from '@/features/home/home-format';
import { WORLD_COUNTRIES } from '@/features/passport/country-summary';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale, distanceFigure, formatDistance } from '@/lib/locale';
import { Motion } from '@/theme';

export interface StatsRowProps {
  /** `travelSummary`'s countries figure. */
  countries: number;
  trips: number;
  distanceKm: number;
  /** The countries tile: opens the Countries list. */
  onOpenCountries: () => void;
  /** The trips tile: opens the Trips tab. */
  onOpenTrips: () => void;
}

/** A figure that counts up, its id on the visible numeral and its name the final value. */
function Counting({
  value,
  index,
  testID,
}: {
  value: number;
  index: number;
  testID: string;
}) {
  return (
    <AnimatedNumber
      value={value}
      format={figureFormat(value)}
      delay={index * Motion.countUpStaggerMs}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      testID={testID}
    />
  );
}

function Divider({ stacked }: { stacked: boolean }) {
  return (
    <View
      testID="globe-stats-divider"
      className={
        stacked ? 'h-px self-stretch bg-separator' : 'w-px self-stretch bg-separator'
      }
    />
  );
}

function CountriesTile({
  countries,
  onPress,
}: {
  countries: number;
  onPress: () => void;
}) {
  const { languageTag } = deviceLocale();
  const name = `${new Intl.NumberFormat(languageTag).format(countries)} of ${WORLD_COUNTRIES} countries`;
  return (
    <StatTile
      testID="globe-stats-countries-tile"
      value={<Counting value={countries} index={0} testID="globe-stat-countries" />}
      of={WORLD_COUNTRIES}
      label="Countries"
      accessibilityLabel={name}
      onPress={onPress}
    />
  );
}

function TripsTile({ trips, onPress }: { trips: number; onPress: () => void }) {
  const { languageTag } = deviceLocale();
  return (
    <StatTile
      testID="globe-stats-trips-tile"
      value={<Counting value={trips} index={1} testID="globe-stat-trips" />}
      label={trips === 1 ? 'Trip' : 'Trips'}
      accessibilityLabel={countOf(trips, 'trip', 'trips', languageTag)}
      onPress={onPress}
    />
  );
}

/** The kilometres: announced, and not a control. */
function DistanceTile({ distanceKm }: { distanceKm: number }) {
  const locale = deviceLocale();
  const { value, unit } = distanceFigure(distanceKm, locale);
  return (
    <StatTile
      testID="globe-stats-distance-tile"
      value={<Counting value={value} index={2} testID="globe-stat-distance" />}
      label={unit === 'mi' ? 'Miles' : 'Kilometres'}
      accessibilityLabel={`${formatDistance(distanceKm, locale).spoken} travelled`}
    />
  );
}

export function StatsRow({
  countries,
  trips,
  distanceKm,
  onOpenCountries,
  onOpenTrips,
}: StatsRowProps) {
  const { fontScale } = useAppearance();
  const stacked = isLargeText(fontScale);
  const cells = stacked ? ['', '', ''] : ['flex-1 pr-3', 'flex-1 px-3', 'flex-1 pl-3'];

  return (
    <View
      testID="globe-stats"
      className={stacked ? 'gap-1' : 'items-stretch'}
      style={{ flexDirection: stacked ? 'column' : 'row' }}>
      <View className={cells[0]}>
        <CountriesTile countries={countries} onPress={onOpenCountries} />
      </View>
      <Divider stacked={stacked} />
      <View className={cells[1]}>
        <TripsTile trips={trips} onPress={onOpenTrips} />
      </View>
      <Divider stacked={stacked} />
      <View className={cells[2]}>
        <DistanceTile distanceKm={distanceKm} />
      </View>
    </View>
  );
}
