/**
 * `TicketCard` - the next planned trip, as a ticket (feature 005, T540; contract C5-19; FR-030,
 * FR-032, FR-033, FR-074, FR-075, FR-076; prototype `.ticket`).
 *
 *   <TicketCard trip={card} onPress={() => router.push(`/trip/${card.id}`)} />
 *
 * Left to right: an 88 dp thumbnail (the trip's photograph, or the thumb form of the generated
 * cover), the text (the "Planning" chip, the title in two lines at most, the flag, the country
 * and the month), and an 88 dp STUB counting the days to departure behind a 2 dp dashed `sand`
 * edge, with two notches on the edge: circles of the canvas colour with a hairline, half of each
 * clipped by the card, so the stub looks torn off. The card is at least 96 dp tall, 24 dp round,
 * on the paper with a hairline and the first lift.
 *
 * At a font scale of 1.15 and above (`isLargeText`, one threshold for the whole app) it STACKS: the
 * thumbnail across the top 88 dp high, the text, then the stub as a row under a dashed top edge,
 * the notches gone (FR-074). Nothing in it has a fixed height but that thumbnail.
 *
 * ONE control (`Tappable`, role button): the name is the one feature 004 gave a trip card,
 * "title, status, N stops" (FR-075), with the hint "Opens the trip" and the id `trip-card-<id>`; the
 * countdown is its VALUE ("Starts in 94 days"), so a screen reader hears the stub without the
 * name changing. A held press takes the pressed fill on the card's own surface at once (the
 * control behind it paints nothing). The thumbnail, the flag and the notches are decoration. The
 * sync marker is `SyncBadge`, in words.
 *
 * A trip with no days to go has no stub: a ticket is only for a planning trip with dates, but the
 * card does not assume it.
 */
import { View, useWindowDimensions, type ViewStyle } from 'react-native';

import { FlagChip } from '@/components/ui/flag-chip';
import { StatusChip } from '@/components/ui/chip';
import { useLiftStyle } from '@/components/ui/lift';
import { isLargeText } from '@/components/ui/reflow';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import {
  countdownOf,
  ticketMeta,
  describeStopCount,
  type Countdown,
} from '@/features/trips/trip-card-copy';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { cornerOf } from '@/theme';

import { TripCoverArt } from './trip-cover-art';

export interface TicketCardProps {
  trip: TripCardModel;
  onPress: () => void;
}

const MIN_HEIGHT = 96;
const THUMB = 88;
const STUB_WIDTH = 88;
const EDGE = 2;
const NOTCH = 16;
const PAD = 12;

const COLOR_KEYS = ['sand'] as const;

/** A notch: half the circle is the card's, the rest cut away by its clip. */
function Notch({ id, side }: { id: string; side: 'top' | 'bottom' }) {
  // Centred on the card's own edge: the stub is inset by `PAD`, the circle is half `NOTCH`.
  const offset = -(PAD + NOTCH / 2);
  const style: ViewStyle = {
    position: 'absolute',
    left: -(NOTCH + EDGE) / 2,
    width: NOTCH,
    height: NOTCH,
    ...cornerOf('full'),
    ...(side === 'top' ? { top: offset } : { bottom: offset }),
  };
  return (
    <View
      testID={`trip-card-${id}-notch-${side}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      className="border border-separator bg-background"
      style={style}
    />
  );
}

/** The stub: the days to go over their unit, in a column, or side by side when stacked. */
function Stub({
  id,
  countdown,
  stacked,
}: {
  id: string;
  countdown: Countdown;
  stacked: boolean;
}) {
  const { sand } = useColors(COLOR_KEYS);
  const edge: ViewStyle = stacked
    ? {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginHorizontal: PAD,
        paddingVertical: 8,
        borderTopWidth: EDGE,
      }
    : {
        width: STUB_WIDTH,
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: PAD,
        paddingHorizontal: 8,
        borderLeftWidth: EDGE,
      };
  return (
    <View
      testID={`trip-card-${id}-stub`}
      style={{ ...edge, borderStyle: 'dashed', borderColor: sand }}>
      {stacked ? null : <Notch id={id} side="top" />}
      <Text variant="numeral">{countdown.value}</Text>
      <Text variant="caption" tone="muted">
        {countdown.unit}
      </Text>
      {stacked ? null : <Notch id={id} side="bottom" />}
    </View>
  );
}

function Body({ trip, large }: { trip: TripCardModel; large: boolean }) {
  return (
    <View className="flex-1 items-start justify-center gap-1" style={{ padding: PAD }}>
      <View className="flex-row flex-wrap items-center gap-2">
        <StatusChip status={trip.status} />
        {trip.pending ? <SyncBadge state="pending" /> : null}
      </View>
      <Text variant="callout" numberOfLines={2} accessibilityRole="text">
        {trip.title}
      </Text>
      <View
        testID={`trip-card-${trip.id}-meta-row`}
        className="flex-row items-center gap-2">
        {trip.country ? (
          <FlagChip iso2={trip.country.iso2} testID={`trip-card-${trip.id}-flag`} />
        ) : null}
        <Text
          variant="label"
          tone="muted"
          numberOfLines={large ? 2 : 1}
          className="shrink">
          {ticketMeta(trip)}
        </Text>
      </View>
    </View>
  );
}

export function TicketCard({ trip, onPress }: TicketCardProps) {
  const lift = useLiftStyle('lift1');
  const { fontScale } = useWindowDimensions();
  const stacked = isLargeText(fontScale);
  const countdown = trip.daysToGo === null ? null : countdownOf(trip.daysToGo);
  const { id } = trip;

  return (
    <Tappable
      testID={`trip-card-${id}`}
      accessibilityLabel={`${trip.title}, ${trip.status}, ${describeStopCount(trip.stopCount)}`}
      accessibilityHint="Opens the trip"
      accessibilityValue={countdown ? { text: countdown.spoken } : undefined}
      onPress={onPress}
      style={[cornerOf('xl'), lift, { backgroundColor: 'transparent' }]}>
      {({ pressed }) => (
        <View
          testID={`trip-card-${id}-surface`}
          className={`border border-separator ${pressed ? 'bg-surface-tertiary' : 'bg-surface'}`}
          style={[
            cornerOf('xl'),
            {
              flexDirection: stacked ? 'column' : 'row',
              alignItems: 'stretch',
              minHeight: MIN_HEIGHT,
              overflow: 'hidden',
            },
          ]}>
          <View
            testID={`trip-card-${id}-thumb`}
            style={
              stacked
                ? { height: THUMB, overflow: 'hidden' }
                : { width: THUMB, overflow: 'hidden' }
            }>
            <TripCoverArt trip={trip} thumb />
          </View>
          <Body trip={trip} large={stacked} />
          {countdown ? <Stub id={id} countdown={countdown} stacked={stacked} /> : null}
        </View>
      )}
    </Tappable>
  );
}
