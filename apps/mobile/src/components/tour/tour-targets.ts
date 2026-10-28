/**
 * The controls the first-run tour can light (feature 007). Each one registers its native node
 * under a `TourTarget` name with `useTourTarget` (a callback ref), and the overlay asks for its
 * rectangle in window coordinates when a step needs it. A target that is not mounted, or whose
 * node cannot be measured, answers `null`, and the overlay shows the step's card centred.
 */
import { useCallback } from 'react';

import type { TourTarget } from '@/features/tour/tour-steps';

import type { Rect } from './tour-geometry';

/** The part of a native view the tour uses. */
export interface TourTargetNode {
  measureInWindow?: (
    done: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

const nodes = new Map<TourTarget, TourTargetNode>();

export function registerTourTarget(id: TourTarget, node: TourTargetNode | null): void {
  if (node === null) nodes.delete(id);
  else nodes.set(id, node);
}

/**
 * A stable callback ref: `<View ref={useTourTarget('totals')} collapsable={false} />`. With
 * `null` (a control the tour never lights, like the Globe tab) it registers nothing.
 */
export function useTourTarget(
  id: TourTarget | null,
): (node: TourTargetNode | null) => void {
  return useCallback(
    (node) => {
      if (id !== null) registerTourTarget(id, node);
    },
    [id],
  );
}

/** The target's rectangle in the window, or `null` when it is not there or has no size. */
export function measureTourTarget(id: TourTarget): Promise<Rect | null> {
  const node = nodes.get(id);
  if (node?.measureInWindow === undefined) return Promise.resolve(null);
  return new Promise((resolve) => {
    node.measureInWindow!((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}
