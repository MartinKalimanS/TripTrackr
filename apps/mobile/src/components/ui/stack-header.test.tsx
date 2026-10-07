/**
 * T427 - contract C4-9 (headers), research D4-06, FR-007, FR-023.
 *
 * The header options a native stack takes, per platform: the pure builder is asserted
 * on its output, and the hook on the colours and the display face it reads (the Jest
 * stand-ins answer a placeholder for every theme colour and every variable the app's
 * stylesheets declare, so the hook test asks what it was given, not a pixel).
 */
import { renderHook } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Platform } from 'react-native';

import {
  fontFamilyOf,
  stackHeaderOptions,
  useStackHeaderOptions,
  type StackHeaderTheme,
} from './stack-header';

const THEME: StackHeaderTheme = {
  canvas: 'canvas-colour',
  foreground: 'foreground-colour',
  accent: 'accent-colour',
  titleFont: 'Display-SemiBold',
  largeTitleFont: 'Display-Bold',
};

const flat = (style: unknown) => (style ?? {}) as Record<string, unknown>;

afterEach(() => jest.restoreAllMocks());

describe('stackHeaderOptions - iOS (FR-007)', () => {
  const options = stackHeaderOptions('Trips', THEME, 'ios');

  test('asks for a large title that collapses, with no shadow under either bar', () => {
    expect(options.title).toBe('Trips');
    // `headerLargeTitle` is deprecated in the installed router; the option is `...Enabled`.
    expect(options.headerLargeTitleEnabled).toBe(true);
    expect(options).not.toHaveProperty('headerLargeTitle');
    expect(options.headerLargeTitleShadowVisible).toBe(false);
    expect(options.headerShadowVisible).toBe(false);
  });

  test('tints the controls with the accent and the titles with the foreground', () => {
    expect(options.headerTintColor).toBe('accent-colour');
    expect(flat(options.headerTitleStyle).color).toBe('foreground-colour');
    expect(flat(options.headerLargeTitleStyle).color).toBe('foreground-colour');
  });

  test('sets the display face, each title in its own weight of it', () => {
    expect(flat(options.headerTitleStyle)).toMatchObject({
      fontFamily: 'Display-SemiBold',
      fontWeight: '600',
    });
    expect(flat(options.headerLargeTitleStyle)).toMatchObject({
      fontFamily: 'Display-Bold',
      fontWeight: '700',
    });
  });

  test('paints the canvas behind the content, and leaves the large-title header unpainted', () => {
    expect(flat(options.contentStyle).backgroundColor).toBe('canvas-colour');
    // A background on a large-title header hides the title on iOS 26 (the router's own
    // note in `useHeaderConfigProps`): the header stays transparent over the canvas.
    expect(options.headerStyle).toBeUndefined();
  });
});

describe('stackHeaderOptions - Android (FR-007)', () => {
  const options = stackHeaderOptions('Trips', THEME, 'android');

  test('is a standard header with the same title and no large title', () => {
    expect(options.title).toBe('Trips');
    expect(options.headerLargeTitleEnabled).toBeFalsy();
    expect(options.headerShadowVisible).toBe(false);
    expect(options.headerTintColor).toBe('accent-colour');
  });

  test('paints the header and the content with the canvas', () => {
    expect(flat(options.headerStyle).backgroundColor).toBe('canvas-colour');
    expect(flat(options.contentStyle).backgroundColor).toBe('canvas-colour');
  });

  test('titles are in the foreground ink and the display face', () => {
    expect(flat(options.headerTitleStyle)).toMatchObject({
      color: 'foreground-colour',
      fontFamily: 'Display-SemiBold',
    });
  });
});

describe('stackHeaderOptions - without the display face', () => {
  test('leaves the family and the weight to the platform', () => {
    const options = stackHeaderOptions(
      'Trips',
      { canvas: 'c', foreground: 'f', accent: 'a' },
      'ios',
    );
    expect(flat(options.headerTitleStyle)).toEqual({ color: 'f' });
    expect(flat(options.headerLargeTitleStyle)).toEqual({ color: 'f' });
  });
});

describe('fontFamilyOf', () => {
  test.each([
    ["'BricolageGrotesque-Bold'", 'BricolageGrotesque-Bold'],
    ['"BricolageGrotesque_700Bold"', 'BricolageGrotesque_700Bold'],
    ['BricolageGrotesque-SemiBold', 'BricolageGrotesque-SemiBold'],
    ['  Plain  ', 'Plain'],
  ])('reads %s as %s (the stylesheet writes the name in quotes)', (raw, family) => {
    expect(fontFamilyOf(raw)).toBe(family);
  });

  test.each([undefined, null, 12, '', "''", '   '])('reads %p as no family', (raw) => {
    expect(fontFamilyOf(raw)).toBeUndefined();
  });
});

describe('useStackHeaderOptions', () => {
  const Uniwind = jest.requireMock('uniwind') as {
    useCSSVariable: (name: string | string[]) => unknown;
  };

  test('reads the canvas, foreground and accent from the theme', async () => {
    const useThemeColor = jest.spyOn(HeroUI, 'useThemeColor');
    useThemeColor.mockReturnValue([
      'canvas-now',
      'foreground-now',
      'accent-now',
    ] as never);
    const { result } = await renderHook(() => useStackHeaderOptions('Trips'));

    expect(useThemeColor).toHaveBeenCalledWith(['background', 'foreground', 'accent']);
    expect(flat(result.current.contentStyle).backgroundColor).toBe('canvas-now');
    expect(result.current.headerTintColor).toBe('accent-now');
  });

  test('reads both display-face variables and strips the quotes the stylesheet writes', async () => {
    const read = jest.spyOn(Uniwind, 'useCSSVariable');
    read.mockImplementation((name) =>
      name === '--font-display'
        ? "'Face-SemiBold'"
        : name === '--font-display-bold'
          ? "'Face-Bold'"
          : undefined,
    );
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const { result } = await renderHook(() => useStackHeaderOptions('Trips'));
    os.restore();

    expect(flat(result.current.headerTitleStyle).fontFamily).toBe('Face-SemiBold');
    expect(flat(result.current.headerLargeTitleStyle).fontFamily).toBe('Face-Bold');
  });

  test('omits the family when no stylesheet declares the variable', async () => {
    jest.spyOn(Uniwind, 'useCSSVariable').mockReturnValue(undefined);
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const { result } = await renderHook(() => useStackHeaderOptions('Trips'));
    os.restore();

    expect(flat(result.current.headerTitleStyle)).not.toHaveProperty('fontFamily');
    expect(flat(result.current.headerLargeTitleStyle)).not.toHaveProperty('fontFamily');
  });

  test('follows the platform it runs on', async () => {
    const ios = jest.replaceProperty(Platform, 'OS', 'ios');
    const onIos = (await renderHook(() => useStackHeaderOptions('Trips'))).result.current;
    ios.restore();
    const android = jest.replaceProperty(Platform, 'OS', 'android');
    const onAndroid = (await renderHook(() => useStackHeaderOptions('Trips'))).result
      .current;
    android.restore();

    expect(onIos.headerLargeTitleEnabled).toBe(true);
    expect(onAndroid.headerLargeTitleEnabled).toBeFalsy();
  });

  test('is the same object while nothing it reads changes', async () => {
    const { result, rerender } = await renderHook(() => useStackHeaderOptions('Trips'));
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });
});
