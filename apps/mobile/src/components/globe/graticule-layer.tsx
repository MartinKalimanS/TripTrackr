/**
 * The graticule — feature 005, T532 (research D5-04, contract C5-24).
 *
 * One static GeoJSON of meridians and parallels (`features/globe/graticule.ts`, every 10
 * degrees, the prototype's `d3.geoGraticule10`) under one thin `LineLayer` in the bottom
 * slot, so the visited fill, the keylines and the connections all sit above it. It fades out as the traveller comes in: fully drawn
 * up to zoom 3, gone from zoom 4, because a grid is for the planet and not for a street.
 * Decoration, not a mark: the gate asks only that it shows over the sea (finding in
 * `test/theme/globe-contrast-gate.test.ts`). It sets full emissive strength, like every
 * custom layer, so the night lighting does not shade it away from its token.
 */
import { LineLayer, ShapeSource, type LineLayerStyle } from '@rnmapbox/maps';

import { GlobeLayers, GlobeStyle, type GlobeScheme } from '@/constants/theme';
import { graticule } from '@/features/globe/graticule';

/** Static: computed once, shared by every render of every globe. */
const GRATICULE = graticule(GlobeLayers.graticule.step);

export function graticuleStyle(scheme: GlobeScheme): LineLayerStyle {
  const { fadeStartZoom, fadeEndZoom, width } = GlobeLayers.graticule;
  const { graticule: colour, graticuleOpacity } = GlobeStyle[scheme];
  return {
    lineColor: colour,
    lineWidth: width,
    lineOpacity: [
      'interpolate',
      ['linear'],
      ['zoom'],
      fadeStartZoom,
      graticuleOpacity,
      fadeEndZoom,
      0,
    ],
    lineEmissiveStrength: 1,
  };
}

export function GraticuleLayer({ scheme }: { scheme: GlobeScheme }) {
  return (
    <ShapeSource id="globe-graticule" shape={GRATICULE}>
      <LineLayer id="globe-graticule-line" slot="bottom" style={graticuleStyle(scheme)} />
    </ShapeSource>
  );
}
