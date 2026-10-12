/**
 * Motion budgets — contract C4-6, FR-022, FR-028, research D4-05; the Sunrise springs and
 * durations of feature 005 contract C5-9.
 *
 * A press takes 100 ms or less, an in-place transition 200 ms or less. Only movement and
 * fade (`transform`, `opacity`) are animated. Two motions overshoot ON PURPOSE: the pin
 * pop (a spring of damping ratio .6) and the stamp landing (scale 1.6 to 1 with a 2 dp
 * settle); the sheet spring is nearly critical (ratio .9) and settles within 300 ms. When
 * the traveller asks for reduced motion every duration is zero, a press loses its scale,
 * a spring becomes a jump, and the destination state is still shown, instantly.
 *
 * `Motion` keeps the 004 keys (`pressMs`, `transitionMs`, `listEntranceMs`) with their
 * values and adds the Sunrise ones; the springs are in the unit mass of Reanimated's
 * `withSpring`.
 *
 * Pure data and pure helpers.
 */
import { deepFreeze } from './freeze';

/** A spring of unit mass, as `withSpring` takes it. */
export interface Spring {
  stiffness: number;
  damping: number;
}

export const Motion = deepFreeze({
  /** A press: the pressed fill and `pressScale`, in 100 ms. */
  pressMs: 100,
  pressScale: 0.97,
  /** An in-place change, at most 200 ms: movement and fade only. */
  transitionMs: 200,
  /** 004 list entrance, kept until Phase 10. */
  listEntranceMs: 150,
  /** Sheet and pill selection: ratio .9, settles within 300 ms. */
  sheetSpring: { stiffness: 700, damping: 47.6 },
  /** The camera follows with `easeTo`, once per settle. */
  cameraFollowMs: 280,
  /** Pin pop: ratio .6, staggered by 40 ms. */
  pinSpring: { stiffness: 800, damping: 33.9 },
  pinStaggerMs: 40,
  /** Count-up: ease out, once per appearance. */
  countUpMs: 700,
  countUpStaggerMs: 80,
  /** Stamp landing: scale 1.6 to 1, rotate -14 degrees to its tilt, a 2 dp settle. */
  stampLandMs: 200,
  stampLandRangeMs: [180, 220],
  stampScaleFrom: 1.6,
  stampRotateFromDeg: -14,
  stampSettleDp: 2,
  /** The live pulse: scale 1 to 1.7 while opacity falls from .6 to 0, repeating. */
  pulseMs: 2400,
  pulseScaleTo: 1.7,
  pulseOpacityFrom: 0.6,
  /** Skeleton shimmer, linear. */
  shimmerMs: 1400,
  /** Idle globe rotation: 20 degrees per 5 s, 45 s at most, resuming after 7 s idle. */
  spinStepMs: 5000,
  spinStepDeg: 20,
  spinCapMs: 45_000,
  spinResumeMs: 7000,
} as const);

export type MotionName = keyof typeof Motion;

/** The numeric duration keys, in ms: the ones reduced motion sets to zero. */
export const MotionDurationNames = deepFreeze([
  'pressMs',
  'transitionMs',
  'listEntranceMs',
  'cameraFollowMs',
  'pinStaggerMs',
  'countUpMs',
  'countUpStaggerMs',
  'stampLandMs',
  'pulseMs',
  'shimmerMs',
  'spinStepMs',
  'spinCapMs',
  'spinResumeMs',
] as const);

export type MotionDurationName = (typeof MotionDurationNames)[number];

/** The only style properties an animation may drive (FR-022). */
export const MotionProperties = deepFreeze(['transform', 'opacity'] as const);

export type MotionProperty = 'transform' | 'opacity';

export function isMotionProperty(property: string): property is MotionProperty {
  return (MotionProperties as readonly string[]).includes(property);
}

/** The duration to use for `name`: zero under reduced motion (FR-028). */
export function motionDuration(
  name: MotionDurationName,
  prefersLessMotion: boolean,
): number {
  return prefersLessMotion ? 0 : Motion[name];
}

/** The scale of a pressed control: reduced motion keeps the fill and drops the scale. */
export function pressScaleOf(prefersLessMotion: boolean): number {
  return prefersLessMotion ? 1 : Motion.pressScale;
}

/**
 * A spring as `withSpring` takes it, or `null` under reduced motion: the caller jumps to
 * the destination. A copy, so a caller may extend it.
 */
export function springOf(
  name: 'sheetSpring' | 'pinSpring',
  prefersLessMotion: boolean,
): Spring | null {
  return prefersLessMotion ? null : { ...Motion[name] };
}
