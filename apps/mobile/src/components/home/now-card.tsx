/**
 * `NowCard` - the live trip on the Home sheet (feature 005, T535; contract C5-23; FR-014,
 * FR-015, FR-070, FR-074, FR-076): a thumbnail, the title, "Day 3 of 8 . Sintra", a strip of
 * the trip's stops and a chevron. With no live trip it is the next planned trip ("Jan 2027 . in
 * 94 days", no strip), and the parent shows nothing at all when there is neither.
 *
 *   <NowCard trip={now} onPress={() => router.push(`/trip/${now.id}`)} />
 *   <NowCard trip={now} compact onPress={open} />        at peek: a 56 dp thumbnail
 *   <NowCard trip={now} compact onPress={open} onExpand={raise} />   at peek, as pictured
 *
 * As the pictures draw it (prototype `.now-card`): the cream tile, 24 dp corners, 8 dp padding
 * and a hairline; a 64 dp thumbnail with 16 dp corners (56 dp at peek, 48 dp from a font scale
 * of 1.15); the title in the `callout` role on ONE line with an ellipsis (two lines at large
 * text); a live dot (8 dp, `accentLine`, a 3 dp `accentTint` halo) before the `label` line in
 * the `muted` ink; 6 dp stop dots 4 dp apart; and a 20 dp chevron in `subtle`, 8 dp from the edge
 * (2 dp at peek).
 *
 * At peek the picture's chevron points UP: the card there raises the sheet. That is what
 * `onExpand` is: given it, a compact card's press calls it, its cue is the up chevron and its
 * hint is "Shows more"; without it the card opens the trip and the cue is the right chevron
 * (a cue never promises what the press does not do).
 *
 * The card is ONE control (`Card` with `onPress`: role button) named with everything it shows
 * ("Portugal Road Trip, active, day 3 of 8, in Sintra"), so the thumbnail, the strip and the
 * live dot are decoration and are hidden from assistive technology. Status is the word and
 * the shape of the dots, never the colour alone (FR-070). Nothing is a fixed height.
 *
 * Id: `home-now-card` (the thumbnail's parts are `-thumb`, `-photo`, `-generated`, the dots
 * `-dot`, the cue `-cue`). A trip with no photograph shows the generated cover (FR-008).
 */
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { isLargeText } from '@/components/ui/reflow';
import { Text } from '@/components/ui/text';
import { liveLine, tripLabel, tripLine } from '@/features/home/home-copy';
import type { HomeTrip } from '@/features/home/home-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { deviceLocale } from '@/lib/locale';

import { StopDots } from './stop-dots';
import { TripThumb } from './trip-thumb';

export interface NowCardProps {
  trip: HomeTrip;
  /** At peek: a 56 dp thumbnail and the up chevron when `onExpand` is given. */
  compact?: boolean;
  /** Opens the trip. */
  onPress: () => void;
  /** At peek only: raises the sheet instead (the pictured up chevron). */
  onExpand?: () => void;
}

const THUMB_IDS = {
  thumb: 'home-now-card-thumb',
  photo: 'home-now-card-photo',
  generated: 'home-now-card-generated',
} as const;

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** The thumbnail's size: 64, 56 at peek, 48 at large text (the corner stays 16). */
export function thumbSize(compact: boolean, large: boolean): 48 | 56 | 64 {
  if (large) return 48;
  return compact ? 56 : 64;
}

/** 8 dp dot, 3 dp tint halo; the halo takes no room (the prototype's box-shadow spread). */
function LiveDot() {
  return (
    <View
      testID="home-now-card-live-dot"
      className="size-3.5 items-center justify-center rounded-full bg-accent-tint"
      style={styles.halo}
      {...HIDDEN}>
      <View className="size-2 rounded-full bg-accent-line" />
    </View>
  );
}

function Cue({ up, compact }: { up: boolean; compact: boolean }) {
  return (
    <View style={compact ? styles.cuePeek : styles.cue}>
      <Icon
        name={up ? 'chevron-up' : 'chevron-right'}
        size={20}
        tone="subtle"
        testID="home-now-card-cue"
      />
    </View>
  );
}

/** The title, the live line and the stop dots. */
function Details({ trip, lines }: { trip: HomeTrip; lines: number }) {
  const { languageTag } = deviceLocale();
  const live = trip.status === 'active';
  const line = live ? liveLine(trip) : tripLine(trip, languageTag);
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text variant="callout" numberOfLines={lines}>
        {trip.title}
      </Text>
      {line === '' ? null : (
        <View className="flex-row items-center gap-2">
          {live ? <LiveDot /> : null}
          <Text variant="label" tone="muted" numberOfLines={lines} className="shrink">
            {line}
          </Text>
        </View>
      )}
      {live ? (
        <View className="mt-1">
          <StopDots strip={trip.strip} dotTestID="home-now-card-dot" />
        </View>
      ) : null}
    </View>
  );
}

export function NowCard({ trip, compact = false, onPress, onExpand }: NowCardProps) {
  const { fontScale } = useAppearance();
  const { languageTag } = deviceLocale();
  const large = isLargeText(fontScale);
  const expand = compact ? onExpand : undefined;
  const raises = expand !== undefined;

  return (
    <Card
      testID="home-now-card"
      variant="tile"
      radius="xl"
      cue={false}
      accessibilityLabel={tripLabel(trip, languageTag)}
      accessibilityHint={raises ? 'Shows more' : 'Opens the trip'}
      onPress={expand ?? onPress}
      innerClassName="p-2">
      <View className="flex-row items-center gap-3">
        <TripThumb
          tripId={trip.id}
          title={trip.title}
          cover={trip.cover}
          iso2={trip.iso2}
          size={thumbSize(compact, large)}
          corner="lg"
          ids={THUMB_IDS}
        />
        <Details trip={trip} lines={large ? 2 : 1} />
        <Cue up={raises} compact={compact} />
      </View>
    </Card>
  );
}

/** The halo is 3 dp outside the 8 dp dot; negative margins keep the layout at 8 dp, and the
 * prototype's 2 dp `margin-right` leaves the gap to the text at 10. */
const styles = StyleSheet.create({
  halo: { margin: -3, marginEnd: -1 },
  cue: { marginEnd: 8 },
  cuePeek: { marginEnd: 2 },
});
