/**
 * T523 - FR-062, research D5-14, expo-haptics 57.0.3: the semantic map. A caller says WHAT
 * happened (`tap`, `select`, `sheetSnap`, `tabChange`, `success`, `warning`, `error`,
 * `stamp`), the hook says how it feels on this platform:
 *
 *   iOS and the fallback  tap -> impact(Light); select, sheetSnap, tabChange -> selection;
 *                         success, warning, error -> notification; stamp -> impact(Heavy)
 *   Android               the platform's own haptic constants through
 *                         `performAndroidHapticsAsync` (no VIBRATE permission, the engine the
 *                         docs recommend): select and sheetSnap -> Segment_Tick, tap and
 *                         tabChange -> Virtual_Key, success -> Confirm, error -> Reject,
 *                         warning and stamp -> Long_Press
 *
 * Every name is silent under reduced motion, swallows what the device throws, and is
 * debounced per name for 80 ms within one component, so a drag cannot machine-gun the motor.
 * The original three (`selection`, `success`, `warning`) keep their suite in
 * `use-haptics.test.ts`; the Android values are the starting point of device check V6 (T512).
 */
import { renderHook } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { useHaptics } from './use-haptics';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  performAndroidHapticsAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  // The constants of expo-haptics 57.0.3 (`Haptics.types.d.ts`) the map reaches.
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Long_Press: 'long-press',
    Segment_Tick: 'segment-tick',
    Virtual_Key: 'virtual-key',
  },
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};
const haptics = jest.mocked(ExpoHaptics);

const ALL = [
  'tap',
  'select',
  'selection',
  'sheetSnap',
  'tabChange',
  'success',
  'warning',
  'error',
  'stamp',
] as const;

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
  haptics.impactAsync.mockReset().mockResolvedValue(undefined);
  haptics.performAndroidHapticsAsync.mockReset().mockResolvedValue(undefined);
  mockAppearance(false);
});

