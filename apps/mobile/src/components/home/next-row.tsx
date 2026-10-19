/**
 * `NextRow` - the next planned trip under the live one on the Home sheet (feature 005, T535;
 * contract C5-23; FR-014, FR-070, FR-074, FR-076): a 48 dp thumbnail, the title, a flag chip and
 * "Jan 2027 . in 94 days", with a chevron.
 *
 *   <NextRow trip={next} onPress={() => router.push(`/trip/${next.id}`)} />
 *
 * ONE control (a `Tappable`: role button, the hint "Opens the trip") named "Iceland Ring Road,
 * planned, Jan 2027, in 94 days": the thumbnail and the flag are decoration, hidden from
 * assistive technology; the status is the word "planned". The title is one line and wraps at a
 * font scale of 1.15 and above, when nothing may be clipped (FR-074).
 *
 * Id: `home-next-row` (`-thumb`, `-photo`, `-generated`, `-flag`, `-cue`).
 */
import { View } from 'react-native';

import { FlagChip } from '@/components/ui/flag-chip';
import { PressCue } from '@/components/ui/press-cue';
import { isLargeText } from '@/components/ui/reflow';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { tripLabel, tripLine } from '@/features/home/home-copy';
import type { HomeTrip } from '@/features/home/home-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';

import { TripThumb } from './trip-thumb';

export interface NextRowProps {
  trip: HomeTrip;
  onPress: () => void;
}

const THUMB_IDS = {
  thumb: 'home-next-row-thumb',
  photo: 'home-next-row-photo',
  generated: 'home-next-row-generated',
} as const;

export function NextRow({ trip, onPress }: NextRowProps) {
  const { fontScale } = useAppearance();
  const { languageTag } = deviceLocale();
  const lines = isLargeText(fontScale) ? undefined : 1;
  const line = tripLine(trip, languageTag);

  return (
    <Tappable
      testID="home-next-row"
      accessibilityLabel={tripLabel(trip, languageTag)}
      accessibilityHint="Opens the trip"
      onPress={onPress}>
      <View className="flex-row items-center gap-3 py-1">
        <TripThumb
          tripId={trip.id}
          title={trip.title}
          cover={trip.cover}
          iso2={trip.iso2}
          size={48}
          ids={THUMB_IDS}
        />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="callout" numberOfLines={lines}>
            {trip.title}
          </Text>
          {line === '' && trip.iso2 === null ? null : (
            <View className="flex-row items-center gap-2">
              {trip.iso2 === null ? null : (
                <FlagChip iso2={trip.iso2} testID="home-next-row-flag" />
              )}
              {line === '' ? null : (
                <Text
                  variant="label"
                  tone="muted"
                  numberOfLines={lines}
                  className="shrink">
                  {line}
                </Text>
              )}
            </View>
          )}
        </View>
        <PressCue testID="home-next-row-cue" />
      </View>
    </Tappable>
  );
}
