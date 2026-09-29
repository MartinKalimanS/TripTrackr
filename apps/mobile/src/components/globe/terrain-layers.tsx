/**
 * Terrain relief at close range — tasks.md T103 (FR-049, Acceptance Scenario 4.2).
 *
 * Mapbox's elevation tiles (Mapbox Terrain-DEM v1, part of the same free-tier
 * map access as the basemap) drive the terrain of the one globe MapView. The
 * exaggeration is a zoom expression: flat on the globe and at country scale —
 * relief there only clutters the arcs — then rising to full relief by city
 * scale. Buildings need no layer here: the Standard basemap draws its own 3D
 * buildings at street level when asked (`show3dObjects` on its import).
 */
import { RasterDemSource, Terrain, type TerrainLayerStyle } from '@rnmapbox/maps';

import { GlobeTerrain } from '@/constants/theme';

export const TERRAIN_SOURCE_ID = 'globe-terrain';

const exaggeration: TerrainLayerStyle['exaggeration'] = [
  'interpolate',
  ['linear'],
  ['zoom'],
  GlobeTerrain.startZoom,
  0,
  GlobeTerrain.fullZoom,
  GlobeTerrain.exaggeration,
];

export function TerrainLayers() {
  return (
    <>
      <RasterDemSource
        id={TERRAIN_SOURCE_ID}
        url={GlobeTerrain.demURL}
        tileSize={GlobeTerrain.tileSize}
        maxZoomLevel={GlobeTerrain.maxZoomLevel}
      />
      <Terrain sourceID={TERRAIN_SOURCE_ID} style={{ exaggeration }} />
    </>
  );
}
