/**
 * T440 / T441 - the title of a pushed sub-screen's native header (feature 004; contract
 * C4-9; FR-003, FR-004, FR-007; research D4-07).
 *
 * `headerTintColor` is the accent and a native title with no colour of its own takes the
 * tint (`useHeaderConfigProps`: `titleColor` falls back to `headerTintColor`), which
 * would paint every title in the ONE accent FR-003 reserves for the primary action, the
 * selected item, links and the active trip. This hook is the title's own ink (the
 * foreground) and its face (the display face, SemiBold), the values the top-level list
 * headers already use through `stackHeaderOptions`, and it is pinned to them here.
 */
import { renderHook } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Platform } from 'react-native';

import { useHeaderTitleStyle } from './header-title-style';
import { stackHeaderOptions } from './stack-header';

const Uniwind = jest.requireMock('uniwind') as {
  useCSSVariable: (name: string | string[]) => unknown;
};

const flat = (style: unknown) => (style ?? {}) as Record<string, unknown>;

beforeEach(() => {
  jest.spyOn(HeroUI, 'useThemeColor').mockReturnValue('foreground-now' as never);
  jest
    .spyOn(Uniwind, 'useCSSVariable')
    .mockImplementation((name) =>
      name === '--font-display' ? "'Face-SemiBold'" : undefined,
    );
});
afterEach(() => jest.restoreAllMocks());

describe('useHeaderTitleStyle - the ink and the face of a sub-screen title', () => {
  test('is the foreground ink in the display face, in the weight of that face', async () => {
    const { result } = await renderHook(() => useHeaderTitleStyle());

    expect(flat(result.current.headerTitleStyle)).toEqual({
      color: 'foreground-now',
      fontFamily: 'Face-SemiBold',
      fontWeight: '600',
    });
  });

  test('is NOT the accent: the tint of the header is not the ink of the title', async () => {
    const { result } = await renderHook(() => useHeaderTitleStyle());

    expect(HeroUI.useThemeColor).toHaveBeenCalledWith('foreground');
    expect(HeroUI.useThemeColor).not.toHaveBeenCalledWith('accent');
    expect(flat(result.current.headerTitleStyle).color).toBe('foreground-now');
  });

  test('is the very style the top-level list headers carry (the two cannot drift apart)', async () => {
    const { result } = await renderHook(() => useHeaderTitleStyle());
    const topLevel = stackHeaderOptions(
      'Trips',
      {
        canvas: 'c',
        foreground: 'foreground-now',
        accent: 'a',
        titleFont: 'Face-SemiBold',
      },
      'android',
    );

    expect(result.current.headerTitleStyle).toEqual(topLevel.headerTitleStyle);
  });

  test('sets the title style and nothing else: no large title, no colours of the bar', async () => {
    const { result } = await renderHook(() => useHeaderTitleStyle());

    expect(Object.keys(result.current)).toEqual(['headerTitleStyle']);
  });

  test('leaves the face to the platform when the stylesheet declares no display face', async () => {
    jest.spyOn(Uniwind, 'useCSSVariable').mockReturnValue(undefined);
    const { result } = await renderHook(() => useHeaderTitleStyle());

    expect(flat(result.current.headerTitleStyle)).toEqual({ color: 'foreground-now' });
  });

  test('is the same on both platforms: a sub-screen title is never a large title', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    const onIos = (await renderHook(() => useHeaderTitleStyle())).result.current;
    ios.restore();
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    const onAndroid = (await renderHook(() => useHeaderTitleStyle())).result.current;
    android.restore();

    expect(onIos).toEqual(onAndroid);
  });

  test('is the same object while nothing it reads changes, and follows the theme', async () => {
    const { result, rerender } = await renderHook(() => useHeaderTitleStyle());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);

    jest.spyOn(HeroUI, 'useThemeColor').mockReturnValue('foreground-dark' as never);
    await rerender({});
    expect(flat(result.current.headerTitleStyle).color).toBe('foreground-dark');
  });
});
