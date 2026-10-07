/**
 * Motion budgets — contract C4-6, FR-022, FR-028, research D4-05.
 *
 * A press takes 100 ms or less, an in-place transition 200 ms or less, a list entrance
 * about 150 ms. Only movement and fade (`transform`, `opacity`) are animated, and nothing
 * bounces or overshoots. When the traveller asks for reduced motion every duration is
 * zero: the destination state is still shown, instantly.
 *
 * Pure data and pure helpers.
 */
import { deepFreeze } from './freeze';

export const Motion = deepFreeze({
  pressMs: 100,
  transitionMs: 200,
  listEntranceMs: 150,
} as const);

export type MotionName = keyof typeof Motion;

/** The only style properties an animation may drive (FR-022). */
export const MotionProperties = deepFreeze(['transform', 'opacity'] as const);

export type MotionProperty = 'transform' | 'opacity';

export function isMotionProperty(property: string): property is MotionProperty {
  return (MotionProperties as readonly string[]).includes(property);
}

/** The duration to use for `name`: zero under reduced motion (FR-028). */
export function motionDuration(name: MotionName, prefersLessMotion: boolean): number {
  return prefersLessMotion ? 0 : Motion[name];
}
