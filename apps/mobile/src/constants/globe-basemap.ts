/**
 * The colours of the Sunrise basemap — feature 005, contract C5-11, research D5-04.
 *
 * The token layer: a colour literal belongs here and not in `components/globe/`, where
 * ESLint refuses one (contract C4-1). `components/globe/basemap-config.ts` turns these
 * into the `StyleImport` configuration of Mapbox Standard.
 *
 * These are STARTING values, copied from the table of C5-11: cream land (two shades), the
 * aqua sea, and greenspace and administrative boundaries that start at land and `sand` of
 * the palette. The device spike V2 (tasks T508) tunes them over day and night, the "soft
 * sage" greenspace of D5-04 included; T532 folds them into the `GlobeStyle` group of
 * `constants/theme.ts` and the globe contrast gate (`test/theme/globe-contrast-gate.test.ts`)
 * measures every keyline against both land shades. Until then nothing reads them but
 * `basemap-config.ts`, which `globe-view.tsx` does not use yet.
 *
 * Keys follow the lighting of the basemap (`GlobeBasemap.lightPreset`), as `GlobeColors`
 * does: `light` is drawn by day, `dark` by night.
 */
export const GlobeBasemapColors = {
  light: {
    land: '#FFFCF5',
    water: '#8FD6EC',
    greenspace: '#F6E9D2',
    adminBoundaries: '#EBDCC9',
  },
  dark: {
    land: '#3C6E99',
    water: '#0E3465',
    greenspace: '#2A557E',
    adminBoundaries: '#2B4466',
  },
} as const;
