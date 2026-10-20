/**
 * T427, T528 - contract C4-9 and C5-15 (headers), research D4-06 and D5-12, FR-007, FR-023,
 * FR-025 (feature 004, restyled for Sunrise Passport).
 *
 * The header options a native stack takes, per platform: the pure builder is asserted
 * on its output, and the hook on the colours and the display face it reads (the Jest
 * stand-ins answer a placeholder for every theme colour and every variable the app's
 * stylesheets declare, so the hook test asks what it was given, not a pixel).
 */
import { renderHook } from '@testing-library/react-native';
import * as HeroUI from 'heroui-native';
import { Platform } from 'react-native';

import { TypeRoles } from '@/theme';

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

  test('asks for a large title (the option, not the collapse: that is a device check, T408), with no shadow under either bar', () => {
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

  test('sizes the large title as the `display` role (40) and the collapsed title as `callout` (17)', () => {
    expect(TypeRoles.display.size).toBe(40);
    expect(TypeRoles.callout.size).toBe(17);
    expect(flat(options.headerLargeTitleStyle).fontSize).toBe(TypeRoles.display.size);
    expect(flat(options.headerTitleStyle).fontSize).toBe(TypeRoles.callout.size);
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

  test('the title is the `title` role: the bold display face at 28, in the foreground ink, from the left', () => {
    expect(TypeRoles.title.size).toBe(28);
    expect(flat(options.headerTitleStyle)).toEqual({
      color: 'foreground-colour',
      fontFamily: 'Display-Bold',
      fontWeight: '700',
      fontSize: TypeRoles.title.size,
    });
    expect(options.headerTitleAlign).toBe('left');
  });

  test('has no large-title style: a standard header is the platform way on Android', () => {
    expect(options).not.toHaveProperty('headerLargeTitleStyle');
    expect(options.headerLargeTitleShadowVisible).toBe(false);
  });
});

describe('stackHeaderOptions - without the display face', () => {
  test('leaves the family and the weight to the platform', () => {
    const options = stackHeaderOptions(
      'Trips',
      { canvas: 'c', foreground: 'f', accent: 'a' },
      'ios',
    );
    // The size is a token, not a face: it stays.
    expect(flat(options.headerTitleStyle)).toEqual({
      color: 'f',
      fontSize: TypeRoles.callout.size,
    });
    expect(flat(options.headerLargeTitleStyle)).toEqual({
      color: 'f',
      fontSize: TypeRoles.display.size,
    });
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

  test('on Android the one title is the bold face, not the semibold', async () => {
    jest
      .spyOn(Uniwind, 'useCSSVariable')
      .mockImplementation((name) =>
        name === '--font-display'
          ? "'Face-SemiBold'"
          : name === '--font-display-bold'
            ? "'Face-Bold'"
            : undefined,
      );
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    const { result } = await renderHook(() => useStackHeaderOptions('Trips'));
    os.restore();

    expect(flat(result.current.headerTitleStyle)).toMatchObject({
      fontFamily: 'Face-Bold',
      fontWeight: '700',
      fontSize: 28,
    });
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
