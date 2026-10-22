/**
 * T518 - contract C5-14 (`Icon` over Phosphor), research D5-07, FR-005, FR-030.
 *
 * Phosphor draws a `react-native-svg` node that carries the size, the tint and, when
 * mirrored, a `scaleX: -1` transform (`test/helpers/icons.ts` reads them back by registry
 * key). The accessibility contract is asserted on the adapter's own wrapper, which is where
 * it lives on both platforms.
 */
import { render, screen } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { I18nManager } from 'react-native';

import { glyphId, glyphsIn } from '../../../test/helpers/icons';
import { themeVariable } from '../../../test/helpers/theme-css';
import { IconSize as IconSizes, PaletteNames, Palettes, contrastRatio } from '@/theme';
import { Icon, type IconSize, type IconTone } from './icon';

afterEach(() => jest.restoreAllMocks());

// A decorative icon is hidden from assistive technology, and Testing Library's default
// queries honour that, so a test reads it explicitly.
const hidden = { includeHiddenElements: true };
const byId = (id: string) => screen.getByTestId(id, hidden);

describe('<Icon> glyph - D5-07', () => {
  test('draws the glyph its registry key names, regular, 20 dp, unless asked', async () => {
    await render(<Icon name="chevron-left" />);
    expect(glyphsIn()).toEqual([
      {
        name: 'chevron-left',
        weight: 'regular',
        size: 20,
        color: expect.any(String),
        mirrored: false,
      },
    ]);
  });

  test('accepts 16, 20 and 24, the sizes of IconSize', async () => {
    expect(Object.values(IconSizes)).toEqual([16, 20, 24]);
    for (const size of [16, 20, 24] as const) {
      await render(<Icon name="plus" size={size} />);
      expect(glyphsIn().at(0)?.size).toBe(size);
    }
    const sizes: IconSize[] = [16, 20, 24];
    expect(sizes).toHaveLength(3);
  });

  test.each(['regular', 'fill', 'duotone'] as const)(
    'draws the %s weight of the glyph',
    async (weight) => {
      await render(<Icon name="globe" weight={weight} />);
      expect(byId(glyphId('globe', weight))).toBeTruthy();
      expect(glyphsIn().at(0)?.weight).toBe(weight);
    },
  );

  test('refuses what the registry cannot draw, at compile time', () => {
    // @ts-expect-error - an unknown key
    const unknown = <Icon name="globe.europe.africa" />;
    // @ts-expect-error - the feature 004 form, one name per platform
    const legacy = <Icon name={{ ios: 'plus', android: 'add' }} />;
    // @ts-expect-error - 18 dp is not on the size scale
    const size = <Icon name="plus" size={18} />;
    // @ts-expect-error - a weight Phosphor has but the app does not use
    const weight = <Icon name="plus" weight="bold" />;
    // @ts-expect-error - a tone is a name, never a colour
    const tone = <Icon name="plus" tone="#ff0000" />;
    expect([unknown, legacy, size, weight, tone]).toHaveLength(5);
  });
});

describe('<Icon> direction - mirrored when the layout is reversed', () => {
  const mirroredIn = async (name: 'chevron-right' | 'plus', rtl: boolean) => {
    jest.replaceProperty(I18nManager, 'isRTL', rtl);
    await render(<Icon name={name} />);
    return glyphsIn().at(0)?.mirrored;
  };

  test('a direction glyph mirrors in a right-to-left layout', async () => {
    expect(await mirroredIn('chevron-right', true)).toBe(true);
  });

  test('and not in a left-to-right one', async () => {
    expect(await mirroredIn('chevron-right', false)).toBe(false);
  });

  test('a glyph that points nowhere never mirrors', async () => {
    expect(await mirroredIn('plus', true)).toBe(false);
  });
});

/**
 * Every tone: the kit or app variable it asks `useThemeColor` for, and the palette key that
 * variable is generated from (C5-6), so the contrast themes need no promotion.
 */
