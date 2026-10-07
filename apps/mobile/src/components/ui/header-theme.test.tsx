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
