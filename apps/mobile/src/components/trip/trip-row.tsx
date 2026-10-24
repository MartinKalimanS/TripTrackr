/**
 * `TripRow` - the compact row of every trip that is neither the hero nor the ticket (feature
 * 005, T540; contract C5-19; FR-030, FR-033, FR-034, FR-070, FR-074, FR-075; prototype
 * `.trip-row`).
 *
 *   <TripRow trip={card} onPress={() => router.push(`/trip/${card.id}`)} />
 *
 * A 64 dp thumbnail (56 dp at large text), 16 dp round and clipped, as the pictures draw it with
 * no edge; beside it the title on one line, and under it the flag, the
 * country, the month and the length ("Japan · Mar 2026 · 9 days"); a trailing chevron cue (20 dp, `subtle`,
 * 3:1 or more, FR-069); and, while the trip has changes the server has not confirmed, the
 * marker in words. At a font scale of 1.15 and above the title and the line may take two lines
 * and the thumbnail is 56 dp; the row is a 72 dp MINIMUM, never a height.
 *
 * A trip that is not over says so: an active or planned trip in a list grouped by year gets its
 * status chip under the line (a planned trip must not read as a past one, FR-070), while a past
 * trip says it in its accessible name. The id `status-pill-<status>` of the 004 card stays on
 * the chips that are drawn.
 *
 * ONE control (`Tappable`, role button; its held fill is the pressed fill of the whole row): the
 * name is the one feature 004 gave a trip card, "title, status, N stops" (FR-075), the hint
 * "Opens the trip" and the id `trip-card-<id>`; the thumbnail, the flag and the cue are
 * decoration. Ids kept from the 004 card where the element still exists: `-meta-row`, `-cue`
 * (and `-cover`, `-photo` of `TripCoverArt`).
 */
import { View } from 'react-native';

import { FlagChip } from '@/components/ui/flag-chip';
import { StatusChip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { CHEVRON } from '@/components/ui/press-cue';
import { isLargeText } from '@/components/ui/reflow';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { describeStopCount, rowMeta } from '@/features/trips/trip-card-copy';
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { useFontScale } from '@/hooks/use-font-scale';
import { cornerOf } from '@/theme';

import { TripCoverArt } from './trip-cover-art';

export interface TripRowProps {
  trip: TripCardModel;
  onPress: () => void;
}

const MIN_HEIGHT = 72;
const THUMB = 64;
const THUMB_LARGE = 56;

/** `.meta-line { gap: 6px }`: the flag and the words. */
const META_GAP = { gap: 6 } as const;

/** The title, the line under it and the chips: what sits between the thumbnail and the cue. */
function RowText({ trip, large }: { trip: TripCardModel; large: boolean }) {
  const { id } = trip;
  const lines = large ? 2 : 1;
  return (
    <View className="flex-1 gap-0.5">
      <Text variant="callout" numberOfLines={lines} accessibilityRole="text">
        {trip.title}
      </Text>
      <View
        testID={`trip-card-${id}-meta-row`}
        className="flex-row items-center"
        style={META_GAP}>
        {trip.country ? (
          <FlagChip iso2={trip.country.iso2} testID={`trip-card-${id}-flag`} />
        ) : null}
        <Text variant="label" tone="muted" numberOfLines={lines} className="shrink">
          {rowMeta(trip)}
        </Text>
      </View>
      {trip.status !== 'past' || trip.pending ? (
        <View className="flex-row flex-wrap items-center gap-2 pt-1">
          {trip.status === 'past' ? null : <StatusChip status={trip.status} />}
          {trip.pending ? <SyncBadge state="pending" /> : null}
        </View>
      ) : null}
    </View>
  );
}

export function TripRow({ trip, onPress }: TripRowProps) {
  const fontScale = useFontScale();
  const large = isLargeText(fontScale);
  const side = large ? THUMB_LARGE : THUMB;
  const { id } = trip;

  return (
    <Tappable
      testID={`trip-card-${id}`}
      accessibilityLabel={`${trip.title}, ${trip.status}, ${describeStopCount(trip.stopCount)}`}
      accessibilityHint="Opens the trip"
      onPress={onPress}
      style={[cornerOf('md'), { minHeight: MIN_HEIGHT }]}>
      <View className="flex-row items-center gap-4">
        <View
          testID={`trip-card-${id}-thumb`}
          style={[cornerOf('lg'), { width: side, height: side, overflow: 'hidden' }]}>
          <TripCoverArt trip={trip} thumb />
        </View>
        <RowText trip={trip} large={large} />
        <Icon name={CHEVRON} size={20} tone="subtle" testID={`trip-card-${id}-cue`} />
      </View>
    </Tappable>
  );
}
