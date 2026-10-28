/**
 * `YearScrubber` - a strip of years on the right edge of a long trips list (feature 005, T540;
 * contract C5-19; FR-035; prototype `.year-scrub`). It exists from 200 trips; the screen decides.
 *
 *   <YearScrubber years={[2026, 2025, 2024]} activeYear={2025} onJump={scrollToYear} />
 *
 * A 28 dp capsule on the cream ground with a hairline, two-digit years in the eyebrow role, the
 * year in view on an `ink` pill. With more than nine years it keeps the newest seven, a dot and
 * the oldest ("26 25 24 23 22 21 20 . 09"): the touch still reaches every year, the labels are a
 * guide. A touch, and a drag along the strip, jumps to the year at that height (top is the
 * newest) with the selection haptic when the year CHANGES, not on every move; a new touch starts
 * again. The strip claims the touch, so the list does not scroll under a finger on it.
 *
 * For a screen reader it is ONE control: `adjustable`, named "Jump to year", its value the year
 * in view, with `increment` (a later year) and `decrement` (an earlier one), which do nothing
 * past the newest or the oldest. Its visible width is 28 dp and its hit area 44 dp wide
 * (`hitSlop`), at least 8 dp from the next target (FR-071).
 *
 * It reads and writes nothing: the screen holds the year in view and does the scrolling.
 */
import { useRef, useState } from 'react';
import {
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { useHaptics } from '@/hooks/use-haptics';

export interface YearScrubberProps {
  /** Newest first. */
  years: readonly number[];
  /** The year at the top of the list now, or `null` before one is known. */
  activeYear: number | null;
  onJump: (year: number) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Where the strip sits on the screen (prototype `.year-scrub`: `right: 4px; top: 250px`, in the
 * 390 x 844 frame): pass it as `style`. The screen owns the position; the strip owns its look.
 */
export const YEAR_SCRUBBER_PLACEMENT = {
  position: 'absolute',
  right: 4,
  top: 250,
} as const;

/** `.year-scrub` draws its years at 12 / 16 bold with no tracking (an eyebrow, untracked). */
const YEAR_STYLE = { letterSpacing: 0 } as const;

/** The id of the strip; each year in it is `trips-year-scrubber-year-<year>`. */
const SCRUBBER_ID = 'trips-year-scrubber';

/** The most labels drawn: the newest seven, a dot and the oldest. */
const MAX_ENTRIES = 9;
const NEWEST_KEPT = MAX_ENTRIES - 2;
/** 28 dp visible, 44 dp by hit area: the strip is one control as tall as its years. */
const HIT_SLOP = { left: 16, right: 4, top: 4, bottom: 4 } as const;

/** What makes the strip ONE adjustable control for a screen reader (the value is the year). */
const ADJUSTABLE = {
  accessible: true,
  accessibilityRole: 'adjustable',
  accessibilityLabel: 'Jump to year',
  accessibilityActions: [
    { name: 'increment', label: 'Later year' },
    { name: 'decrement', label: 'Earlier year' },
  ],
} as const;

type Entry = { kind: 'year'; year: number } | { kind: 'gap' };

/** The labels to draw for `years`: all of them, or the newest, a gap and the oldest. */
function entriesOf(years: readonly number[]): Entry[] {
  const asYears = (list: readonly number[]): Entry[] =>
    list.map((year) => ({ kind: 'year', year }));
  if (years.length <= MAX_ENTRIES) return asYears(years);
  return [
    ...asYears(years.slice(0, NEWEST_KEPT)),
    { kind: 'gap' },
    ...asYears(years.slice(-1)),
  ];
}

/** The year at `offset` dp down a strip `height` dp tall: the ends clamp, never miss. */
function yearAtOffset(years: readonly number[], offset: number, height: number): number {
  const index = Math.floor((offset / height) * years.length);
  return years[Math.min(years.length - 1, Math.max(0, index))] as number;
}

/** The year after (`later`) or before (`earlier`) `year`, or `null` at the end. */
function neighbour(
  years: readonly number[],
  year: number,
  direction: 'later' | 'earlier',
): number | null {
  const index = years.indexOf(year);
  const target = direction === 'later' ? index - 1 : index + 1;
  return index === -1 ? null : (years[target] ?? null);
}

function YearLabel({ year, active }: { year: number; active: boolean }) {
  return (
    <View
      testID={`${SCRUBBER_ID}-year-${year}`}
      className={active ? 'rounded-full bg-foreground px-1' : 'px-1'}>
      <Text variant="eyebrow" tone={active ? 'onInk' : 'muted'} style={YEAR_STYLE}>
        {String(year).slice(-2)}
      </Text>
    </View>
  );
}

/**
 * The touch and screen reader behaviour of the strip: the props that make the one `View` a
 * control. `shown` is the year in view (or the newest); a jump to the year already jumped to
 * during this touch is dropped, so a drag within one year plays one haptic.
 */
function useScrubberControl(
  years: readonly number[],
  shown: number,
  onJump: (year: number) => void,
) {
  const haptics = useHaptics();
  const [height, setHeight] = useState(0);
  const lastJump = useRef<number | null>(null);

  const jump = (year: number) => {
    if (year === lastJump.current) return;
    lastJump.current = year;
    haptics.selection();
    onJump(year);
  };
  const touchAt = (event: GestureResponderEvent) => {
    if (height > 0 && years.length > 0) {
      jump(yearAtOffset(years, event.nativeEvent.locationY, height));
    }
  };
  const adjust = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === 'increment' ? 'later' : 'earlier';
    const target = neighbour(years, shown, direction);
    if (target !== null) jump(target);
  };

  return {
    ...ADJUSTABLE,
    accessibilityValue: { text: String(shown) },
    onAccessibilityAction: adjust,
    hitSlop: HIT_SLOP,
    onLayout: (event: LayoutChangeEvent) => setHeight(event.nativeEvent.layout.height),
    onStartShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      lastJump.current = null;
      touchAt(event);
    },
    onResponderMove: touchAt,
    onResponderRelease: () => {
      lastJump.current = null;
    },
  } as const;
}

export function YearScrubber({ years, activeYear, onJump, style }: YearScrubberProps) {
  const shown = activeYear ?? years[0] ?? 0;
  const control = useScrubberControl(years, shown, onJump);
  if (years.length === 0) return null;

  return (
    <View
      testID={SCRUBBER_ID}
      {...control}
      className="min-w-[28px] items-center gap-0.5 rounded-full border border-separator bg-surface-secondary px-1 py-1.5"
      style={style}>
      <View pointerEvents="none" className="items-center gap-0.5">
        {entriesOf(years).map((entry, index) =>
          entry.kind === 'gap' ? (
            <Text key={`gap-${index}`} variant="eyebrow" tone="muted" style={YEAR_STYLE}>
              {'·'}
            </Text>
          ) : (
            <YearLabel key={entry.year} year={entry.year} active={entry.year === shown} />
          ),
        )}
      </View>
    </View>
  );
}
