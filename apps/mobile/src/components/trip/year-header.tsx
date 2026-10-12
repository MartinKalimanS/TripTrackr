/**
 * `YearHeader` - the header of a year group in the trips list (feature 005, T540; contract
 * C5-19; FR-030, FR-035): the year in the `headline` role with "N trips" beside it, and the
 * year's kilometres at the far end. The numbers are of the trips UNDER it (what the traveller
 * sees below the header), as `composeTripList` counts them; trips with no stops are "No dates
 * yet".
 *
 * It is a sticky header of the list (`stickyHeaderIndices`), so rows scroll beneath it: it paints
 * the canvas and a hairline under itself. It is one heading for a screen reader, with the distance
 * spelled out ("2026, 1 trip, 9,380 kilometres": "km" is read letter by letter).
 *
 * Distances and counts follow the device locale and measurement system (FR-077).
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { yearHeaderCopy } from '@/features/trips/trip-card-copy';
import type { YearKey } from '@/features/trips/trip-sections';

export interface YearHeaderProps {
  year: YearKey;
  tripCount: number;
  distanceKm: number;
}

export function YearHeader({ year, tripCount, distanceKm }: YearHeaderProps) {
  const copy = yearHeaderCopy(year, tripCount, distanceKm);
  return (
    <View
      testID={`year-header-${year}`}
      accessible
      accessibilityRole="header"
      accessibilityLabel={copy.label}
      className="flex-row items-baseline justify-between gap-3 border-b border-separator bg-background pb-2 pt-3">
      <View className="shrink flex-row items-baseline gap-2">
        <Text variant="headline" accessibilityRole="text" className="shrink">
          {copy.title}
        </Text>
        <Text variant="caption" tone="muted">
          {copy.count}
        </Text>
      </View>
      {copy.distance ? (
        <Text variant="caption" tone="muted">
          {copy.distance}
        </Text>
      ) : null}
    </View>
  );
}
