/**
 * One card of the trip list — tasks.md T066, restyled for Atlas by T430 (contract C4-11
 * "Trip card"; FR-011, FR-012, FR-024, FR-029, FR-030, FR-034, FR-037).
 *
 * A photo-forward card: the cover band, then the title, the status chip with the date
 * range, the stops-and-currency line and, while the row has local changes the server has
 * not confirmed (`is_dirty`; Constitution II, feature 002 contract C11), the pending
 * badge.
 *
 * The whole card is ONE control (`Card` with `onPress`): role button, one accessible name
 * and the hint "Opens the trip", exactly what the previous card announced
 * (`<title>, <status>, <stops>`; FR-030), and the ids it always had (`trip-card-<id>`,
 * `status-pill-<status>`). Everything inside is part of that one element, so nothing in
 * it is a control and nothing in it is a card (FR-006).
 *
 * The chevron cue (FR-024) is the card's own, at the foot beside the text, not the
 * `Card`'s default one: the default sits beside the whole content, so with a cover that
 * runs to the card's edge it would hang off the right of the picture. `cue={false}` is
 * the contract's provision for this (`<testID>-cue` is kept).
 *
 * A range that cannot be read (`formatDateRange` says `null`) is simply not shown.
 *
 * At the largest text size the rows wrap and no height or line count is fixed, so
 * nothing clips (FR-029); the title may take as many lines as it needs.
 */
import { View } from 'react-native';

import { TripCoverBand } from '@/components/trip/trip-cover-band';
import { Card } from '@/components/ui/card';
import { StatusChip } from '@/components/ui/chip';
import { PressCue } from '@/components/ui/press-cue';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import { formatDateRange } from '@/features/trips/trip-date-range';
import type { TripSummary } from '@/features/trips/use-trips';

export type TripCardProps = {
  summary: TripSummary;
  onPress: () => void;
};

export function describeStopCount(count: number): string {
  if (count === 0) return 'No stops yet';
  return count === 1 ? '1 stop' : `${count} stops`;
}

/** A row of inline items that wraps under large text instead of clipping. */
const WRAP_ROW = 'flex-row flex-wrap items-center gap-x-2 gap-y-1';

export function TripCard({ summary, onPress }: TripCardProps) {
  const { trip, stopCount, status, cover, dateRange } = summary;
  const stops = describeStopCount(stopCount);
  const range = dateRange ? formatDateRange(dateRange) : null;

  return (
    <Card
      testID={`trip-card-${trip.id}`}
      accessibilityLabel={`${trip.title}, ${status}, ${stops}`}
      accessibilityHint="Opens the trip"
      cue={false}
      onPress={onPress}>
      <TripCoverBand cover={cover} title={trip.title} status={status} tripId={trip.id} />
      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-1 gap-2">
          <Text type="title" accessibilityRole="text">
            {trip.title}
          </Text>
          <View testID={`trip-card-${trip.id}-status-row`} className={WRAP_ROW}>
            <StatusChip status={status} />
            {range ? (
              <Text type="callout" tone="muted">
                {range}
              </Text>
            ) : null}
          </View>
          <View testID={`trip-card-${trip.id}-meta-row`} className={WRAP_ROW}>
            <Text type="callout" tone="muted">
              {stops} · {trip.home_currency}
            </Text>
            {trip.is_dirty ? <SyncBadge state="pending" /> : null}
          </View>
        </View>
        <PressCue testID={`trip-card-${trip.id}-cue`} />
      </View>
    </Card>
  );
}
