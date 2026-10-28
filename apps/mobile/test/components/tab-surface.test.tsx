/**
 * T526 - the pill's surface and the one function that chooses it (feature 005, research
 * D5-05, contract C5-21; FR-022, FR-072, FR-073).
 *
 * `tabSurface()` is pure and is run over EVERY combination of its four inputs (platform,
 * whether the glass API is there, reduced transparency, increased contrast), so a rule cannot
 * be broken for one combination unseen. The component is then shown to draw what was chosen:
 * `GlassView` on iOS 26 (the stand-in answers `false` until a test opts in), `BlurView` with a
 * `surface` tint on the earlier iPhones, an opaque `surface` with a hairline everywhere the
 * traveller or the platform rules transparency out. The one trap of the real module (an
 * `opacity` of 0 on a `GlassView` or an ancestor makes the glass vanish, expo/expo#41024) is
 * pinned as a property of the styles: nothing here carries an opacity.
 *
 * Jest has no glass: that the real `UIGlassEffectView` renders and adapts is device check V4
 * (tasks T510).
 */
import { render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet, Text } from 'react-native';

import { tabSurface, TabSurface } from '@/components/navigation/tab-surface';
import { Radii, withAlpha, Palettes, type PaletteName } from '@/theme';

import { appearanceOf } from '../helpers/appearance';
import { mockThemeColors } from '../helpers/theme-colors';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const glassModule = jest.requireMock('expo-glass-effect') as {
  isLiquidGlassAvailable: jest.Mock;
  isGlassEffectAPIAvailable: jest.Mock;
};

function setup(
  theme: PaletteName = 'light',
  options: { os?: 'ios' | 'android'; glass?: boolean; lessTransparency?: boolean } = {},
) {
  const { os = 'ios', glass = false, lessTransparency = false } = options;
  jest.replaceProperty(Platform, 'OS', os);
  // `boxShadow` needs Android 9 (API 28); below it the lift is an `elevation`.
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  glassModule.isLiquidGlassAvailable.mockReturnValue(glass);
  glassModule.isGlassEffectAPIAvailable.mockReturnValue(glass);
  useAppearance.mockReturnValue(
    appearanceOf(theme, { prefersLessTransparency: lessTransparency }),
  );
  mockThemeColors(theme);
}

afterEach(() => {
  jest.restoreAllMocks();
  glassModule.isLiquidGlassAvailable.mockReturnValue(false);
  glassModule.isGlassEffectAPIAvailable.mockReturnValue(false);
});

const flat = (testID: string) =>
  (StyleSheet.flatten(screen.getByTestId(testID).props.style) ?? {}) as Record<
    string,
    unknown
  >;

describe('tabSurface() - which surface the pill gets', () => {
  const OS = ['ios', 'android'] as const;
  const FLAGS = [false, true] as const;
  const combinations = OS.flatMap((os) =>
    FLAGS.flatMap((liquidGlass) =>
      FLAGS.flatMap((reduceTransparency) =>
        FLAGS.map((increasedContrast) => ({
          os,
          liquidGlass,
          reduceTransparency,
          increasedContrast,
        })),
      ),
    ),
  );

  /** The rule of D5-05, written out independently of the implementation. */
  function expected(c: (typeof combinations)[number]) {
    if (c.os !== 'ios') return 'solid';
    if (c.reduceTransparency || c.increasedContrast) return 'solid';
    return c.liquidGlass ? 'glass' : 'blur';
  }

  test('covers all 16 combinations of the four inputs', () => {
    expect(combinations).toHaveLength(16);
  });

  test.each(combinations)('%j', (combination) => {
    expect(tabSurface(combination)).toBe(expected(combination));
  });

  test('is solid on Android whatever the glass module says (it is a plain View there)', () => {
    expect(
      tabSurface({
        os: 'android',
        liquidGlass: true,
        reduceTransparency: false,
        increasedContrast: false,
      }),
    ).toBe('solid');
  });

  test('is opaque whenever transparency is reduced or contrast is increased', () => {
    for (const combination of combinations) {
      if (combination.reduceTransparency || combination.increasedContrast) {
        expect(tabSurface(combination)).toBe('solid');
      }
    }
  });
});

