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
 * SKELETON: this module is not wired into `globe-view.tsx`, which keeps the configuration
 * it has (`theme`, `lightPreset`, `show3dObjects`). T532 replaces that inline object with
 * `BasemapConfigs[theme]` once the colours are tuned on a device (V2, T508). What it draws
 * is unchanged until then: the faded theme, lit by day or by night, 3D objects on.
 */
import { GlobeBasemap } from '@/constants/theme';
import { GlobeBasemapColors } from '@/constants/globe-basemap';

/** The two lightings of the globe, which `GlobeColors` and `GlobeBasemap` are keyed by. */
export type BasemapScheme = keyof typeof GlobeBasemap.lightPreset;

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
  const colors = GlobeBasemapColors[scheme];
  return {
    theme: GlobeBasemap.theme,
    lightPreset: GlobeBasemap.lightPreset[scheme],
    show3dObjects: true,
    colorLand: colors.land,
    colorWater: colors.water,
    colorGreenspace: colors.greenspace,
    colorAdminBoundaries: colors.adminBoundaries,
  };
}

/** The configuration by lighting: `light` is drawn by day, `dark` by night. */
export const BasemapConfigs: Readonly<Record<BasemapScheme, BasemapConfig>> = {
  light: configFor('light'),
  dark: configFor('dark'),
};

/**
 * "The label toggles off at world scale" (D5-04): points of interest, transit and road
 * labels are noise on a whole sphere. Place labels are left as Standard draws them; whether
 * and at which zoom these are applied is T532's, decided on a device.
 */
export const BasemapWorldScaleLabels: Readonly<BasemapLabelToggles> = {
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showRoadLabels: false,
};
