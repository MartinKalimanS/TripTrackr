/**
 * `useHeroCollapse(scrollY, config)` and the pure `heroCollapse(offset, config)` behind it -
 * the collapse of the trip screen's hero picture (feature 005, research D5-12, contract C5-20
 * and C5-32; FR-025, FR-027, FR-073).
 *
 *   const scrollY = useScrollOffset(listRef);
 *   const { image, title, bar, scrim } = useHeroCollapse(scrollY, { heroHeight, topInset });
 *   <Animated.Image style={image} />        parallax .5, stretches on a pull
 *   <Animated.View style={title}>...</...>   the title in the hero fades out
 *   <Animated.View style={bar}>...</...>     the solid 56 dp header fades in
 *   <Animated.View style={scrim}>...</...>   the scrim over the status bar fades out
 *
 * What it does, from a scroll offset:
 * - PARALLAX 0.5: the picture moves down at half the page's speed, so it seems to scroll at
 *   half of it. Pulled down past the top (a negative offset) it stretches to cover the gap
 *   and stays pinned to the top edge: scaled about its centre, it is moved up by half the pull.
 * - COLLAPSE: `progress` is the scroll over the distance until the hero's bottom meets the
 *   bottom of the solid header (its 56 dp plus the status-bar inset), clamped to 0 to 1.
 * - CROSS-FADE in the last part of it, from `HeroMetrics.fadeStart`: the hero title fades out as
 *   the bar (and the title in it) fades in, so one title is on screen and it is announced once,
 *   and the scrim over the status bar fades out as the bar takes over (its job, light text over
 *   a picture, is done once the bar is solid). `collapsed` is true when the bar is fully in.
 * - REDUCED MOTION: the picture does not move or stretch and there is no fade: the bar and the
 *   title switch at once when the picture has gone, so every state is still shown.
 *
 * It animates a transform and opacities, nothing else (FR-027). `heroCollapse` is a worklet,
 * so the hook runs it on the UI thread with no bridge call per frame; it is pure, so it is
 * tested on numbers. How it feels is a device check (T512).
 */
import { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useAppearance } from '@/hooks/use-appearance';

export const HeroMetrics = {
  /** The hero is at least this tall (C5-20). */
  minHeight: 236,
  /** The solid header that replaces it, below the status bar. */
  headerHeight: 56,
  /** The picture moves at this fraction of the page's speed. */
  parallax: 0.5,
  /** The cross-fade runs from this progress (0 to 1) to the end of the collapse. */
  fadeStart: 0.6,
} as const;

export interface HeroCollapseConfig {
  /** The hero's height as laid out, at least `HeroMetrics.minHeight`. */
  heroHeight: number;
  /** The status bar's height: the solid header sits below it. */
  topInset: number;
  /** Under reduced motion nothing moves and nothing fades. */
  reducedMotion?: boolean;
}

export interface HeroCollapse {
  /** 0 at rest, 1 once the hero has scrolled under the header. */
  progress: number;
  /** The picture's `translateY`. */
  translateY: number;
  /** The picture's `scale`, above 1 only while the page is pulled down. */
  scale: number;
  /** The hero title's opacity. */
  titleOpacity: number;
  /** The solid header's opacity. */
  barOpacity: number;
  /** The status-bar scrim's opacity. */
  scrimOpacity: number;
  collapsed: boolean;
}

function clamp01(value: number): number {
  'worklet';
  return Math.min(Math.max(value, 0), 1);
}

/** What the picture does: parallax going up, a pinned stretch going down. */
function motionOf(offset: number, heroHeight: number, reduced: boolean) {
  'worklet';
  if (reduced) return { translateY: 0, scale: 1 };
  if (offset < 0) {
    return { translateY: offset / 2, scale: 1 + -offset / Math.max(heroHeight, 1) };
  }
  return { translateY: offset * HeroMetrics.parallax, scale: 1 };
}

/** The cross-fade from the collapse: linear from `fadeStart`, a step under reduced motion. */
function fadeOf(progress: number, reduced: boolean): number {
  'worklet';
  if (reduced) return progress >= 1 ? 1 : 0;
  return clamp01((progress - HeroMetrics.fadeStart) / (1 - HeroMetrics.fadeStart));
}

/**
 * The state of the hero at a scroll `offset` (0 at rest, negative when pulled down). Pure.
 * A hero shorter than the header collapses at once rather than dividing by nothing.
 */
export function heroCollapse(offset: number, config: HeroCollapseConfig): HeroCollapse {
  'worklet';
  const { heroHeight, topInset, reducedMotion = false } = config;
  const range = Math.max(heroHeight - (HeroMetrics.headerHeight + topInset), 1);
  const progress = clamp01(offset / range);
  const fade = fadeOf(progress, reducedMotion);
  return {
    progress,
    ...motionOf(offset, heroHeight, reducedMotion),
    titleOpacity: 1 - fade,
    barOpacity: fade,
    scrimOpacity: 1 - fade,
    collapsed: progress >= 1,
  };
}

export function useHeroCollapse(
  scrollY: SharedValue<number>,
  config: Omit<HeroCollapseConfig, 'reducedMotion'>,
) {
  const { prefersLessMotion } = useAppearance();
  const { heroHeight, topInset } = config;
  const read = () => {
    'worklet';
    return heroCollapse(scrollY.value, {
      heroHeight,
      topInset,
      reducedMotion: prefersLessMotion,
    });
  };

  const image = useAnimatedStyle(() => {
    const { translateY, scale } = read();
    return { transform: [{ translateY }, { scale }] };
  });
  const title = useAnimatedStyle(() => ({ opacity: read().titleOpacity }));
  const bar = useAnimatedStyle(() => ({ opacity: read().barOpacity }));
  const scrim = useAnimatedStyle(() => ({ opacity: read().scrimOpacity }));

  return { image, title, bar, scrim };
}
