/**
 * The idle spin of the Home globe, as a rule (feature 005, T537; FR-019; research D5-04;
 * contract C5-24): while Home is idle at world scale the globe turns slowly, as a chain of
 * native `linearTo` camera moves, 5 seconds per 20 degrees (4 degrees a second), never a
 * `requestAnimationFrame` loop that would cross the bridge on every frame.
 *
 * It stops at the first touch, when the sheet is above half, when Home is not the visible
 * screen, when the app is in the background, after 45 seconds, and always under reduced motion,
 * which also stills every pulse. It also stops while the live trip's callout is showing: the
 * card's side is chosen once the map is still, so a map that never stops would leave it where
 * it was. Being offline is no reason to stop (nothing here reads the network).
 *
 * Pure, and free of React and Mapbox: `idleSpinAllowed` folds the conditions into one answer
 * and `use-idle-spin.ts` owns the one timer.
 */
import type { LngLat } from '@/features/globe/great-circle';

import type { SheetDetent } from './globe-fit';

/** The rhythm of the chain. */
export const IdleSpin = {
  /** One move, and the interval of the one timer that starts the next. */
  stepMs: 5000,
  /** How far one move turns the globe. */
  stepDegrees: 20,
  /** The spin is over this long after it began (FR-019). */
  capMs: 45_000,
} as const;

/**
 * The moves that END within the cap. Moves start at 5 s, 10 s and so on, each lasting one
 * step, so the last that finishes by 45 s starts at 40 s: eight of them, 160 degrees in all.
 */
export const IDLE_SPIN_MOVES = IdleSpin.capMs / IdleSpin.stepMs - 1;

/** What stops the spin: everything the Home knows. There is deliberately no network field. */
export interface IdleSpinConditions {
  /** The globe is drawn: not loading, and the map is mounted. */
  mounted: boolean;
  /** The traveller has touched the globe (or moved it with an action): for good. */
  touched: boolean;
  /** The detent the sheet is at or heading for. */
  detent: SheetDetent;
  prefersLessMotion: boolean;
  /** The app is in the foreground. */
  foreground: boolean;
  /** Home is the visible screen of the tab navigator. */
  focused: boolean;
  /** A live trip's callout is on the map. */
  calloutShowing: boolean;
}

export function idleSpinAllowed(conditions: IdleSpinConditions): boolean {
  return (
    conditions.mounted &&
    !conditions.touched &&
    conditions.detent !== 'full' &&
    !conditions.prefersLessMotion &&
    conditions.foreground &&
    conditions.focused &&
    !conditions.calloutShowing
  );
}

function wrapLongitude(lng: number): number {
  if (lng > 180) return lng - 360;
  return lng <= -180 ? lng + 360 : lng;
}

/** One step east of `centre`, at the same latitude. */
export function nextSpinCentre([lng, lat]: LngLat): LngLat {
  return [wrapLongitude(lng + IdleSpin.stepDegrees), lat];
}

export interface SpinCamera {
  centerCoordinate: LngLat;
  animationMode: 'linearTo';
  animationDuration: number;
}

/** The native move to `centre` that takes the whole of a step. */
export function spinCamera(centre: LngLat): SpinCamera {
  return {
    centerCoordinate: centre,
    animationMode: 'linearTo',
    animationDuration: IdleSpin.stepMs,
  };
}
