/**
 * @jest-environment node
 *
 * Feature 005, T505 (SC-014; research D5-04, contract C5-24): every Mapbox Standard
 * `StyleImport` configuration key the app uses is a key Mapbox documents.
 *
 * `StyleImport.config` accepts ANY string key (`@rnmapbox/maps` 10.3.5 types it as
 * `StandardStyleConfig & { [key: string]: ... }`), and Mapbox ignores a key it does not
 * know, so a misspelt key type-checks, runs and does nothing. The package's own
 * `StandardStyleConfig` even names two keys wrongly: `colorBoundaries` and
 * `colorGreenspaces`; Mapbox's keys are `colorAdminBoundaries` and `colorGreenspace`. The
 * only defence is a literal list of the documented keys, kept here and NOT derived from
 * the code under test, so a typo cannot be in both.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import type { StyleImport } from '@rnmapbox/maps';
import type { ComponentProps } from 'react';

import {
  BasemapConfigs,
  BasemapWorldScaleLabels,
  type BasemapConfig,
} from '@/components/globe/basemap-config';

/**
 * The configuration properties of Mapbox Standard, copied from the "Configuration
 * Properties" table of https://docs.mapbox.com/map-styles/reference/standard/ (linked
 * from https://docs.mapbox.com/map-styles/standard/guides/, "Configuration"), read on
 * 2026-10-12. Android and iOS SDK 11.23.1, the version `@rnmapbox/maps` 10.3.5 bundles,
 * is later than every "Compatibility" entry in that table (the newest is 11.30.1 for
 * `showHdRoads`, which the app does not set).
 */
const STANDARD_CONFIG_KEYS: readonly string[] = [
  'showHdRoads',
  'showPedestrianRoads',
  'showPlaceLabels',
  'showPointOfInterestLabels',
  'showRoadLabels',
  'showTransitLabels',
  'show3dObjects',
  'show3dBuildings',
  'show3dTrees',
  'show3dLandmarks',
  'show3dFacades',
  'showLandmarkIcons',
  'showLandmarkIconLabels',
  'showAdminBoundaries',
  'showIndoor',
  'showIndoorLabels',
  'theme',
  'theme-data',
  'lightPreset',
  'font',
  'colorModePointOfInterestLabels',
  'backgroundPointOfInterestLabels',
  'densityPointOfInterestLabels',
  'fuelingStationModePointOfInterestLabels',
  'colorPlaceLabels',
  'colorRoadLabels',
  'colorCommercial',
  'colorEducation',
  'colorMedical',
  'colorIndustrial',
  'colorGreenspace',
  'colorWater',
  'colorLand',
  'colorAdminBoundaries',
  'colorPointOfInterestLabels',
  'colorMotorways',
  'colorTrunks',
  'colorRoads',
  'colorHdRoads',
  'colorBuildings',
  'colorBuildingHighlight',
  'colorBuildingSelect',
  'colorPlaceLabelHighlight',
  'colorPlaceLabelSelect',
  'colorIndoorLabelSelect',
  'colorIndoorLabelHighlight',
];

/** Typed by `@rnmapbox/maps` 10.3.5 (`StyleImport.tsx`) and ignored by Mapbox. */
const WRONGLY_TYPED_KEYS = ['colorBoundaries', 'colorGreenspaces'];

/** The keys of `config` that Mapbox does not document, in the order given. */
function unknownKeys(config: Record<string, unknown>): string[] {
  return Object.keys(config).filter((key) => !STANDARD_CONFIG_KEYS.includes(key));
}

/**
 * The top-level keys of the object literal that opens at `source[open]` (a `{`): strings
 * and nested brackets are skipped, so `lightPreset: GlobeBasemap.lightPreset[theme]` and a
 * ternary's colon do not read as keys. A spread is reported as `...` and a computed key as
 * `[computed]`, neither of which is ever allow-listed: a key list that cannot be read is
 * not a key list that was checked.
 */
