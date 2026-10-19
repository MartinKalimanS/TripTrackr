/**
 * `CountryRow` - one country of the Countries list (feature 005, T536; contract C5-23; FR-016,
 * FR-017, FR-070, FR-074, FR-076): a flag chip, the name, "First visited 2021", a "Now" marker
 * where the live trip is, "3 trips" and a chevron, at least 60 dp tall.
 *
 *   <CountryRow country={summary} onSelect={(country) => flyTo(country)} />
 *
 * ONE control (a `Tappable`) named "Portugal, 3 trips, first visited 2021" (", now" at the end
 * where the live trip is; "planned 2027" instead of a first visit for a country with only
 * trips still to come: nothing is claimed that has not happened) with the hint "Shows it on the
 * globe". The row is the screen reader's way into the globe (FR-017), and pressing it is how
 * the Home lowers the sheet to half and flies the globe to the country: that is the parent's,
 * `onSelect` hands it the whole summary (its `focus` says where). The flag is decoration (the
 * name is beside it). The name is one line and wraps from a font scale of 1.15, when nothing may
 * be clipped (FR-074); the row has a minimum height, never a fixed one.
 *
 * Ids: `country-row-<iso2>`, with `-flag`, `-now`, `-trips` and `-cue`.
 */
import { View } from 'react-native';

import { STATUS_LOOKS } from '@/components/ui/chip-look';
import { FlagChip } from '@/components/ui/flag-chip';
import { PressCue } from '@/components/ui/press-cue';
import { isLargeText } from '@/components/ui/reflow';
import { SoftLabel } from '@/components/ui/soft-label';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { countParts, yearOf } from '@/features/home/home-format';
import type { CountrySummary } from '@/features/passport/country-summary';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';

export interface CountryRowProps {
  country: CountrySummary;
  onSelect: (country: CountrySummary) => void;
}

/** The row's minimum height in dp (the contract's 60). */
const ROW_HEIGHT = 60;

/** The words of a row, once, for the screen and for the name. */
function describe(country: CountrySummary, languageTag: string) {
  const trips = countParts(country.tripCount, 'trip', 'trips', languageTag);
  const year = yearOf(country.firstVisit, languageTag);
  const since = country.planned ? 'Planned' : 'First visited';
  const parts = [
    country.name,
    `${trips.figure} ${trips.noun}`,
    `${since.toLowerCase()} ${year}`,
  ];
  if (country.isNow) parts.push('now');
  return { trips, since: `${since} ${year}`, name: parts.join(', ') };
}

export function CountryRow({ country, onSelect }: CountryRowProps) {
  const { fontScale } = useAppearance();
  const { languageTag } = deviceLocale();
  const lines = isLargeText(fontScale) ? undefined : 1;
  const { trips, since, name } = describe(country, languageTag);

  return (
    <Tappable
      testID={`country-row-${country.iso2}`}
      accessibilityLabel={name}
      accessibilityHint="Shows it on the globe"
      onPress={() => onSelect(country)}
      style={{ minHeight: ROW_HEIGHT }}>
      <View className="flex-row items-center gap-3 py-2">
        <FlagChip
          iso2={country.iso2}
          size="lg"
          testID={`country-row-${country.iso2}-flag`}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="callout" numberOfLines={lines} className="shrink">
              {country.name}
            </Text>
            {country.isNow ? (
              <SoftLabel
                testID={`country-row-${country.iso2}-now`}
                look={STATUS_LOOKS.active}
                label="Now"
                accessibilityLabel="Now"
                leading={<View className="size-2 rounded-full bg-accent-line" />}
              />
            ) : null}
          </View>
          <Text variant="label" tone="muted">
            {since}
          </Text>
        </View>
        <Text variant="label" tone="muted" testID={`country-row-${country.iso2}-trips`}>
          <Text variant="label" strong>
            {trips.figure}
          </Text>
          {` ${trips.noun}`}
        </Text>
        <PressCue testID={`country-row-${country.iso2}-cue`} />
      </View>
    </Tappable>
  );
}
