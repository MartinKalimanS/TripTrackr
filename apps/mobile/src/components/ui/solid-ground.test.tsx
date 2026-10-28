/**
 * T562 - opaque surfaces (feature 005; FR-072, FR-073, SC-008). A tint is a translucent colour
 * in the dark themes (`accentTint` is white-ish coral at 16 percent); under increased contrast
 * or reduced transparency `useColors` hands it over as the opaque colour it comes to over the
 * theme's `surface`, so every chip, pill and button fill built from a tint is solid. The light
 * themes' tints are opaque already and come back unchanged, and so does every other key.
 *
 * The appearance is the real chain: an `AppearanceScope` provides the flags (the dev gallery's
 * mechanism, which the same hooks answer from), and the kit's colour hook answers from the
 * generated stylesheet in the theme of the scope (`test/appearance/sweep.tsx`).
 */
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { Palettes, blend, type PaletteName } from '@/theme';

import { installThemeAwareKit, Scoped, type Setup } from '../../../test/appearance/sweep';

import { solidOver } from './solid-ground';
import { useColors } from './theme-tokens';

const TINTS = [
  'accentTint',
  'aquaTint',
  'amberTint',
  'dangerTint',
  'successTint',
] as const;
const KEYS = [...TINTS, 'ink', 'hairline'] as const;

beforeEach(() => installThemeAwareKit());
afterEach(() => jest.restoreAllMocks());

async function colours(setup: Setup) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Scoped setup={setup}>{children as never}</Scoped>
  );
  const { result } = await renderHook(() => useColors(KEYS), { wrapper });
  return result.current;
}

describe('solidOver', () => {
  test('lays a colour with an alpha byte over the ground', () => {
    // coral at 41/255 over Nightfall paper, worked by hand: (54, 48, 63).
    expect(solidOver('#ff826629', '#0F2037').toLowerCase()).toBe('#36303f');
    expect(solidOver('#FF826629', '#0F2037').toLowerCase()).toBe(
      blend('#FF8266', '#0F2037', 0x29 / 255).toLowerCase(),
    );
  });

  test('a colour with no alpha byte comes back as it was', () => {
    expect(solidOver('#ffe9e1', '#0F2037')).toBe('#ffe9e1');
    expect(solidOver('#808080', '#FFFFFF')).toBe('#808080');
  });

  test('a fully opaque alpha byte is the colour itself', () => {
    expect(solidOver('#FF6B4AFF', '#0F2037').toLowerCase()).toBe('#ff6b4a');
  });
});

describe('useColors under increased contrast and reduced transparency', () => {
  test('dark, nothing asked: the tints are the translucent colours of the palette', async () => {
    const found = await colours({ theme: 'dark' });
    for (const key of TINTS) {
      expect(found[key]).toBe(Palettes.dark[key].toLowerCase());
      expect(found[key]).toHaveLength(9);
    }
  });

  test.each([
    ['dark with reduced transparency', { theme: 'dark', reduceTransparency: true }],
    ['dark-contrast', { theme: 'dark-contrast' }],
  ] as const)(
    '%s: every tint is the opaque colour over the surface',
    async (_n, setup) => {
      const found = await colours(setup);
      const palette = Palettes[setup.theme as PaletteName];
      for (const key of TINTS) {
        expect(found[key]).toMatch(/^#[0-9a-f]{6}$/i);
        expect(found[key].toLowerCase()).toBe(
          solidOver(palette[key], palette.surface).toLowerCase(),
        );
      }
      expect(found.ink).toBe(palette.ink.toLowerCase());
    },
  );

  test('the lines stay translucent: a hairline is not a surface', async () => {
    const found = await colours({ theme: 'dark-contrast' });
    expect(found.hairline).toBe(Palettes['dark-contrast'].hairline.toLowerCase());
  });

  test.each([
    ['light', { theme: 'light', reduceTransparency: true }],
    ['light-contrast', { theme: 'light-contrast' }],
  ] as const)('%s: the tints were opaque and are unchanged', async (_name, setup) => {
    const found = await colours(setup);
    const palette = Palettes[setup.theme as PaletteName];
    for (const key of TINTS) expect(found[key]).toBe(palette[key].toLowerCase());
  });
});
