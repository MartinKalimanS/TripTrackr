/**
 * `NowCard` - the live trip on the Home sheet (feature 005, T535; contract C5-23; FR-014,
 * FR-015, FR-070, FR-074, FR-076): a thumbnail, the title, "Day 3 of 8 . Sintra", a strip of
 * the trip's stops and a chevron. With no live trip it is the next planned trip ("Jan 2027 . in
 * 94 days", no strip), and the parent shows nothing at all when there is neither.
 *
 *   <NowCard trip={now} onPress={() => router.push(`/trip/${now.id}`)} />
 *   <NowCard trip={now} compact onPress={open} />        at peek: a 56 dp thumbnail, a one-line title
 *
 * The card is ONE control (`Card` with `onPress`: role button, the hint "Opens the trip") named
 * with everything it shows ("Portugal Road Trip, active, day 3 of 8, in Sintra"), so the
 * thumbnail, the strip and the live dot are decoration and are hidden from assistive
 * technology. Status is the word and the shape of the dots, never the colour alone (FR-070).
 * The title is two lines (one at peek) and grows with the text size; nothing is a fixed height.
 *
 * Id: `home-now-card` (the thumbnail's parts are `-thumb`, `-photo`, `-generated`, the dots
 * `-dot`, the cue `-cue`). A trip with no photograph shows the generated cover (FR-008).
 */
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { liveLine, tripLabel, tripLine } from '@/features/home/home-copy';
import type { HomeTrip } from '@/features/home/home-trips';
import { deviceLocale } from '@/lib/locale';

import { StopDots } from './stop-dots';
import { TripThumb } from './trip-thumb';

export interface NowCardProps {
  trip: HomeTrip;
  /** At peek: a 56 dp thumbnail and a one-line title. */
  compact?: boolean;
  onPress: () => void;
}

const THUMB_IDS = {
  thumb: 'home-now-card-thumb',
  photo: 'home-now-card-photo',
  generated: 'home-now-card-generated',
} as const;

export function NowCard({ trip, compact = false, onPress }: NowCardProps) {
  const { languageTag } = deviceLocale();
  const live = trip.status === 'active';
  const line = live ? liveLine(trip) : tripLine(trip, languageTag);

  return (
    <Card
      testID="home-now-card"
      variant="tile"
      accessibilityLabel={tripLabel(trip, languageTag)}
      accessibilityHint="Opens the trip"
      onPress={onPress}
      innerClassName="p-3">
      <View className="flex-row items-center gap-3">
        <TripThumb
          tripId={trip.id}
          title={trip.title}
          cover={trip.cover}
          iso2={trip.iso2}
          size={compact ? 56 : 64}
          ids={THUMB_IDS}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="callout" numberOfLines={compact ? 1 : 2}>
            {trip.title}
          </Text>
          {line === '' ? null : (
            <View className="flex-row items-center gap-2">
              {live ? (
                <View
                  className="size-2 rounded-full bg-accent-line"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : null}
              <Text variant="label" tone="muted" className="shrink">
                {line}
              </Text>
            </View>
          )}
          {live ? <StopDots strip={trip.strip} dotTestID="home-now-card-dot" /> : null}
        </View>
      </View>
    </Card>
  );
}