function literalKeys(source: string, open: number): string[] {
  const keys: string[] = [];
  let depth = 0;
  let atKey = true;
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (depth === 1 && atKey && !/[\s,]/.test(char)) {
      atKey = false;
      if (source.startsWith('...', i)) {
        keys.push('...');
        i += 2;
        continue;
      }
      if (char === '[') keys.push('[computed]');
      else if (char === '"' || char === "'") {
        const end = source.indexOf(char, i + 1);
        keys.push(source.slice(i + 1, end));
        i = end;
        continue;
      } else if (char !== '}') {
        const word = /^[\w$]+/.exec(source.slice(i))?.[0] ?? char;
        keys.push(word);
        i += word.length - 1;
        continue;
      }
    }
    if (char === '"' || char === "'" || char === '`') i = source.indexOf(char, i + 1);
    else if ('{[('.includes(char)) depth += 1;
    else if ('}])'.includes(char)) {
      depth -= 1;
      if (depth === 0) return keys;
    } else if (depth === 1 && char === ',') atKey = true;
  }
  throw new Error('unterminated object literal');
}

/** Every inline `config={{ ... }}` of a `<StyleImport>` element in `source`, as key lists. */
function styleImportConfigs(source: string): string[][] {
  const found: string[][] = [];
  for (const element of source.matchAll(/<StyleImport\b/g)) {
    const rest = source.slice(element.index);
    const inline = /\bconfig=\{\{/.exec(rest.slice(0, rest.indexOf('/>')));
    if (inline) found.push(literalKeys(rest, inline.index + inline[0].length - 1));
  }
  return found;
}

const SRC = path.resolve(__dirname, '..', '..', 'src');

/** The production sources: a test may name a wrong key on purpose. */
function sourceFiles(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$|__tests__/.test(file))
    .map((file) => path.join(SRC, file));
}

describe('the allow-list is the provider’s, and only the provider’s', () => {
  test('lists the documented properties, once each', () => {
    expect(STANDARD_CONFIG_KEYS).toHaveLength(46);
    expect(new Set(STANDARD_CONFIG_KEYS).size).toBe(STANDARD_CONFIG_KEYS.length);
  });

  test('holds the two correct names and neither of the two wrong ones', () => {
    expect(STANDARD_CONFIG_KEYS).toEqual(
      expect.arrayContaining(['colorAdminBoundaries', 'colorGreenspace']),
    );
    for (const wrong of WRONGLY_TYPED_KEYS) {
      expect(STANDARD_CONFIG_KEYS).not.toContain(wrong);
    }
  });

  test('rejects colorBoundaries, colorGreenspaces and any other misspelling', () => {
    expect(
      unknownKeys({
        colorBoundaries: '#fff',
        colorGreenspaces: '#fff',
        colorLandd: '#fff',
        lightpreset: 'day',
        colorLand: '#fff',
        theme: 'faded',
      }),
    ).toEqual(['colorBoundaries', 'colorGreenspaces', 'colorLandd', 'lightpreset']);
  });

  test('every key the package types and Mapbox does not document is a known wrong one', () => {
    // The package's own typings are the other source of a typo: this pins WHICH keys it
    // gets wrong. When a release fixes them the set shrinks and this keeps passing; a NEW
    // wrong key fails here until it is named above on purpose.
    const typings = readFileSync(
      path.join(
        path.dirname(require.resolve('@rnmapbox/maps/package.json')),
        'src',
        'components',
        'StyleImport.tsx',
      ),
      'utf8',
    );
    const block = /export type StandardStyleConfig = \{([\s\S]*?)\n\};/.exec(
      typings,
    )?.[1];
    expect(block).toBeDefined();
    const typed = [...(block ?? '').matchAll(/^ {2}(\w+)\?:/gm)].map((m) => m[1]);
    expect(typed.length).toBeGreaterThan(20);
    for (const key of typed.filter((name) => !STANDARD_CONFIG_KEYS.includes(name))) {
      expect(WRONGLY_TYPED_KEYS).toContain(key);
    }
  });
});

describe('the source scanner reads what a StyleImport is given', () => {
  test('reads the keys of an inline literal and skips values, strings and nesting', () => {
    const source = `
      <StyleImport
        id="basemap"
        existing
        config={{
          theme: GlobeBasemap.theme,
          lightPreset: GlobeBasemap.lightPreset[theme],
          show3dObjects: a ? 'x: y' : { nested: true },
          colorLand,
        }}
      />`;
    expect(styleImportConfigs(source)).toEqual([
      ['theme', 'lightPreset', 'show3dObjects', 'colorLand'],
    ]);
  });

  test('reads every StyleImport in a file and reports a spread as unreadable', () => {
    const source = `<StyleImport config={{ a: 1 }} /><StyleImport config={{ ...rest, b: 2 }} />`;
    expect(styleImportConfigs(source)).toEqual([['a'], ['...', 'b']]);
  });

  test('reads a quoted key and flags a computed one', () => {
    const source = `<StyleImport config={{ 'theme-data': x, [dynamic]: 1, colorLand: 2, }} />`;
    expect(styleImportConfigs(source)).toEqual([
      ['theme-data', '[computed]', 'colorLand'],
    ]);
  });

  test('ignores a StyleImport whose config is not an inline literal', () => {
    expect(
      styleImportConfigs('<StyleImport id="basemap" existing config={config} />'),
    ).toEqual([]);
  });
});

describe('the app uses allow-listed keys only', () => {
  test('finds the globe’s own StyleImport, so the scan is not vacuous', () => {
    const all = sourceFiles().flatMap((file) =>
      styleImportConfigs(readFileSync(file, 'utf8')),
    );
    expect(all).toContainEqual(['theme', 'lightPreset', 'show3dObjects']);
  });

  test('no inline StyleImport config in src/ holds an unknown key', () => {
    const offenders = sourceFiles().flatMap((file) =>
      styleImportConfigs(readFileSync(file, 'utf8')).flatMap((keys) =>
        keys
          .filter((key) => !STANDARD_CONFIG_KEYS.includes(key))
          .map((key) => `${path.relative(SRC, file)}: ${key}`),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

describe('basemap-config.ts (the Sunrise globe)', () => {
  const configs = Object.entries(BasemapConfigs);

  test.each(configs)('the %s configuration holds allow-listed keys only', (_, config) => {
    expect(unknownKeys(config)).toEqual([]);
  });

  test('the world-scale label toggles hold allow-listed keys only', () => {
    expect(unknownKeys(BasemapWorldScaleLabels)).toEqual([]);
    expect(Object.values(BasemapWorldScaleLabels).every((on) => on === false)).toBe(true);
  });

  test('sets the keys Mapbox documents for the land, water, greenspace and boundaries', () => {
    for (const [, config] of configs) {
      expect(Object.keys(config)).toEqual(
        expect.arrayContaining([
          'colorLand',
          'colorWater',
          'colorGreenspace',
          'colorAdminBoundaries',
        ]),
      );
    }
  });

  test('the light globe is lit by day and the dark one by night', () => {
    expect(BasemapConfigs.light.lightPreset).toBe('day');
    expect(BasemapConfigs.dark.lightPreset).toBe('night');
  });

  test('keeps the basemap the app already draws: the faded theme with 3D objects', () => {
    for (const [, config] of configs) {
      expect(config.theme).toBe('faded');
      expect(config.show3dObjects).toBe(true);
    }
  });

  test('every colour is a hex colour, so an empty or mistyped value cannot ship', () => {
    for (const [, config] of configs) {
      for (const key of ['colorLand', 'colorWater', 'colorGreenspace'] as const) {
        expect(config[key]).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(config.colorAdminBoundaries).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  test('the type refuses the two wrongly typed keys, and the object feeds StyleImport', () => {
    // `tsc --noEmit` checks these lines: an `@ts-expect-error` that stops failing is an
    // error, so the typo can never type-check here, as it does against the package.
    const base = BasemapConfigs.light;
    // @ts-expect-error colorBoundaries is not a Mapbox Standard key
    const wrongBoundaries: BasemapConfig = { ...base, colorBoundaries: '#FFFFFF' };
    // @ts-expect-error colorGreenspaces is not a Mapbox Standard key
    const wrongGreenspaces: BasemapConfig = { ...base, colorGreenspaces: '#FFFFFF' };
    expect([wrongBoundaries, wrongGreenspaces]).toHaveLength(2);
    const asProp: ComponentProps<typeof StyleImport>['config'] = base;
    expect(asProp).toBe(base);
  });
});
