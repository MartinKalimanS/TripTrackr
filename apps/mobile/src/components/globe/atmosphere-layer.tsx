/**
 * The atmosphere — feature 005, T532 (research D5-04, contract C5-24).
 *
 * `<Atmosphere style>` is the fog and the sky round the planet. Its five properties are the
 * ones the `@rnmapbox/maps` 10.3.5 typings give (`AtmosphereLayerStyle`: `color`,
 * `highColor`, `spaceColor`, `horizonBlend`, `starIntensity`): a cream-white horizon, a pale
 * aqua high colour and a warm peach space colour by day, deep navy by night, no stars. All
 * three colours are OPAQUE tokens (`GlobeStyle`): an alpha below 1 on `color` loads more
 * tiles. Whether it overrides Standard's own fog at globe zoom, and whether `spaceColor`
 * with alpha 0 would show the sky behind the map, are device checks (V2, T508).
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
