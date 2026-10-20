/**
 * T519 - contract C5-15, "Icon buttons": 44 dp circles in five looks, `default` (paper with
 * `lift1`), `tonal`, `ghost`, `glass` (on photographs: a `scrimButton` disc with
 * `scrimButtonLine`, an `onPhoto` icon) and `onSky` (92 percent paper over the globe).
 * FR-006, FR-007, FR-026, FR-063, FR-069, FR-071; design-tokens C5-4 P6, P11, P13.
 *
 * Same method as `button.test.tsx`: Pressable keeps its pressed state to itself, so a press
 * is driven with `touchDown` and the style the host node carries is read back, with
 * `useThemeColor` answering from the stylesheet of the theme under test.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { MinTouchTarget } from '@/constants/theme';
import { useAppearance, type AppearanceContext } from '@/hooks/use-appearance';
import {
  FocusRing,
  PaletteNames,
  Palettes,
  contrastRatio,
  liftOf,
  withAlpha,
  type PaletteName,
} from '@/theme';

import { glyphsIn } from '../../../test/helpers/icons';
import { asCss, mockThemeColors } from '../../../test/helpers/theme-colors';
import { touchDown } from '../../../test/helpers/touch';
import {
  ICON_BUTTON_VARIANTS,
  IconButton,
  iconButtonLook,
  type IconButtonVariant,
} from './icon-button';

jest.mock('@/hooks/use-appearance');
const mockedAppearance = useAppearance as jest.MockedFunction<typeof useAppearance>;

function appearance(
  themeName: PaletteName,
  prefersLessMotion = false,
): AppearanceContext {
  return {
    theme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersMoreContrast: themeName.endsWith('contrast'),
    prefersLessMotion,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: {} as AppearanceContext['tokens'],
    ready: true,
  };
}

beforeEach(() => {
  mockedAppearance.mockReturnValue(appearance('light'));
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const hidden = { includeHiddenElements: true };
const node = () => screen.getByLabelText('Share');
const styleOf = () => StyleSheet.flatten(node().props.style) as Record<string, unknown>;

const renderButton = (props: Record<string, unknown> = {}) =>
  render(
    <IconButton icon="share" accessibilityLabel="Share" onPress={jest.fn()} {...props} />,
  );

describe('<IconButton> identity - contract C4-6 rule 4', () => {
  test('is a button named by its label alone, with a decorative icon', async () => {
    await renderButton({ testID: 'share' });
    expect(node().props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('share')).toBe(node());
    expect(screen.queryByText('Share')).toBeNull();
    const icon = screen.getByTestId('share-icon', hidden);
    expect(icon.props.accessible).toBe(false);
    expect(glyphsIn().map((glyph) => glyph.name)).toEqual(['share']);
  });

  test('refuses to render without an accessible name', async () => {
    await expect(
      render(
        // @ts-expect-error - the label is required by the type as well
        <IconButton icon="share" />,
      ),
    ).rejects.toThrow(/accessibilityLabel/);
    await expect(renderButton({ accessibilityLabel: ' ' })).rejects.toThrow(
      /accessibilityLabel/,
    );
  });

  test('is the default look unless told otherwise, and the five looks are named', async () => {
    expect([...ICON_BUTTON_VARIANTS]).toEqual([
      'default',
      'tonal',
      'ghost',
      'glass',
      'onSky',
    ]);
    mockThemeColors('light');
    await renderButton();
    expect(styleOf().backgroundColor).toBe(asCss(Palettes.light.surface));
  });

  test('passes the hint, testID and hitSlop through', async () => {
    await renderButton({ accessibilityHint: 'Opens the share sheet', hitSlop: 9 });
    expect(node().props.accessibilityHint).toBe('Opens the share sheet');
    expect(node().props.hitSlop).toBe(9);
  });
});

describe('iconButtonLook - the table', () => {
  const REST = { pressed: false, busy: false, disabled: false };
  const PRESSED = { ...REST, pressed: true };

  test.each([
    ['default', { fill: 'surface', edge: null, icon: 'ink', lift: true }],
    ['tonal', { fill: 'surfaceSecondary', edge: 'hairline', icon: 'ink', lift: false }],
    ['ghost', { fill: null, edge: null, icon: 'ink', lift: false }],
    [
      'glass',
      { fill: 'scrimButton', edge: 'scrimButtonLine', icon: 'onPhoto', lift: false },
    ],
    ['onSky', { fill: 'surface', edge: null, icon: 'ink', lift: true }],
  ] as const)('%s at rest: %j', (variant, expected) => {
    expect(iconButtonLook(variant, REST)).toMatchObject(expected);
  });

  test.each(['default', 'tonal', 'ghost', 'onSky'] as const)(
    '%s pressed: the pressed fill, with an ink icon and no ring',
    (variant) => {
      expect(iconButtonLook(variant, PRESSED)).toMatchObject({
        fill: 'pressed',
        icon: 'ink',
        ring: false,
      });
    },
  );

  test('glass pressed keeps its disc and the white icon and shows the ring instead (a fill over a photograph tints it)', () => {
    expect(iconButtonLook('glass', PRESSED)).toMatchObject({
      fill: 'scrimButton',
      icon: 'onPhoto',
      ring: true,
    });
  });

  test.each(ICON_BUTTON_VARIANTS)('%s: busy and disabled show no press', (variant) => {
    expect(iconButtonLook(variant, { ...REST, busy: true, pressed: true })).toEqual(
      iconButtonLook(variant, REST),
    );
    expect(iconButtonLook(variant, { ...REST, disabled: true, pressed: true })).toEqual(
      iconButtonLook(variant, REST),
    );
  });

  test.each(ICON_BUTTON_VARIANTS)(
    '%s: only ink is placed on a pressed fill, onPhoto only on the scrim disc',
    (variant) => {
      const { fill, icon } = iconButtonLook(variant, PRESSED);
      expect(icon === 'ink' ? 'pressed surfaceSecondary' : 'scrimButton').toContain(
        fill as string,
      );
    },
  );
});

describe.each(PaletteNames)('<IconButton> in %s - C5-15', (theme) => {
  const palette = Palettes[theme];

  beforeEach(() => {
    mockThemeColors(theme);
    mockedAppearance.mockReturnValue(appearance(theme));
  });

  test('default is paper with lift1 and an ink icon', async () => {
    await renderButton();
    expect(styleOf().backgroundColor).toBe(asCss(palette.surface));
    expect(styleOf().boxShadow).toEqual(liftOf(theme, 'lift1'));
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.ink));
  });

  test('tonal is cream with a hairline and no lift', async () => {
    await renderButton({ variant: 'tonal' });
    expect(styleOf()).toMatchObject({
      backgroundColor: asCss(palette.surfaceSecondary),
      borderColor: asCss(palette.hairline),
      borderWidth: 1,
    });
    expect(styleOf().boxShadow).toBeUndefined();
  });

  test('ghost has no fill', async () => {
    await renderButton({ variant: 'ghost' });
    expect(styleOf().backgroundColor).toBeUndefined();
    expect(styleOf().boxShadow).toBeUndefined();
  });

  test('glass is the scrim disc with its line and a white icon (P11)', async () => {
    await renderButton({ variant: 'glass' });
    expect(styleOf()).toMatchObject({
      backgroundColor: asCss(palette.scrimButton),
      borderColor: asCss(palette.scrimButtonLine),
    });
    expect(glyphsIn()[0]?.color).toBe(asCss(palette.onPhoto));
  });

  test('onSky is 92 percent paper with lift1', async () => {
    await renderButton({ variant: 'onSky' });
    expect(String(styleOf().backgroundColor).toLowerCase()).toBe(
      withAlpha(palette.surface, 0.92).toLowerCase(),
    );
    expect(styleOf().boxShadow).toEqual(liftOf(theme, 'lift1'));
  });

  test.each(['default', 'tonal', 'ghost', 'onSky'] as const)(
    '%s: a held press paints the pressed fill, and ink reads on it (P6)',
    async (variant) => {
      await renderButton({ variant });
      await touchDown(node());
      expect(styleOf().backgroundColor).toBe(asCss(palette.pressed));
      expect(glyphsIn()[0]?.color).toBe(asCss(palette.ink));
      const floor = theme.endsWith('contrast') ? 7 : 4.5;
      expect(contrastRatio(palette.ink, palette.pressed)).toBeGreaterThanOrEqual(floor);
    },
  );

  test('glass: a held press draws the focus ring and keeps the disc', async () => {
    await renderButton({ variant: 'glass' });
    await touchDown(node());
    expect(styleOf()).toMatchObject({
      backgroundColor: asCss(palette.scrimButton),
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
      outlineColor: asCss(palette.focus),
    });
  });
});

describe('<IconButton> size and target - FR-026', () => {
  test('is a 44 dp circle', async () => {
    await renderButton();
    expect(styleOf()).toMatchObject({ width: 44, height: 44 });
    expect(Number(styleOf().borderRadius)).toBeGreaterThanOrEqual(22);
    expect(styleOf().alignItems).toBe('center');
  });

  test('reaches the platform floor with slop around the visible disc, none on iOS', async () => {
    await renderButton();
    const slop = (MinTouchTarget - 44) / 2;
    expect(node().props.hitSlop).toEqual({
      top: slop,
      bottom: slop,
      left: slop,
      right: slop,
    });
    expect(44 + 2 * slop).toBeGreaterThanOrEqual(MinTouchTarget);
  });

  test('does not grow with the text size: its icon does not scale', async () => {
    await renderButton();
    expect(styleOf().minHeight).toBeUndefined();
    expect(glyphsIn()[0]?.size).toBe(24);
  });
});

describe('<IconButton> press scale - C5-9', () => {
  test('is .97 while held, and none under reduced motion', async () => {
    await renderButton();
    expect(styleOf().transform).toBeUndefined();
    await touchDown(node());
    expect(styleOf().transform).toEqual([{ scale: 0.97 }]);
  });

  test('keeps the fill and drops the scale under reduced motion', async () => {
    mockedAppearance.mockReturnValue(appearance('light', true));
    mockThemeColors('light');
    await renderButton();
    await touchDown(node());
    expect(styleOf().transform).toBeUndefined();
    expect(styleOf().backgroundColor).toBe(asCss(Palettes.light.pressed));
  });
});

describe('<IconButton> busy and disabled - data-model section 6', () => {
  test('presses when it is available', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress });
    await fireEvent.press(node());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('busy is announced busy and unavailable, ignores presses and shows a spinner for the icon', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, busy: true, testID: 'share' });
    await fireEvent.press(node());
    expect(onPress).not.toHaveBeenCalled();
    expect(node().props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(
      screen.getByTestId('share-spinner', hidden).props.accessibilityElementsHidden,
    ).toBe(true);
    expect(screen.queryByTestId('share-icon', hidden)).toBeNull();
  });

  test('disabled ignores presses, is announced unavailable and is dimmed', async () => {
    const onPress = jest.fn();
    await renderButton({ onPress, disabled: true });
    await fireEvent.press(node());
    expect(onPress).not.toHaveBeenCalled();
    expect(node().props.accessibilityState).toMatchObject({
      busy: false,
      disabled: true,
    });
    expect(String(node().props.className)).toContain('opacity-disabled');
  });

  test('busy is not dimmed', async () => {
    await renderButton({ busy: true });
    expect(String(node().props.className ?? '')).not.toContain('opacity-disabled');
  });

  test('busy and disabled together is a development error', async () => {
    await expect(renderButton({ busy: true, disabled: true })).rejects.toThrow(
      /mutually exclusive/,
    );
  });
});

describe('<IconButton> focus ring - FR-071', () => {
  test('draws the 2.5 dp ring 2 dp outside while focused, in the focus colour', async () => {
    mockThemeColors('dark');
    mockedAppearance.mockReturnValue(appearance('dark'));
    await renderButton();
    expect(styleOf().outlineWidth).toBeUndefined();
    await fireEvent(node(), 'focus');
    expect(styleOf()).toMatchObject({
      outlineWidth: 2.5,
      outlineOffset: 2,
      outlineColor: asCss(Palettes.dark.focus),
    });
    await fireEvent(node(), 'blur');
    expect(styleOf().outlineWidth).toBeUndefined();
  });

  test('keeps the caller focus and blur handlers', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await renderButton({ onFocus, onBlur });
    await fireEvent(node(), 'focus');
    await fireEvent(node(), 'blur');
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe('every look is a variant of the type', () => {
  test('the type has exactly the five', () => {
    const all: IconButtonVariant[] = ['default', 'tonal', 'ghost', 'glass', 'onSky'];
    expect(all).toEqual([...ICON_BUTTON_VARIANTS]);
  });

  test('the surface colour that onSky blends is a plain #RRGGBB in every theme', () => {
    for (const theme of PaletteNames)
      expect(Palettes[theme].surface).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
