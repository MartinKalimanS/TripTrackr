/**
 * `PeriodSwitch` - All time and each year with at least one trip, newest first (feature 005,
 * F13, T557; contract C5-16; FR-058; UI-SPEC section 8): the 36 dp `SegmentedPill` of the You
 * screen, a radio group named "Period" whose choice drives the passport card and the stamps.
 *
 * It is exactly the adapter: the segments share the track equally and a label wraps instead of
 * clipping at large text. The picture draws three segments; up to four fit the 350 dp track.
 * With more years the pill keeps a readable width per segment and scrolls sideways, so an older
 * year is never out of reach.
 */
import { ScrollView, View } from 'react-native';

import { SegmentedPill, type SegmentOption } from '@/components/ui/segmented-pill';
import { periodLabel } from '@/features/passport/passport-copy';

/** Most segments the track holds side by side; past it the pill scrolls. */
export const PERIOD_FIT = 4;
/** The width of a segment in a scrolling pill. */
export const PERIOD_SEGMENT_WIDTH = 88;

export interface PeriodSwitchProps {
  /** `all` then each year, newest first. */
  periods: readonly string[];
  selected: string;
  onSelect: (period: string) => void;
}

function optionOf(key: string): SegmentOption {
  return {
    key,
    label: periodLabel(key),
    testID: `passport-period-${key}`,
    accessibilityLabel: key === 'all' ? 'All time' : `Year ${key}`,
  };
}

export function PeriodSwitch({ periods, selected, onSelect }: PeriodSwitchProps) {
  const pill = (
    <SegmentedPill
      options={periods.map(optionOf)}
      selectedKey={selected}
      onSelect={onSelect}
      role="radiogroup"
      accessibilityLabel="Period"
      testID="passport-period"
    />
  );
  if (periods.length <= PERIOD_FIT) return pill;
  return (
    <ScrollView
      testID="passport-period-scroll"
      horizontal
      showsHorizontalScrollIndicator={false}>
      <View style={{ width: periods.length * PERIOD_SEGMENT_WIDTH }}>{pill}</View>
    </ScrollView>
  );
}
