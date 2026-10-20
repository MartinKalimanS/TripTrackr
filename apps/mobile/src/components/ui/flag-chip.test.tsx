/**
 * T520 - contract C5-16 (`FlagChip`) and research D5-16 (owner answer Q-3): the flag emoji
 * of a country's ISO alpha-2 code in a clipped 20 by 14 dp box (28 by 20 large) rounded 3
 * (4) with a hairline, and the two letters in a neutral chip where there is no glyph.
 * Decorative: the country name is beside it, so it is hidden from assistive technology.
 * There is no flag package and no network.
 */
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { PaletteNames, Palettes } from '@/theme';

import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { FlagChip, flagGlyph } from './flag-chip';

afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const flat = (element: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(element.props.style as never) ?? {}) as Record<string, unknown>;
const box = () => screen.getByTestId('flag', hidden);

describe('flagGlyph - the regional indicators of an ISO alpha-2 code', () => {
  test.each([
    ['PT', '\u{1F1F5}\u{1F1F9}'],
    ['pt', '\u{1F1F5}\u{1F1F9}'],
    ['JP', '\u{1F1EF}\u{1F1F5}'],
    ['US', '\u{1F1FA}\u{1F1F8}'],
  ])('%s is %s', (code, glyph) => {
    expect(flagGlyph(code)).toBe(glyph);
  });

  test.each([[''], ['P'], ['PRT'], ['1A'], ['P-'], [' PT'], [null], [undefined]])(
    '%p has no glyph',
    (code) => {
      expect(flagGlyph(code as string)).toBeNull();
    },
  );
});

describe('<FlagChip> glyph - D5-16', () => {
  test('draws the flag emoji of its code', async () => {
    await render(<FlagChip iso2="PT" testID="flag" />);
    expect(screen.getByText('\u{1F1F5}\u{1F1F9}', hidden)).toBeTruthy();
  });

  test('is 20 by 14 dp, rounded 3, clipped, with a hairline', async () => {
    mockThemeColors('light');
    await render(<FlagChip iso2="PT" testID="flag" />);
    expect(flat(box())).toMatchObject({
      width: 20,
      height: 14,
      borderRadius: 3,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: asCss(Palettes.light.hairline),
    });
  });

  test('is 28 by 20 dp, rounded 4, when large', async () => {
    await render(<FlagChip iso2="PT" size="lg" testID="flag" />);
    expect(flat(box())).toMatchObject({ width: 28, height: 20, borderRadius: 4 });
  });

  test('does not scale with the text size: the box is fixed, the glyph is decorative', async () => {
    await render(<FlagChip iso2="PT" testID="flag" />);
    const glyph = screen.getByText('\u{1F1F5}\u{1F1F9}', hidden);
    expect(glyph.props.allowFontScaling).toBe(false);
  });

  test('takes any case of the code', async () => {
    await render(<FlagChip iso2="pt" testID="flag" />);
    expect(screen.getByText('\u{1F1F5}\u{1F1F9}', hidden)).toBeTruthy();
  });
});

describe('<FlagChip> letters fallback - D5-16', () => {
  test.each([[''], ['XYZ'], ['1A']])(
    'a code with no glyph (%p) shows its letters in a neutral chip',
    async (code) => {
      mockThemeColors('light');
      await render(<FlagChip iso2={code} testID="flag" />);
      const letters =
        code
          .replace(/[^A-Za-z]/g, '')
          .slice(0, 2)
          .toUpperCase() || '?';
      expect(screen.getByText(letters, hidden)).toBeTruthy();
      expect(flat(box()).backgroundColor).toBe(asCss(Palettes.light.surfaceSecondary));
    },
  );

  test('the letters are decorative and fixed too', async () => {
    await render(<FlagChip iso2="XYZ" testID="flag" />);
    expect(screen.getByText('XY', hidden).props.allowFontScaling).toBe(false);
  });
});

describe.each(PaletteNames)('<FlagChip> in %s', (theme) => {
  test('draws its hairline from the palette', async () => {
    mockThemeColors(theme);
    await render(<FlagChip iso2="PT" testID="flag" />);
    expect(flat(box()).borderColor).toBe(asCss(Palettes[theme].hairline));
  });
});

describe('<FlagChip> accessibility - decorative', () => {
  test('is hidden from assistive technology: the country name is beside it', async () => {
    await render(<FlagChip iso2="PT" testID="flag" />);
    expect(box().props.accessible).toBe(false);
    expect(box().props.accessibilityElementsHidden).toBe(true);
    expect(box().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.queryByText('\u{1F1F5}\u{1F1F9}')).toBeNull();
  });

  test('is not pressable', async () => {
    await render(<FlagChip iso2="PT" testID="flag" />);
    expect(box().props.onPress).toBeUndefined();
  });
});
