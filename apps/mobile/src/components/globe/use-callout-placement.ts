/**
 * Where the callout goes while the camera moves — feature 005, T533 (FR-011).
 *
 * The side of the pin the card takes depends on where the pin is on the SCREEN, which only
 * the map knows (`MapView.getPointInView`, an async call). It is asked once when the pin
 * appears or moves to another place, and again by `refresh()` when the camera settles
 * (`onMapIdle`: the globe turns, the sheet moves it), never per frame. The card's own size
 * comes back through `onCardLayout`; the widest it has been is kept, so a card that was
 * narrowed to fit does not shrink the room it is judged by. Until the map has answered the
 * card sits on the left at its full width. A map that cannot answer (a stand-in, an off-window
 * map) leaves it there.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';

import { GlobeLayers } from '@/constants/theme';
import type { LngLat } from '@/features/globe/great-circle';

import {
  calloutPlacement,
  type CalloutArea,
  type CalloutPlacement,
} from './callout-layout';

/** The part of `MapView` this needs. */
export interface MapPointProjector {
  getPointInView?: (coordinate: number[]) => Promise<number[]>;
}

export interface CalloutPlacementOptions {
  map: RefObject<MapPointProjector | null>;
  coordinate: LngLat | null;
  area: CalloutArea;
  ringSize: number;
}

export interface UseCalloutPlacement extends CalloutPlacement {
  /** Ask the map again where the pin is: when the camera settles. */
  refresh: () => void;
  onCardLayout: (size: { width: number; height: number }) => void;
}

/** What the card is assumed to be until it has been measured: the widest it can be. */
const FIRST_GUESS = { width: GlobeLayers.callout.maxWidth, height: 56 };

type Point = { x: number; y: number };
type Size = { width: number; height: number };

/**
 * Asks the map where a coordinate is on the screen and hands the answer on. A map that cannot
 * answer (a stand-in, an off-window map) is left alone: the card stays where it is.
 */
function askMap(
  map: RefObject<MapPointProjector | null>,
  [lng, lat]: LngLat,
  onPoint: (point: Point) => void,
): void {
  const target = map.current;
  if (!target?.getPointInView) return;
  target.getPointInView([lng, lat]).then(
    ([x, y]) => {
      if (x !== undefined && y !== undefined) onPoint({ x, y });
    },
    () => undefined,
  );
}

export function useCalloutPlacement({
  map,
  coordinate,
  area,
  ringSize,
}: CalloutPlacementOptions): UseCalloutPlacement {
  const [point, setPoint] = useState<Point | null>(null);
  const [measured, setMeasured] = useState<Size | null>(null);
  const alive = useRef(true);
  const lng = coordinate?.[0];
  const lat = coordinate?.[1];

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const publish = useCallback((next: Point) => {
    if (alive.current) setPoint(next);
  }, []);

  useEffect(() => {
    if (lng !== undefined && lat !== undefined) askMap(map, [lng, lat], publish);
  }, [map, lng, lat, publish]);

  const refresh = () => {
    if (lng !== undefined && lat !== undefined) askMap(map, [lng, lat], publish);
  };

  const onCardLayout = useCallback((size: Size) => {
    setMeasured((previous) => {
      const width = Math.max(size.width, previous?.width ?? 0);
      return previous && previous.width === width && previous.height === size.height
        ? previous
        : { width, height: size.height };
    });
  }, []);

  const placement = useMemo<CalloutPlacement>(
    () =>
      point
        ? calloutPlacement(point, measured ?? FIRST_GUESS, area, { ringSize })
        : { side: 'left', maxWidth: GlobeLayers.callout.maxWidth },
    [point, measured, area, ringSize],
  );

  return { ...placement, refresh, onCardLayout };
}
