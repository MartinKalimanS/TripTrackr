/**
 * Whether the whole planet is in view — feature 005, T532 (research D5-04).
 *
 * The basemap's point-of-interest, transit and road labels are off at world scale and on
 * closer in (`basemap-config.ts`). Standard's configuration is not zoom-dependent, so the
 * app flips it: from the zoom the camera SETTLES at (`onMapIdle`, the event the auto-pitch
 * already reads), never while a gesture is in progress. The state is a boolean, so the
 * globe re-renders only when the traveller crosses `GlobeLayers.worldScaleZoom`, not on
 * every settle. The globe opens zoomed out, so the first answer is "yes".
 */
import type { MapState } from '@rnmapbox/maps';
import { useCallback, useState } from 'react';

import { GlobeLayers } from '@/constants/theme';

export function useWorldScale() {
  const [worldScale, setWorldScale] = useState(true);
  const onMapIdle = useCallback((state: MapState) => {
    setWorldScale(state.properties.zoom < GlobeLayers.worldScaleZoom);
  }, []);
  return { worldScale, onMapIdle };
}
