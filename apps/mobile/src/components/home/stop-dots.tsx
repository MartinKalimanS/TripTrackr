/**
 * The strip of a trip's stops on the Home sheet's live card (feature 005, T535; contract
 * C5-23; FR-070, FR-076): one 6 dp dot per stop, 4 dp apart, in THREE looks as the pictures
 * draw them (prototype `.dots i`): a solid coral dot for a stop that is done, a surface dot
 * with a 2 dp coral ring for the one the traveller is at, and a sand dot with a 1 dp `border`
 * ring for what is still ahead (the next stop is drawn like the rest: the pictures have no
 * fourth look). Filled, ringed and hollow differ by shape as well as colour, so the strip
 * survives greyscale. A long trip shows a window around the traveller and "+N" for the dots it
 * leaves out (`stripWindow`).
 *
 * It is decoration: the card's name already says "day 3 of 8", so the strip and its dots are
 * hidden from assistive technology. The dot id is written out at the call site.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { stripWindow, type StripDot } from '@/features/home/home-trips';

/** Most dots on the card; beyond it the strip is windowed. */
export const MAX_DOTS = 12;

const AHEAD = 'size-1.5 rounded-full border border-border bg-sand';

/** Literal classes, so Tailwind finds each: the three looks (6 dp each, the ring inside). */
export const DOT: Record<StripDot, string> = {
  done: 'size-1.5 rounded-full bg-accent-line',
  now: 'size-1.5 rounded-full border-2 border-accent-line bg-surface',
  next: AHEAD,
  later: AHEAD,
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
