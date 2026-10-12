/**
 * T521 - contract C5-8 (the two lifts) and C5-18 (`Card`). A lift is the ONLY shadow an
 * adapter draws: `boxShadow` from the `Lift` token of the device scheme, or, on an Android
 * older than 9 (API 28), where an outset `boxShadow` is not drawn, the token's elevation.
 */
import { renderHook } from '@testing-library/react-native';

import { LiftElevation, liftOf } from '@/theme';

import { liftStyle, useLiftStyle } from './lift';

jest.mock('@/hooks/use-color-scheme');

const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock<'light' | 'dark' | null | undefined, []>;
};

describe('liftStyle - the pure mapping', () => {
  test.each([
    ['light', 'lift1'],
    ['light', 'lift2'],
    ['dark', 'lift1'],
    ['dark', 'lift2'],
  ] as const)('%s %s is that theme\u2019s boxShadow, copied', (scheme, name) => {
    const style = liftStyle(scheme, name, { os: 'ios', version: '18.0' });
    expect(style).toEqual({ boxShadow: liftOf(scheme, name) });
    expect(style.boxShadow).not.toBe(liftOf(scheme, name));
  });

  test('iOS and a modern Android both take the boxShadow', () => {
    expect(liftStyle('light', 'lift1', { os: 'android', version: 34 })).toEqual({
      boxShadow: liftOf('light', 'lift1'),
    });
    expect(liftStyle('light', 'lift1', { os: 'android', version: 28 })).toHaveProperty(
      'boxShadow',
    );
  });

  test('an Android before 9 falls back to the elevation of the token', () => {
    expect(liftStyle('light', 'lift1', { os: 'android', version: 27 })).toEqual({
      elevation: LiftElevation.lift1,
    });
    expect(liftStyle('dark', 'lift2', { os: 'android', version: 26 })).toEqual({
      elevation: LiftElevation.lift2,
    });
  });
});

describe('useLiftStyle', () => {
  test('follows the device scheme', async () => {
    useColorScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useLiftStyle('lift2'));
    expect(result.current).toEqual({ boxShadow: liftOf('dark', 'lift2') });
  });

  test('an unknown scheme is light', async () => {
    useColorScheme.mockReturnValue(null);
    const { result } = await renderHook(() => useLiftStyle('lift1'));
    expect(result.current).toEqual({ boxShadow: liftOf('light', 'lift1') });
  });

  test('no lift is no style, and the same object between renders', async () => {
    useColorScheme.mockReturnValue('light');
    const none = await renderHook(() => useLiftStyle(null));
    expect(none.result.current).toBeUndefined();

    const lifted = await renderHook(() => useLiftStyle('lift1'));
    const first = lifted.result.current;
    await lifted.rerender({});
    expect(lifted.result.current).toBe(first);
  });
});
