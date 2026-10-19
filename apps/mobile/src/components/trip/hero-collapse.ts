/**
 * The hero's scroll behaviour - tasks.md T543 (spec FR-025, FR-037; contract C5-20; research
 * D5-12): parallax at .5 with a scale on overscroll, and the solid bar that takes the hero's
 * place once the picture has scrolled away.
 *
 * THIS IS A LOCAL SEAM. The chrome branch (T528) writes `useHeroCollapse(scrollY)` beside the
 * transparent header; until it lands, the trip screen codes against this hook of the same
 * name, which takes the shared scroll offset and answers the animated styles and the
 * collapse progress. When the real one arrives it replaces the import in
 * `app/trip/[id]/index.tsx` and this file shrinks to the constants. The maths is plain
 * functions (worklets, so the UI thread can call them) so the numbers are asserted without a
 * native runtime; the hook only binds them to Reanimated styles.
 *
 * - The picture moves down at half the speed of the content (`PARALLAX_FACTOR`) as it scrolls
 *   away, and, pulled past the top, stretches (scale about its centre) while its top edge
 *   stays on the top of the screen.
 * - The bar is complete when the sheet (which overlaps the hero by 28 dp) has risen to the
 *   bottom of it, and fades in over the `COLLAPSE_FADE_DISTANCE` before that. The hero's own
 *   height is measured (a taller hero at large text collapses later), never assumed.
 * - `pinnedTranslate` is how a strip scrolls with the content and then stays under the bar:
 *   one instance of the strip (one set of ids, one reading order) laid over a placeholder of
 *   the same height, where native sticky headers cannot sit below a bar of our own.
 */
import type { ComponentProps } from 'react';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

/** What an `Animated.View` takes as its style: plain styles and the hook's animated ones. */
export type AnimatedViewStyle = ComponentProps<typeof Animated.View>['style'];

/** The picture's minimum height: it grows with the title, never below this (FR-037). */
export const HERO_MIN_HEIGHT = 236;
/** The solid bar's height, under the status bar (FR-025). */
export const COLLAPSED_BAR_HEIGHT = 56;
/** How far the sheet's rounded top overlaps the picture (FR-037). */
export const SHEET_OVERLAP = 28;
/** The picture travels at this fraction of the content's speed (D5-12). */
export const PARALLAX_FACTOR = 0.5;
/** The bar fades in over this many dp of scrolling before it is complete. */
export const COLLAPSE_FADE_DISTANCE = 48;

export interface HeroTransform {
  translateY: number;
  scale: number;
}

/** The picture's offset and stretch at a scroll offset: pure, no NaN for an unmeasured hero. */
export function heroImageTransform(scrollY: number, heroHeight: number): HeroTransform {
  'worklet';
  const stretch = scrollY < 0 && heroHeight > 0 ? -scrollY / heroHeight : 0;
  return { translateY: scrollY * PARALLAX_FACTOR, scale: 1 + stretch };
}

/** The scroll offset at which the bar is complete. Never negative. */
export function collapseEnd(heroHeight: number, topInset: number): number {
  'worklet';
  return Math.max(0, heroHeight - SHEET_OVERLAP - (COLLAPSED_BAR_HEIGHT + topInset));
}

/** 0 while the picture is in view, 1 once the bar is complete, linear between. */
export function collapseProgress(
  scrollY: number,
  heroHeight: number,
  topInset: number,
): number {
  'worklet';
  const start = collapseEnd(heroHeight, topInset) - COLLAPSE_FADE_DISTANCE;
  const progress = (scrollY - start) / COLLAPSE_FADE_DISTANCE;
  return Math.min(1, Math.max(0, progress));
}

/**
 * Where a strip that sits at `anchorY` in the content is drawn: with the content until it
 * reaches `pinLine`, then fixed there.
 */
export function pinnedTranslate(
  anchorY: number,
  scrollY: number,
  pinLine: number,
): number {
  'worklet';
  return Math.max(anchorY - scrollY, pinLine);
}

export interface HeroCollapse {
  /** 0 with the picture in view, 1 with the bar complete. */
  progress: SharedValue<number>;
  /** For the picture: the parallax and the overscroll stretch. */
  imageStyle: ReturnType<typeof useAnimatedStyle>;
  /** For the bar: its fade in. */
  barStyle: ReturnType<typeof useAnimatedStyle>;
}

export function useHeroCollapse(
  scrollY: SharedValue<number>,
  heroHeight: SharedValue<number>,
  topInset: number,
): HeroCollapse {
  const progress = useDerivedValue(() =>
    collapseProgress(scrollY.value, heroHeight.value, topInset),
  );
  const imageStyle = useAnimatedStyle(() => {
    const { translateY, scale } = heroImageTransform(scrollY.value, heroHeight.value);
    return { transform: [{ translateY }, { scale }] };
  });
  const barStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return { progress, imageStyle, barStyle };
}
