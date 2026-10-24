/**
 * T517 — feature 005 FR-009, FR-083, SC-001, contract C5-1 (b).
 *
 * No Atlas palette value may occur anywhere in `apps/mobile/src`: the cobalt accent, the
 * paper-tinted neutrals and every other hex literal of feature 004's palette (listed in
 * `atlas-values.ts`). The application source is every text file under `src/`, tests that sit
 * beside the code included, exactly as `no-neumorphism.test.ts` searches it.
 *
 * This guard was written to be red until T564 retired Atlas. T514 re-pointed the palette, the
 * globe colours and the comments in one change, so the search was already empty and T564
 * (which found no Atlas value left in `src/`) leaves it as a standing regression test: a new
 * literal, in a component or a comment, fails it. The Atlas-only TREATMENTS are guarded in
 * `no-neumorphism.test.ts` (a plain zero since T564 retired them).
 */
import path from 'node:path';

import { GlobeColors } from '@/constants/theme';
import { PaletteNames, Palettes } from '@/theme/palette';

import {
  ATLAS_PALETTE_VALUES,
  SRC,
  atlasLiteralPattern,
  literalHitsIn,
  sourceFiles,
} from './atlas-values';

const files = sourceFiles(SRC);

/** Every colour the Sunrise look uses, as upper-case `#RRGGBB` (alpha stripped, then widened). */
function sunriseValues(): Set<string> {
  const values = new Set<string>();
  for (const name of PaletteNames) {
    for (const value of Object.values(Palettes[name])) values.add(value.toUpperCase());
  }
  for (const scheme of Object.values(GlobeColors)) {
    for (const value of Object.values(scheme)) values.add(value.toUpperCase());
  }
  return values;
}

describe('the Atlas palette is retired from the application source (SC-001, FR-083)', () => {
  test('the search covers the real source tree, not an empty one', () => {
    // A path typo would make "no hits" vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(
      files.some((file) => file.endsWith(path.join('theme', 'palette.data.js'))),
    ).toBe(true);
  });

  test('no Atlas hex literal occurs anywhere under src/', () => {
    expect(files.flatMap((file) => literalHitsIn(file))).toEqual([]);
  });
});

describe('the Atlas value list (test/theme/atlas-values.ts)', () => {
  test('holds the 004 palette: sixty-four upper-case hex literals, no duplicate', () => {
    expect(ATLAS_PALETTE_VALUES).toHaveLength(64);
    expect(new Set(ATLAS_PALETTE_VALUES).size).toBe(ATLAS_PALETTE_VALUES.length);
    for (const value of ATLAS_PALETTE_VALUES) {
      expect(value).toMatch(/^#(?:[0-9A-F]{6}|[0-9A-F]{8})$/);
    }
  });

  test('names the cobalt accent and the paper-tinted canvas of every Atlas theme', () => {
    expect(ATLAS_PALETTE_VALUES).toEqual(
      expect.arrayContaining(['#2456C7', '#F5F2EB', '#7FA8FF', '#091018', '#13347D']),
    );
  });

  test('shares no value with the Sunrise look, or the guard would flag the new palette', () => {
    const sunrise = sunriseValues();
    expect(ATLAS_PALETTE_VALUES.filter((value) => sunrise.has(value))).toEqual([]);
  });
});

describe('the scanner can fail (it is not vacuous)', () => {
  test('finds an Atlas value in any case, with its line', () => {
    const sample = ['const a = 1;', "const accent = '#2456c7';", '// #F5F2EB paper'].join(
      '\n',
    );
    expect(literalHitsIn('src/x.ts', sample)).toEqual([
      "src/x.ts:2  #2456C7  const accent = '#2456c7';",
      'src/x.ts:3  #F5F2EB  // #F5F2EB paper',
    ]);
  });

  test('does not mistake a longer hex for a shorter Atlas value', () => {
    // #111B28 is an Atlas ink; #111B2866 is the Atlas scrim; neither is #111B28AB.
    expect(literalHitsIn('src/x.ts', "'#111B28AB'")).toEqual([]);
    expect(literalHitsIn('src/x.ts', "'#111B2866'")).toHaveLength(1);
    expect(literalHitsIn('src/x.ts', "'#111B28'")).toHaveLength(1);
  });

  test('leaves a Sunrise value alone', () => {
    expect(literalHitsIn('src/x.ts', "'#FF6B4A' '#0E2A47' '#E04A33'")).toEqual([]);
  });

  test('the pattern is anchored on a word boundary after the digits', () => {
    expect(atlasLiteralPattern('#2456C7').test('#2456C7;')).toBe(true);
    expect(atlasLiteralPattern('#2456C7').test('#2456C7F')).toBe(false);
    expect(atlasLiteralPattern('#2456C7').test('x2456C7')).toBe(false);
  });
});
