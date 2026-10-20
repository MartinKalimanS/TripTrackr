/**
 * T523 - `GeneratedCover`, what a trip without a usable photograph shows instead of a grey
 * slab (feature 005; FR-008, FR-034, FR-076; data-model section 10; contract C5-19).
 *
 * Proven here: the palette is a pure, stable function of the trip (`fnv1a32(seed) % 3`);
 * the cover is a gradient with a country code, a stamp outline and no flag of its own (the
 * card's caption carries the flag chip, as on a photograph); it is decoration, hidden from
 * assistive technology; and the white `onPhoto` that sits on it clears the floor on EVERY
 * stop, read back from what the cover renders.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { fnv1a32 } from '@/lib/fnv1a';
import { ContrastFloor, PaletteNames, Palettes, type PaletteName } from '@/theme';
import { contrastRatio } from '@/theme/contrast';

import { GeneratedCover, coverGlyph, coverPalette } from './generated-cover';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function setTheme(name: PaletteName) {
  useAppearance.mockReturnValue({
    theme: name.startsWith('dark') ? 'dark' : 'light',
    themeName: name,
    prefersMoreContrast: name.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors[name],
    ready: true,
  });
}

beforeEach(() => setTheme('light'));

/** The cover is decoration, so a default query (which skips hidden nodes) must not see it. */
const node = (testID: string) =>
  screen.getByTestId(testID, { includeHiddenElements: true });
const flat = (testID: string): ViewStyle =>
  StyleSheet.flatten(node(testID).props.style) ?? {};

describe('coverPalette - a stable pick of one of three palettes', () => {
  test.each([
    ['trip-1', 1],
    ['trip-2', 1],
    ['trip-3', 2],
    ['Portugal Road Trip', 0],
    ['0b8f2a3e-1111-4222-8333-444455556666', 2],
    ['', 1],
  ] as const)('%j is palette %i, as on every launch and device', (seed, expected) => {
    expect(coverPalette(seed)).toBe(expected);
  });

  test('is fnv1a32 of the seed modulo three', () => {
    for (const seed of ['a', 'Tokyo & Kyoto', 'trip-77', '\u{1F30D}']) {
      expect(coverPalette(seed)).toBe(fnv1a32(seed) % 3);
    }
  });

  test('is the same for the same seed and spreads 300 trips over all three palettes', () => {
    const seen = new Map<number, number>();
    for (let index = 0; index < 300; index += 1) {
      const seed = `trip-${index}`;
      expect(coverPalette(seed)).toBe(coverPalette(seed));
      seen.set(coverPalette(seed), (seen.get(coverPalette(seed)) ?? 0) + 1);
    }
    expect([...seen.keys()].sort()).toEqual([0, 1, 2]);
    // Roughly a third each: no palette is starved.
    for (const count of seen.values()) expect(count).toBeGreaterThan(60);
  });
});

describe('coverGlyph - the big typographic mark', () => {
  test('is the country code, upper case', () => {
    expect(coverGlyph('pt', 'P')).toBe('PT');
    expect(coverGlyph(' jp ', 'T')).toBe('JP');
  });

  test('is the initial of the trip when there is no country', () => {
    expect(coverGlyph(null, 'p')).toBe('P');
    expect(coverGlyph(undefined, 'iceland')).toBe('I');
    expect(coverGlyph('', 'Marta')).toBe('M');
  });

  test('keeps one whole letter of the initial, even an emoji or a ligature', () => {
    expect(coverGlyph(null, '\u{1F30D} Trip')).toBe('\u{1F30D}');
    expect(coverGlyph(null, '\u00df')).toBe('S');
  });

  test('is empty when there is nothing to show', () => {
    expect(coverGlyph(null, '')).toBe('');
    expect(coverGlyph(undefined, '  ')).toBe('');
  });
});