const TONES: [IconTone, string, keyof (typeof Palettes)['light']][] = [
  ['ink', 'foreground', 'ink'],
  ['muted', 'muted', 'muted'],
  ['subtle', 'subtle', 'subtle'],
  ['onInk', 'on-ink', 'onInk'],
  ['onPhoto', 'on-photo', 'onPhoto'],
  ['accentInk', 'accent-foreground', 'accentInk'],
  ['accentText', 'accent-text', 'accentText'],
  ['accentLine', 'accent-line', 'accentLine'],
  ['aquaInk', 'aqua-ink', 'aquaInk'],
  ['aquaLine', 'aqua-line', 'aquaLine'],
  ['amberInk', 'amber-ink', 'amberInk'],
  ['amberLine', 'amber-line', 'amberLine'],
  ['amber', 'amber', 'amber'],
  ['danger', 'danger', 'danger'],
  ['dangerInk', 'danger-foreground', 'dangerInk'],
  ['success', 'success', 'success'],
  // The feature 004 names, kept for the call sites that have not moved. Each reads a token
  // that passes: coral as ink is `accentText`, never the coral fill (D5-22, M-1).
  ['default', 'foreground', 'ink'],
  ['accent', 'accent-text', 'accentText'],
  ['onAccent', 'accent-foreground', 'accentInk'],
  ['statusPlanning', 'amber-ink', 'amberInk'],
  ['statusActive', 'accent-line', 'accentLine'],
  ['statusPast', 'muted', 'muted'],
  ['pending', 'amber-ink', 'amberInk'],
];

describe('<Icon> tone - FR-023, C5-14', () => {
  test.each(TONES)('tone %s tints with the theme colour %s', async (tone, token) => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockReturnValue('#123456' as never);
    await render(<Icon name="plus" tone={tone} />);
    expect(useThemeColor).toHaveBeenCalledWith(token);
    expect(glyphsIn().at(0)?.color).toBe('#123456');
  });

  test('is the ink unless asked', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    await render(<Icon name="plus" />);
    expect(useThemeColor).toHaveBeenCalledWith('foreground');
  });

  describe.each(PaletteNames)('in %s', (theme) => {
    test.each(TONES)('%s paints what %s paints, the palette key %s', (_t, token, key) => {
      expect(themeVariable(theme, `--${token}`)).toBe(Palettes[theme][key].toLowerCase());
    });

    // Tones the screens draw on paper or cream: a graphic needs 3:1 (FR-069). The three
    // left out sit on their own grounds: onInk on ink, onPhoto on a scrim, accentInk on coral;
    // `amber` is the bright amber of the passport card's lap line, drawn on its navy only.
    const ON_PAPER = TONES.filter(
      ([tone]) =>
        !['onInk', 'onPhoto', 'accentInk', 'onAccent', 'dangerInk', 'amber'].includes(
          tone,
        ),
    );

    test.each(ON_PAPER)('%s reads on paper and on cream', (_t, token) => {
      const colour = themeVariable(theme, `--${token}`);
      expect(contrastRatio(colour, Palettes[theme].surface)).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(colour, Palettes[theme].surfaceSecondary),
      ).toBeGreaterThanOrEqual(3);
    });
  });
});

describe.each(['light', 'light-contrast'] as const)(
  'no tone is the coral fill, which is under 3:1 on paper in %s',
  (theme) => {
    test('so no ink resolves to it', () => {
      const fill = Palettes[theme].accent.toLowerCase();
      expect(contrastRatio(fill, Palettes[theme].surface)).toBeLessThan(3);
      const drawn = TONES.map(([, token]) => themeVariable(theme, `--${token}`));
      expect(drawn).not.toContain(fill);
    });
  },
);

describe('<Icon> accessibility - FR-030, contract C5-14', () => {
  test('is decorative by default: hidden from assistive technology', async () => {
    await render(<Icon name="chevron-left" testID="icon" />);
    const node = byId('icon');
    expect(node.props.accessible).toBe(false);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(node.props.accessibilityLabel).toBeUndefined();
    expect(screen.queryByRole('image')).toBeNull();
  });

  test('is an image with a name when it carries a label', async () => {
    await render(<Icon name="chevron-left" testID="icon" label="Planning" />);
    const node = byId('icon');
    expect(node.props.accessible).toBe(true);
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe('Planning');
    expect(node.props.accessibilityElementsHidden).toBeUndefined();
    expect(node.props.importantForAccessibility).toBeUndefined();
    expect(screen.getByLabelText('Planning')).toBeTruthy();
  });

  test('a blank label is no label: the icon stays decorative', async () => {
    await render(<Icon name="chevron-left" testID="icon" label="   " />);
    expect(byId('icon').props.accessible).toBe(false);
  });

  test('forwards testID to the node a test finds it by, in both modes', async () => {
    await render(
      <>
        <Icon name="plus" testID="decorative" />
        <Icon name="plus" testID="meaningful" label="Add" />
      </>,
    );
    expect(byId('decorative')).toBeTruthy();
    expect(byId('meaningful')).toBeTruthy();
  });
});
