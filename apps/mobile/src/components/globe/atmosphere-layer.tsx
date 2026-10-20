/**
 * The atmosphere — feature 005, T532 (research D5-04, contract C5-24).
 *
 * `<Atmosphere style>` is the fog and the sky round the planet. Its five properties are the
 * ones the `@rnmapbox/maps` 10.3.5 typings give (`AtmosphereLayerStyle`: `color`,
 * `highColor`, `spaceColor`, `horizonBlend`, `starIntensity`). `color` and `highColor` are the
 * soft light-blue (night: teal) halo of the pictures, OPAQUE tokens (`GlobeStyle`): an alpha
 * below 1 on `color` loads more tiles. `spaceColor` is the one transparent stop, the sky's own
 * colour at opacity 0: Mapbox documents "the opacity can be set to 0 to have a transparent
 * background", so the sky (`Scrim` `sky`, the prototype's `--sky`) shows behind the map. Whether
 * it does on each platform, and whether it overrides Standard's own fog at globe zoom, are
 * device checks (V2, T508; `as-built/f1-map-style.md`).
 */
import { Atmosphere, type AtmosphereLayerStyle } from '@rnmapbox/maps';

import { GlobeStyle, type GlobeScheme } from '@/constants/theme';

export function atmosphereStyle(scheme: GlobeScheme): AtmosphereLayerStyle {
  const { color, highColor, spaceColor, horizonBlend, starIntensity } =
    GlobeStyle[scheme].atmosphere;
  return { color, highColor, spaceColor, horizonBlend, starIntensity };
}

export function AtmosphereLayer({ scheme }: { scheme: GlobeScheme }) {
  return <Atmosphere style={atmosphereStyle(scheme)} />;
}
