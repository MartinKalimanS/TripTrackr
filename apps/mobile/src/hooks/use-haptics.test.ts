/**
 * T417 - FR-020, contract C4-7, research D4-10.
 *
 * Haptics are a courtesy: they are off when the traveller asked for reduced motion, and
 * they never break the press that asked for them on a device without a haptic engine.
 */
import { renderHook } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { useHaptics } from './use-haptics';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const haptics = jest.mocked(ExpoHaptics);

function mockAppearance(prefersLessMotion: boolean) {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
  } as AppearanceContext);
}

beforeEach(() => {
  haptics.selectionAsync.mockReset().mockResolvedValue(undefined);
  haptics.notificationAsync.mockReset().mockResolvedValue(undefined);
  mockAppearance(false);
});

describe('useHaptics - FR-020', () => {
  test('selection plays the selection haptic', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.selection();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test('success plays the success notification', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.success();
    expect(haptics.notificationAsync).toHaveBeenCalledWith('success');
  });

  test('warning plays the warning notification', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.warning();
    expect(haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  test('plays nothing when the traveller asked for reduced motion', async () => {
    mockAppearance(true);
    const { result } = await renderHook(() => useHaptics());
    result.current.selection();
    result.current.success();
    result.current.warning();
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test('follows the setting live, without remounting', async () => {
    const { result, rerender } = await renderHook(() => useHaptics());
    result.current.selection();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);

    mockAppearance(true);
    await rerender({});
    result.current.selection();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);

    mockAppearance(false);
    await rerender({});
    result.current.selection();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  test('hands out the same functions while the setting does not change', async () => {
    const { result, rerender } = await renderHook(() => useHaptics());
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  test('swallows a synchronous failure from a device without haptics', async () => {
    haptics.selectionAsync.mockImplementation(() => {
      throw new Error('unavailable');
    });
    const { result } = await renderHook(() => useHaptics());
    expect(() => result.current.selection()).not.toThrow();
  });

  // A rejection nobody handles is reported by the runtime, not thrown at the caller, and
  // Jest swallows the report, so "nothing was reported" cannot fail. What can: that the
  // adapter ATTACHES a handler to the promise it was given. Remove the `.catch` in
  // use-haptics.ts and both tests below fail.
  test('consumes a rejected promise by attaching a catch handler to it', async () => {
    // Rejected only when the haptic is played: a rejection created earlier would be
    // reported as unhandled while the hook renders, before the adapter could consume it.
    let attach = jest.fn() as jest.SpyInstance<Promise<void>>;
    haptics.notificationAsync.mockImplementation(() => {
      const rejection = Promise.reject(new Error('unavailable'));
      attach = jest.spyOn(rejection, 'catch') as typeof attach;
      return rejection;
    });
    const { result } = await renderHook(() => useHaptics());

    result.current.success();

    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith(expect.any(Function));
    // The handler swallows: the promise the adapter leaves behind resolves.
    await expect(attach.mock.results[0].value).resolves.toBeUndefined();
  });

  test('the handler it attaches returns nothing and does not rethrow', async () => {
    const attach = jest.fn();
    haptics.selectionAsync.mockReturnValue({ catch: attach } as unknown as Promise<void>);
    const { result } = await renderHook(() => useHaptics());

    result.current.selection();

    expect(attach).toHaveBeenCalledTimes(1);
    const handler = attach.mock.calls[0][0] as (error: unknown) => unknown;
    expect(() => handler(new Error('unavailable'))).not.toThrow();
    expect(handler(new Error('unavailable'))).toBeUndefined();
  });
});
