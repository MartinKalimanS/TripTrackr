/**
 * Contract C4-9 (native stack headers carry themed options), FR-008, research D4-06.
 *
 * Navigation options are plain values the native header reads, so they cannot take a
 * class: the hook resolves the kit's `background` and `accent` for the active theme and
 * hands back the options a screen spreads into its own. Under Jest the kit's
 * `useThemeColor` is a stand-in; a spy answers per token so the test can tell which
 * token fed which option.
 */
import { renderHook } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';

import { Colors } from '@/constants/theme';
import { PaletteNames, Palettes } from '@/theme/palette';

import { backgroundVariable } from '../../../test/helpers/theme-css';

import { useHeaderTheme } from './header-theme';

const COLOURS: Record<string, string> = {
  background: 'themed-canvas',
  accent: 'themed-ink',
};

beforeEach(() => {
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string) => COLOURS[token]) as never);
});
afterEach(() => jest.restoreAllMocks());

describe('useHeaderTheme - C4-9', () => {
  test('paints the header and the content with the background token', async () => {
    const { result } = await renderHook(() => useHeaderTheme());
    expect(result.current.headerStyle).toEqual({ backgroundColor: 'themed-canvas' });
    expect(result.current.contentStyle).toEqual({ backgroundColor: 'themed-canvas' });
  });

  test('tints the header with the accent token', async () => {
    const { result } = await renderHook(() => useHeaderTheme());
    expect(result.current.headerTintColor).toBe('themed-ink');
  });

  test('draws no hairline or shadow under the header (boundaries only where needed, FR-006)', async () => {
    const { result } = await renderHook(() => useHeaderTheme());
    expect(result.current.headerShadowVisible).toBe(false);
  });

  test('reads the background and accent tokens and no other', async () => {
    await renderHook(() => useHeaderTheme());
    const tokens = (HeroUI.useThemeColor as jest.Mock).mock.calls.map(([token]) => token);
    expect(tokens).toEqual(['background', 'accent']);
  });

  test('keeps the same object while the colours do not change', async () => {
    const { result, rerender } = await renderHook(() => useHeaderTheme());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  test('follows the theme: new colours give new options', async () => {
    const { result, rerender } = await renderHook(() => useHeaderTheme());
    COLOURS.background = 'dark-canvas';
    await rerender({});
    expect(result.current.headerStyle).toEqual({ backgroundColor: 'dark-canvas' });
    COLOURS.background = 'themed-canvas';
  });
});

// Two sources paint the canvas around a trip screen. The root stack and the navigation
// theme paint `useAppearance().tokens.canvas`; the header and the scene of the trip stack
// paint the kit's `--background` through this hook. They name ONE colour in each of the
// four themes, increased contrast included, so there is no seam between the bar, the scene
// and what shows behind them; this fails the moment the palette, the tokens or the
// generated stylesheet drift apart. (`test/theme/theme-css-sync.test.ts` pins the
// stylesheet to the palette; this pins the tokens to the stylesheet.)
describe('useHeaderTheme - one canvas for the bar and the root stack (FR-023)', () => {
  test.each(PaletteNames)(
    'the %s stylesheet `--background` is the `canvas` the root stack paints',
    (theme) => {
      expect(backgroundVariable(theme).toLowerCase()).toBe(
        Colors[theme].canvas.toLowerCase(),
      );
      expect(backgroundVariable(theme).toLowerCase()).toBe(
        Palettes[theme].canvas.toLowerCase(),
      );
    },
  );

  test('reads that variable by its kit name, `background`, and not through a legacy token', async () => {
    await renderHook(() => useHeaderTheme());
    expect(
      (HeroUI.useThemeColor as jest.Mock).mock.calls.map(([token]) => token),
    ).toContain('background');
  });
});
