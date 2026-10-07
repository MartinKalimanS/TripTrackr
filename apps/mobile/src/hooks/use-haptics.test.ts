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
    elevationProfile: 'flat',
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

  test('swallows a rejected promise, so nothing is left unhandled', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    haptics.notificationAsync.mockRejectedValue(new Error('unavailable'));
    const { result } = await renderHook(() => useHaptics());

    expect(() => result.current.success()).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