describe('useHaptics semantic map - iOS and the cross-platform fallback', () => {
  test('exposes every semantic name, the old three included, and impact(kind)', async () => {
    const { result } = await renderHook(() => useHaptics());
    for (const name of ALL) expect(typeof result.current[name]).toBe('function');
    expect(typeof result.current.impact).toBe('function');
  });

  test('tap is a light impact', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.tap();
    expect(haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
  });

  test.each(['select', 'selection', 'sheetSnap', 'tabChange'] as const)(
    '%s is the selection haptic',
    async (name) => {
      const { result } = await renderHook(() => useHaptics());
      result.current[name]();
      expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
      expect(haptics.impactAsync).not.toHaveBeenCalled();
      expect(haptics.notificationAsync).not.toHaveBeenCalled();
    },
  );

  test.each([
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'error'],
  ] as const)('%s is the %s notification', async (name, type) => {
    const { result } = await renderHook(() => useHaptics());
    result.current[name]();
    expect(haptics.notificationAsync).toHaveBeenCalledWith(type);
  });

  test('stamp is a heavy impact: the thud of the landing', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.stamp();
    expect(haptics.impactAsync).toHaveBeenCalledWith('heavy');
  });

  test('impact(light) is a tap and impact(heavy) a stamp', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.impact('light');
    expect(haptics.impactAsync).toHaveBeenLastCalledWith('light');
    result.current.impact('heavy');
    expect(haptics.impactAsync).toHaveBeenLastCalledWith('heavy');
  });

  test('never reaches the Android engine on iOS', async () => {
    const { result } = await renderHook(() => useHaptics());
    for (const name of ALL) result.current[name]();
    expect(haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});

describe('useHaptics semantic map - Android', () => {
  let os: ReturnType<typeof jest.replaceProperty>;
  beforeEach(() => {
    os = jest.replaceProperty(Platform, 'OS', 'android');
  });
  afterEach(() => os.restore());

  test.each([
    ['tap', 'virtual-key'],
    ['select', 'segment-tick'],
    ['selection', 'segment-tick'],
    ['sheetSnap', 'segment-tick'],
    ['tabChange', 'virtual-key'],
    ['success', 'confirm'],
    ['warning', 'long-press'],
    ['error', 'reject'],
    ['stamp', 'long-press'],
  ] as const)('%s performs the %s constant', async (name, constant) => {
    const { result } = await renderHook(() => useHaptics());
    result.current[name]();
    expect(haptics.performAndroidHapticsAsync).toHaveBeenCalledTimes(1);
    expect(haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(constant);
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
    expect(haptics.impactAsync).not.toHaveBeenCalled();
  });

  test('impact(light) and impact(heavy) are the tap and stamp constants', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.impact('light');
    result.current.impact('heavy');
    expect(haptics.performAndroidHapticsAsync.mock.calls).toEqual([
      ['virtual-key'],
      ['long-press'],
    ]);
  });

  test('falls back to the cross-platform calls when the native client predates the engine', async () => {
    const original = haptics.performAndroidHapticsAsync;
    Object.assign(haptics, { performAndroidHapticsAsync: undefined });
    try {
      const { result } = await renderHook(() => useHaptics());
      result.current.select();
      result.current.stamp();
      expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
      expect(haptics.impactAsync).toHaveBeenCalledWith('heavy');
    } finally {
      Object.assign(haptics, { performAndroidHapticsAsync: original });
    }
  });

  test('swallows a rejection of the Android engine', async () => {
    haptics.performAndroidHapticsAsync.mockRejectedValue(new Error('unsupported'));
    const { result } = await renderHook(() => useHaptics());
    expect(() => result.current.success()).not.toThrow();
  });

  test('a missing Android enum is swallowed, not thrown', async () => {
    const original = haptics.AndroidHaptics;
    Object.assign(haptics, { AndroidHaptics: undefined });
    try {
      const { result } = await renderHook(() => useHaptics());
      expect(() => result.current.select()).not.toThrow();
    } finally {
      Object.assign(haptics, { AndroidHaptics: original });
    }
  });
});

describe('useHaptics semantic map - reduced motion and failure', () => {
  test('every semantic name is silent when the traveller asked for reduced motion', async () => {
    mockAppearance(true);
    const { result } = await renderHook(() => useHaptics());
    for (const name of ALL) result.current[name]();
    result.current.impact('light');
    result.current.impact('heavy');
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    expect(haptics.notificationAsync).not.toHaveBeenCalled();
    expect(haptics.impactAsync).not.toHaveBeenCalled();
    expect(haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  test('every Android name is silent under reduced motion too', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      mockAppearance(true);
      const { result } = await renderHook(() => useHaptics());
      for (const name of ALL) result.current[name]();
      expect(haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test.each(ALL)('%s swallows a synchronous throw from the device', async (name) => {
    for (const call of [
      haptics.selectionAsync,
      haptics.notificationAsync,
      haptics.impactAsync,
    ]) {
      call.mockImplementation(() => {
        throw new Error('unavailable');
      });
    }
    const { result } = await renderHook(() => useHaptics());
    expect(() => result.current[name]()).not.toThrow();
  });

  test('follows the setting live: silent, then playing again with a fresh window', async () => {
    const { result, rerender } = await renderHook(() => useHaptics());
    result.current.stamp();
    mockAppearance(true);
    await rerender({});
    result.current.stamp();
    mockAppearance(false);
    await rerender({});
    result.current.stamp();
    expect(haptics.impactAsync).toHaveBeenCalledTimes(2);
  });
});

describe('useHaptics semantic map - the 80 ms debounce', () => {
  let now: jest.SpyInstance<number, []>;
  beforeEach(() => {
    now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
  });
  afterEach(() => now.mockRestore());

  test('drops the same name asked again within 80 ms, plays it after', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.sheetSnap();
    now.mockReturnValue(1_079);
    result.current.sheetSnap();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1_080);
    result.current.sheetSnap();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });

  test('select and its old name selection are one name', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.select();
    result.current.selection();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('different names never silence each other: a failure right after a tap is felt', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.tap();
    result.current.error();
    result.current.success();
    expect(haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(haptics.notificationAsync).toHaveBeenCalledTimes(2);
  });

  test('a dropped call does not extend the window', async () => {
    const { result } = await renderHook(() => useHaptics());
    result.current.tap();
    now.mockReturnValue(1_050);
    result.current.tap();
    now.mockReturnValue(1_090);
    result.current.tap();
    expect(haptics.impactAsync).toHaveBeenCalledTimes(2);
  });

  test('two components do not share a window: each owns its own', async () => {
    const first = await renderHook(() => useHaptics());
    const second = await renderHook(() => useHaptics());
    first.result.current.select();
    second.result.current.select();
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(2);
  });
});
