/**
 * T521 - contract C5-8 (the two lifts) and C5-18 (`Card`). A lift is the ONLY shadow an
 * adapter draws: `boxShadow` from the `Lift` token of the device scheme, or, on an Android
 * older than 9 (API 28), where an outset `boxShadow` is not drawn, the token's elevation.
 *
 * `lift-style.ts` (T519) is the one place that maps a lift to a style and reads the
 * platform; `useLiftStyle` adds the device scheme and the "no lift" case for the surfaces of
 * T521 and T522 (`Card`, the frames, the sheet skeleton, the toast).
 */
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { LiftElevation, liftOf } from '@/theme';

import { useLiftStyle } from './lift';
import { liftStyle } from './lift-style';

jest.mock('@/hooks/use-color-scheme');

const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock<'light' | 'dark' | null | undefined, []>;
};

/** Pretends to be `os` at `version` for one test, whatever the preset says. */
function onPlatform(os: 'ios' | 'android', version: string | number) {
  jest.replaceProperty(Platform, 'OS', os);
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

const originalVersion = Object.getOwnPropertyDescriptor(Platform, 'Version');
afterEach(() => {
  jest.restoreAllMocks();
  if (originalVersion) Object.defineProperty(Platform, 'Version', originalVersion);
});

describe('liftStyle - the pure mapping of lift-style.ts', () => {
  test.each([
    ['light', 'lift1'],
    ['light', 'lift2'],
    ['dark', 'lift1'],
    ['dark', 'lift2'],
  ] as const)('%s %s is that theme\u2019s boxShadow, copied', (scheme, name) => {
    onPlatform('ios', '18.0');
    const style = liftStyle(scheme, name);
    expect(style).toEqual({ boxShadow: liftOf(scheme, name) });
    expect(style.boxShadow).not.toBe(liftOf(scheme, name));
  });

  test('a modern Android takes the boxShadow too', () => {
    onPlatform('android', 34);
    expect(liftStyle('light', 'lift1')).toEqual({ boxShadow: liftOf('light', 'lift1') });
    onPlatform('android', 28);
    expect(liftStyle('light', 'lift1')).toHaveProperty('boxShadow');
  });

  test('an Android before 9 falls back to the elevation of the token', () => {
    onPlatform('android', 27);
    expect(liftStyle('light', 'lift1')).toEqual({ elevation: LiftElevation.lift1 });
    expect(liftStyle('dark', 'lift2')).toEqual({ elevation: LiftElevation.lift2 });
  });
});

describe('useLiftStyle', () => {
  test('follows the device scheme', async () => {
    onPlatform('ios', '18.0');
    useColorScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useLiftStyle('lift2'));
    expect(result.current).toEqual({ boxShadow: liftOf('dark', 'lift2') });
  });

  test('an unknown scheme is light', async () => {
    onPlatform('ios', '18.0');
    useColorScheme.mockReturnValue(null);
    const { result } = await renderHook(() => useLiftStyle('lift1'));
    expect(result.current).toEqual({ boxShadow: liftOf('light', 'lift1') });
  });

  test('takes the elevation fallback of an old Android', async () => {
    onPlatform('android', 26);
    useColorScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useLiftStyle('lift1'));
    expect(result.current).toEqual({ elevation: LiftElevation.lift1 });
  });

  test('no lift is no style, and the same object between renders', async () => {
    onPlatform('ios', '18.0');
    useColorScheme.mockReturnValue('light');
    const none = await renderHook(() => useLiftStyle(null));
    expect(none.result.current).toBeUndefined();

    const lifted = await renderHook(() => useLiftStyle('lift1'));
    const first = lifted.result.current;
    await lifted.rerender({});
    expect(lifted.result.current).toBe(first);
  });
});