describe('<TabSurface> - glass (iOS 26)', () => {
  test('is a GlassView in the regular style, in the scheme of the app, with the children inside', async () => {
    setup('light', { glass: true });
    await render(
      <TabSurface>
        <Text>inside</Text>
      </TabSurface>,
    );

    const glass = screen.getByTestId('tab-surface-glass');
    expect(glass.props.glassEffectStyle).toBe('regular');
    expect(glass.props.colorScheme).toBe('light');
    expect(screen.getByText('inside')).toBeTruthy();
    expect(screen.queryByTestId('tab-surface-blur')).toBeNull();
    expect(screen.queryByTestId('tab-surface-solid')).toBeNull();
  });

  test('follows the app theme, not only the system one, for its colour scheme', async () => {
    setup('dark', { glass: true });
    await render(<TabSurface />);
    expect(screen.getByTestId('tab-surface-glass').props.colorScheme).toBe('dark');
  });

  test('needs BOTH the liquid glass design and the runtime API (some iOS 26 betas lack it)', async () => {
    setup('light', { glass: true });
    glassModule.isGlassEffectAPIAvailable.mockReturnValue(false);
    await render(<TabSurface />);
    expect(screen.queryByTestId('tab-surface-glass')).toBeNull();
    expect(screen.getByTestId('tab-surface-blur')).toBeTruthy();
  });

  test('is a capsule with the ring and lift, and no opacity: opacity 0 would make the glass vanish', async () => {
    setup('light', { glass: true });
    await render(<TabSurface />);
    const style = flat('tab-surface-glass');
    expect(style.borderRadius).toBe(Radii.full);
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.boxShadow).toBeDefined();
    expect(style.opacity).toBeUndefined();
  });
});

describe('<TabSurface> - blur (an earlier iPhone)', () => {
  // The prototype's dark pill is rgba(24, 46, 74, .84): the cream (`surfaceSecondary`), not the
  // paper, so it reads lighter than the ground in `home-dark.png`.
  test.each([
    ['light', 'surface'],
    ['dark', 'surfaceSecondary'],
  ] as const)(
    'is a BlurView under an 84 percent tint in %s (the %s)',
    async (theme, key) => {
      setup(theme);
      await render(
        <TabSurface>
          <Text>inside</Text>
        </TabSurface>,
      );

      const blur = screen.getByTestId('tab-surface-blur');
      expect(blur.props.testID).toBe('tab-surface-blur');
      expect(JSON.stringify(screen.toJSON())).toContain('ExpoBlur');
      const tint = flat('tab-surface-tint');
      expect(tint.backgroundColor).toBe(withAlpha(Palettes[theme][key], 0.84));
      expect(screen.getByText('inside')).toBeTruthy();
    },
  );

  test('is clipped to a capsule, has the hairline and the second lift, and no opacity', async () => {
    setup('light');
    await render(<TabSurface />);
    const style = flat('tab-surface-blur');
    expect(style.borderRadius).toBe(Radii.full);
    expect(style.overflow).toBe('hidden');
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderColor).toBe(Palettes.light.hairline.toLowerCase());
    expect(style.boxShadow).toBeDefined();
    expect(style.opacity).toBeUndefined();
  });

  test('the tint is drawn in front of the blur and never takes a touch', async () => {
    setup('light');
    await render(<TabSurface />);
    const tint = screen.getByTestId('tab-surface-tint');
    expect(tint.props.pointerEvents).toBe('none');
    expect(flat('tab-surface-tint').position).toBe('absolute');
  });
});

describe('<TabSurface> - solid', () => {
  test('is an opaque `surface` capsule with the hairline and the lift on Android', async () => {
    setup('light', { os: 'android' });
    await render(<TabSurface />);

    const style = flat('tab-surface-solid');
    expect(style.backgroundColor).toBe(Palettes.light.surface.toLowerCase());
    expect(style.borderRadius).toBe(Radii.full);
    expect(style.borderWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderColor).toBe(Palettes.light.hairline.toLowerCase());
    expect(style.boxShadow).toBeDefined();
    expect(JSON.stringify(screen.toJSON())).not.toContain('ExpoBlur');
  });

  test('is solid on iOS when transparency is reduced, even where the glass is available', async () => {
    setup('light', { glass: true, lessTransparency: true });
    await render(<TabSurface />);
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    expect(screen.queryByTestId('tab-surface-glass')).toBeNull();
  });

  test.each(['light-contrast', 'dark-contrast'] as const)(
    'is solid in %s, with the surface and the explicit hairline of that theme',
    async (theme) => {
      setup(theme, { glass: true });
      await render(<TabSurface />);
      const style = flat('tab-surface-solid');
      expect(style.backgroundColor).toBe(Palettes[theme].surface.toLowerCase());
      expect(style.borderColor).toBe(Palettes[theme].hairline.toLowerCase());
    },
  );

  test('passes the caller style through, last', async () => {
    setup('light', { os: 'android' });
    await render(<TabSurface style={{ minHeight: 64, gap: 4 }} />);
    expect(flat('tab-surface-solid')).toMatchObject({ minHeight: 64, gap: 4 });
  });
});
