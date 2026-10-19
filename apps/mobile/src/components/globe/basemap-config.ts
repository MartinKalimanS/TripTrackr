/**
 * The `StyleImport` configuration of the Sunrise globe — feature 005, contract C5-24,
 * research D5-04, SC-014.
 *
 * Mapbox Standard is configured through `<StyleImport id="basemap" existing config={...}>`
 * (https://docs.mapbox.com/map-styles/standard/guides/, "Configuration"). The package
 * types `config` as any string key, and Mapbox ignores a key it does not know, so a
 * misspelling is silent; `@rnmapbox/maps` 10.3.5 even types two keys wrongly
 * (`colorBoundaries` and `colorGreenspaces`, which Mapbox calls `colorAdminBoundaries` and
 * `colorGreenspace`). So the types below list only keys Mapbox documents, an object with
 * any other key does not compile, and `test/globe/basemap-config-keys.test.ts` checks every
 * key the app uses against a literal copy of the provider's list.
 *
 * The colours are tokens: the land from `GlobeColors`, the sea, the greenspace and the
 * administrative boundaries from `GlobeStyle`. `globe-view.tsx` hands `basemapConfig(...)`
 * to the `StyleImport`: the faded theme, lit by day or by night, 3D objects on, and the
 * point-of-interest, transit and road labels off while the whole planet is in view
 * (`worldScale`), switched back on explicitly closer in (an omitted key keeps its old
 * value, so "on" has to be sent).
 */
import {
  GlobeBasemap,
  GlobeColors,
  GlobeStyle,
  type GlobeScheme,
} from '@/constants/theme';

/** The two lightings of the globe, which `GlobeColors` and `GlobeBasemap` are keyed by. */
export type BasemapScheme = GlobeScheme;

/** What the Sunrise globe sets on the basemap; every key is a documented Standard key. */
export type BasemapConfig = {
  theme: 'default' | 'faded' | 'monochrome';
  lightPreset: 'day' | 'night';
  show3dObjects: boolean;
  colorLand: string;
  colorWater: string;
  colorGreenspace: string;
  colorAdminBoundaries: string;
};

/** The label toggles of the world view, merged over a `BasemapConfig` while zoomed out. */
export type BasemapLabelToggles = {
  showPointOfInterestLabels: boolean;
  showTransitLabels: boolean;
  showRoadLabels: boolean;
};

function configFor(scheme: BasemapScheme): BasemapConfig {
  const style = GlobeStyle[scheme];
  return {
    theme: GlobeBasemap.theme,
    lightPreset: GlobeBasemap.lightPreset[scheme],
    show3dObjects: true,
    colorLand: GlobeColors[scheme].land,
    colorWater: style.water,
    colorGreenspace: style.greenspace,
    colorAdminBoundaries: style.adminBoundaries,
  };
}

/** The configuration by lighting: `light` is drawn by day, `dark` by night. */
export const BasemapConfigs: Readonly<Record<BasemapScheme, BasemapConfig>> = {
  light: configFor('light'),
  dark: configFor('dark'),
};

/**
 * "The label toggles off at world scale" (D5-04): points of interest, transit and road
 * labels are noise on a whole sphere. Place labels are left as Standard draws them.
 */
export const BasemapWorldScaleLabels: Readonly<BasemapLabelToggles> = {
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showRoadLabels: false,
};

/** The same toggles closer in: sent explicitly, because an omitted key keeps its old value. */
export const BasemapStreetLabels: Readonly<BasemapLabelToggles> = {
  showPointOfInterestLabels: true,
  showTransitLabels: true,
  showRoadLabels: true,
};

export type ScaledBasemapConfig = Readonly<BasemapConfig & BasemapLabelToggles>;

function scaled(scheme: BasemapScheme) {
  return {
    world: { ...BasemapConfigs[scheme], ...BasemapWorldScaleLabels },
    street: { ...BasemapConfigs[scheme], ...BasemapStreetLabels },
  };
}

/** Built once: the same object for the same arguments, so a render never re-sends it. */
const SCALED: Readonly<
  Record<BasemapScheme, { world: ScaledBasemapConfig; street: ScaledBasemapConfig }>
> = { light: scaled('light'), dark: scaled('dark') };

/** What the globe hands the basemap for a lighting and a scale. */
export function basemapConfig(
  scheme: BasemapScheme,
  worldScale: boolean,
): ScaledBasemapConfig {
  return SCALED[scheme][worldScale ? 'world' : 'street'];
}
