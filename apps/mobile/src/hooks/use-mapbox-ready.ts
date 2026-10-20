/**
 * Whether a map may mount yet — research D-30.
 *
 * The globe waits for `configureMapbox()` (lib/mapbox.ts): a map view created
 * before the token is set cannot start, and one created before telemetry is
 * switched off could send events the privacy policy does not disclose. The
 * root layout starts configuring at launch, so by the time the globe mounts
 * this is normally `ready` on the first render and nothing waits.
 */
import { useEffect, useState } from 'react';

import { configureMapbox, isMapboxReady, mapboxAccessToken } from '@/lib/mapbox';

export type MapboxReadiness = 'starting' | 'ready' | 'unavailable';

export function useMapboxReady(): MapboxReadiness {
  const hasToken = mapboxAccessToken() !== null;
  const [state, setState] = useState<MapboxReadiness>(() =>
    isMapboxReady() ? 'ready' : 'starting',
  );

  useEffect(() => {
    if (!hasToken) return;
    let active = true;
    void configureMapbox().then((ok) => {
      if (active) setState(ok ? 'ready' : 'unavailable');
    });
    return () => {
      active = false;
    };
  }, [hasToken]);

  return hasToken ? state : 'unavailable';
}
