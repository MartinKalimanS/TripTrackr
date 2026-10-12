/**
 * The strip of a trip's stops on the Home sheet's live card (feature 005, T535; contract
 * C5-23; FR-070, FR-076): one small dot per stop, in four SHAPES so it survives greyscale: a
 * filled dot for a stop that is done, a larger ring for the one the traveller is at, a ringed
 * dot for the next, a thin grey ring for what is later. A long trip shows a window around the
 * traveller and "+N" for the dots it leaves out (`stripWindow`).
 *
 * It is decoration: the card's name already says "day 3 of 8", so the strip and its dots are
 * hidden from assistive technology. The dot id is written out at the call site.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { stripWindow, type StripDot } from '@/features/home/home-trips';

/** Most dots on the card; beyond it the strip is windowed. */
export const MAX_DOTS = 12;

/** Literal classes, so Tailwind finds each: the four shapes. */
const DOT: Record<StripDot, string> = {
  done: 'size-2 rounded-full bg-accent-line',
  now: 'size-3 rounded-full border-2 border-accent-line',
  next: 'size-2 rounded-full border border-accent-line',
  later: 'size-2 rounded-full border border-border',
};

export interface StopDotsProps {
  strip: readonly StripDot[];
  /** The id of each dot. */
  dotTestID: string;
}

export function StopDots({ strip, dotTestID }: StopDotsProps) {
  const { dots, hidden } = stripWindow(strip, MAX_DOTS);
  if (dots.length === 0) return null;
  return (
    <View
      className="flex-row flex-wrap items-center gap-1"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {dots.map((kind, index) => (
        <View key={index} testID={dotTestID} className={DOT[kind]} />
      ))}
      {hidden > 0 ? (
        <Text variant="caption" tone="subtle" capped>{`+${hidden}`}</Text>
      ) : null}
    </View>
  );
}
