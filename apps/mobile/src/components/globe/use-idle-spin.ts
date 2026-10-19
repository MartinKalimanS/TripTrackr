/**
 * `useIdleSpin` - the slow turn of the Home globe (feature 005, T537; FR-019; research D5-04;
 * contract C5-24):
 *
 *   useIdleSpin({ handle: globeRef, origin: centre, enabled: idleSpinAllowed(conditions) })
 *
 * While `enabled`, ONE `setInterval` of one step (5 s) starts the next native `linearTo` move,
 * 20 degrees east of the last, from the globe's own centre: a chain of native moves, never a
 * frame loop that would cross the bridge sixty times a second. Which conditions stop it is the
 * pure rule `idleSpinAllowed` (`features/globe/idle-spin.ts`); this hook only follows its answer:
 * it clears the timer the moment `enabled` is false, starts exactly one when it is true again
 * and carries on from where it stopped.
 *
 * The cap of 45 seconds counts the moves made (`IDLE_SPIN_MOVES`, those that END within it), so
 * time held still does not count and, once the cap is spent, the spin never starts again for the
 * life of the screen. When the globe's centre moves (the first stop appeared and the camera
 * flew there) the spin turns about the new centre.
 *
 * Nothing re-renders: the position and the count are refs, and the timer is cleaned up with the
 * screen. A handle with no camera yet (the map is still starting) makes a tick a no-op that
 * spends none of the allowance.
 */
import { useEffect, useRef, type RefObject } from 'react';

import {
  IDLE_SPIN_MOVES,
  IdleSpin,
  nextSpinCentre,
  spinCamera,
} from '@/features/globe/idle-spin';
import type { LngLat } from '@/features/globe/great-circle';

import type { GlobeHandle } from './globe-view';

export interface IdleSpinOptions {
  handle: RefObject<Pick<GlobeHandle, 'setCamera'> | null>;
  /** Where the globe opened: the spin turns about its longitude at its latitude. */
  origin: LngLat;
  /** `idleSpinAllowed(...)`: false stops the timer at once. */
  enabled: boolean;
}

export function useIdleSpin({ handle, origin, enabled }: IdleSpinOptions): void {
  const [originLng, originLat] = origin;
  const position = useRef<LngLat>(origin);
  const moves = useRef(0);

  useEffect(() => {
    position.current = [originLng, originLat];
  }, [originLng, originLat]);

  useEffect(() => {
    if (!enabled || moves.current >= IDLE_SPIN_MOVES) return undefined;
    const timer = setInterval(() => {
      const camera = handle.current;
      // No map yet (it is still starting): nothing to turn, and nothing spent of the cap.
      if (camera === null || moves.current >= IDLE_SPIN_MOVES) return;
      moves.current += 1;
      position.current = nextSpinCentre(position.current);
      camera.setCamera(spinCamera(position.current));
      if (moves.current >= IDLE_SPIN_MOVES) clearInterval(timer);
    }, IdleSpin.stepMs);
    return () => clearInterval(timer);
  }, [enabled, handle]);
}