describe('GeneratedCover - what is drawn', () => {
  test('is a gradient of the palette, never an empty box', async () => {
    await render(<GeneratedCover palette={2} iso2="PT" initial="P" />);
    const gradient = node('generated-cover-gradient');
    const layers = StyleSheet.flatten(gradient.props.style)
      .experimental_backgroundImage as readonly unknown[];
    expect(layers.length).toBeGreaterThan(0);
    const light = Palettes.light;
    const linear = layers[layers.length - 1] as { colorStops: { color: string }[] };
    expect(linear.colorStops.map((stop) => stop.color)).toEqual([
      light.cover3Start,
      light.cover3End,
    ]);
  });

  test('shows the country code as a ghost glyph at 16 percent white', async () => {
    await render(<GeneratedCover palette={0} iso2="pt" initial="P" />);
    const glyph = node('generated-cover-glyph');
    expect(glyph).toHaveTextContent('PT');
    const style = StyleSheet.flatten(glyph.props.style);
    expect(style.color).toBe(`${Palettes.light.onPhoto}29`);
    expect(style.fontSize).toBe(120);
    expect(glyph.props.allowFontScaling).toBe(false);
  });

  test('falls back to the initial of the trip with no country', async () => {
    await render(<GeneratedCover palette={1} iso2={null} initial="Iceland" />);
    expect(node('generated-cover-glyph')).toHaveTextContent('I');
  });

  test('draws a dashed stamp outline, and no flag, no text of its own', async () => {
    await render(<GeneratedCover palette={0} iso2="PT" initial="P" />);
    const stamp = node('generated-cover-stamp');
    expect(stamp).toBeTruthy();
    expect(
      screen.queryByTestId('generated-cover-flag', { includeHiddenElements: true }),
    ).toBeNull();
    expect(JSON.stringify(screen.toJSON())).toContain('"strokeDasharray":["7","6"]');
  });

  test('a thumbnail shows the code only, 40 dp, in opaque white (text on a photo is never alpha)', async () => {
    await render(<GeneratedCover palette={0} iso2="PT" initial="P" thumb />);
    expect(
      screen.queryByTestId('generated-cover-stamp', { includeHiddenElements: true }),
    ).toBeNull();
    const style = StyleSheet.flatten(node('generated-cover-glyph').props.style);
    expect(style.fontSize).toBe(40);
    expect(style.color).toBe(Palettes.light.onPhoto);
  });

  test('fills the frame of the photograph it replaces and clips to it, so nothing jumps', async () => {
    await render(<GeneratedCover palette={0} iso2="PT" initial="P" />);
    expect(flat('generated-cover')).toMatchObject({
      ...StyleSheet.absoluteFill,
      overflow: 'hidden',
    });
  });

  test('a caller style and testID win', async () => {
    await render(
      <GeneratedCover
        palette={0}
        iso2="PT"
        initial="P"
        testID="trip-card-cover"
        style={{ borderRadius: 24 }}
      />,
    );
    expect(flat('trip-card-cover')).toMatchObject({
      borderRadius: 24,
      overflow: 'hidden',
    });
  });
});

describe('GeneratedCover - decoration for assistive technology (FR-076)', () => {
  test('is hidden, with its descendants, and takes no touch', async () => {
    await render(<GeneratedCover palette={0} iso2="PT" initial="P" />);
    const cover = node('generated-cover');
    expect(cover.props.accessibilityElementsHidden).toBe(true);
    expect(cover.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(cover.props.pointerEvents).toBe('none');
    expect(screen.queryByText('PT')).toBeNull();
  });
});

/** FR-008: white text over the cover clears the floor on every stop of every palette. */
describe.each(PaletteNames)('white on the generated covers - %s', (name) => {
  const floor = name.endsWith('-contrast')
    ? ContrastFloor.increasedContrast
    : ContrastFloor.normalText;
  beforeEach(() => setTheme(name));

  test.each([0, 1, 2] as const)(
    `palette %i holds ${floor}:1 on both stops`,
    async (index) => {
      await render(<GeneratedCover palette={index} iso2="PT" initial="P" thumb />);
      const style = StyleSheet.flatten(node('generated-cover-gradient').props.style);
      const layers = style.experimental_backgroundImage as readonly {
        type: string;
        colorStops: { color: string }[];
      }[];
      const linear = layers.find((layer) => layer.type === 'linear-gradient');
      expect(linear?.colorStops).toHaveLength(2);
      const glyph = StyleSheet.flatten(node('generated-cover-glyph').props.style);
      for (const { color } of linear?.colorStops ?? []) {
        expect(contrastRatio(String(glyph.color), color)).toBeGreaterThanOrEqual(floor);
      }
    },
  );
});
