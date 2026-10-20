/**
 * `CountryRow` - one country of the Countries list (feature 005, F2; contract C5-23; FR-016,
 * FR-017, FR-070, FR-074, FR-076; pictures `home-full.png`, `countries-scale1.5.png`): a 28 by
 * 20 flag chip, the name (`callout`), "2 trips · last Oct 2026" (`label`, `muted`), a "Now"
 * marker where the live trip is and a chevron, at least 60 dp tall.
 *
 *   <CountryRow country={summary} onSelect={(country) => flyTo(country)} />
 *
 * ONE control (a `Tappable`) named "Portugal, 2 trips, last visited Oct 2026" (", now" at the
 * end where the live trip is; "planned Mar 2027" instead of a last visit for a country with
 * only trips still to come: nothing is claimed that has not happened) with the hint "Shows it
 * on the globe". The row is the screen reader's way into the globe (FR-017), and pressing it is
 * how the Home lowers the sheet to half and flies the globe to the country: that is the
 * parent's, `onSelect` hands it the whole summary (its `focus` says where). The flag is
 * decoration (the name is beside it) and keeps its size at any text size. The name and the
 * second line are one line each and wrap from a font scale of 1.15 (the second line to two
 * lines or more), when nothing may be clipped (FR-074); the row has a minimum height, never a
 * fixed one.
 *
 * Ids: `country-row-<iso2>`, with `-flag`, `-now`, `-trips` (the "2 trips" words of the second
 * line), `-meta` (the whole second line) and `-cue`.
 */
import { View } from 'react-native';

import { STATUS_LOOKS } from '@/components/ui/chip-look';
import { FlagChip } from '@/components/ui/flag-chip';
import { PressCue } from '@/components/ui/press-cue';
import { isLargeText } from '@/components/ui/reflow';
import { SoftLabel } from '@/components/ui/soft-label';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { countryLabel, countryMeta } from '@/features/passport/country-copy';
import type { CountrySummary } from '@/features/passport/country-summary';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';

export interface CountryRowProps {
  country: CountrySummary;
  onSelect: (country: CountrySummary) => void;
}

/** The row's minimum height in dp (the contract's 60). */
const ROW_HEIGHT = 60;

export function CountryRow({ country, onSelect }: CountryRowProps) {
  const { fontScale } = useAppearance();
  const { languageTag } = deviceLocale();
  const lines = isLargeText(fontScale) ? undefined : 1;
  const { trips, when } = countryMeta(country, languageTag);
  const id = `country-row-${country.iso2}`;

  return (
    <Tappable
      testID={id}
      accessibilityLabel={countryLabel(country, languageTag)}
      accessibilityHint="Shows it on the globe"
      onPress={() => onSelect(country)}
      style={{ minHeight: ROW_HEIGHT }}>
      <View className="flex-row items-center gap-3 py-2">
        <FlagChip iso2={country.iso2} size="lg" testID={`${id}-flag`} />
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="callout" numberOfLines={lines} className="shrink">
              {country.name}
            </Text>
            {country.isNow ? (
              <SoftLabel
                testID={`${id}-now`}
                look={STATUS_LOOKS.active}
                label="Now"
                accessibilityLabel="Now"
                leading={<View className="size-2 rounded-full bg-accent-line" />}
              />
            ) : null}
          </View>
          <Text variant="label" tone="muted" numberOfLines={lines} testID={`${id}-meta`}>
            <Text variant="label" tone="muted" testID={`${id}-trips`}>
              {trips}
            </Text>
            {` \u00b7 ${when}`}
          </Text>
        </View>
        <PressCue testID={`${id}-cue`} />
      </View>
    </Tappable>
  );
}
