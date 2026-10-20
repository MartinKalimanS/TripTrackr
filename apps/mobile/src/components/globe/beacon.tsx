/**
 * The beacon — the animated trip's marker (T095, FR-046, research D-30).
 *
 * A circle in its trip's status colour travels the trip leg by leg, one leg
 * every `LEG_DURATION_MS`, looping. It is moved by a ~30 fps JavaScript timer
 * rewriting this one small source; rnmapbox's native shape animators are
 * experimental and unsafe on the New Architecture (D-30). The timer runs only
 * while `running` — the globe is on screen, the app is in the foreground, and
 * the traveller has not asked for reduced motion — and otherwise the beacon
 * rests at the stop the traveller is at today (or the trip's first).
 */
import { CircleLayer, ShapeSource } from '@rnmapbox/maps';
import { useEffect, useState } from 'react';

import type { TripStatus } from '@/features/trips/trip-status';

import type {
  BeaconRoute,
  Feature,
  FeatureCollection,
  PointGeometry,
} from './arc-features';
import {
  BEACON_FRAME_MS,
  beaconPosition,
  beaconStyle,
  type GlobePalette,
} from './arc-styles';

type BeaconProperties = { trip_id: string; status: TripStatus };

export type BeaconsProps = {
  routes: readonly BeaconRoute[];
  palette: GlobePalette;
  running: boolean;
};

/** Milliseconds since the loop (re)started; ticks only while `running`. */
function useElapsed(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), BEACON_FRAME_MS);
    return () => clearInterval(timer);
  }, [running]);
  return elapsed;
}

export function Beacons({ routes, palette, running }: BeaconsProps) {
  const elapsed = useElapsed(running);
  const shape: FeatureCollection<PointGeometry, BeaconProperties> = {
    type: 'FeatureCollection',
    features: routes.map((route): Feature<PointGeometry, BeaconProperties> => ({
      type: 'Feature',
      id: route.tripId,
      geometry: {
        type: 'Point',
        coordinates: running
          ? (beaconPosition(route.legs, elapsed) ?? route.rest)
          : route.rest,
      },
      properties: { trip_id: route.tripId, status: route.status },
    })),
  };

  return (
    <ShapeSource id="globe-beacons" shape={shape}>
      <CircleLayer id="globe-beacon" style={beaconStyle(palette)} />
    </ShapeSource>
  );
}
