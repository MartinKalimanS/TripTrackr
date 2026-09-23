/**
 * Coverage for the single appearance resolver — contract C4.
 *
 * The pure mapping is asserted in test/theme/appearance.test.ts; this covers the
 * hook's own job: reading the platform, subscribing to change events, and
 * cleaning up after itself.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { Colors } from '@/constants/theme';

import { useAppearance } from './use-appearance';

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock;
};

let removeSpy: jest.Mock;

beforeEach(() => {
  removeSpy = jest.fn();
  useColorScheme.mockReturnValue('light');
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: removeSpy } as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});

afterEach(() => jest.restoreAllMocks());

describe('useAppearance', () => {
  test('resolves the light theme and its ramp', async () => {
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.theme).toBe('light'));
    expect(result.current.tokens).toBe(Colors.light);
  });

  test('resolves the dark theme when the device asks for it', async () => {
    useColorScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(result.current.tokens).toBe(Colors.dark);
  });

  test('treats an unspecified scheme as light rather than throwing', async () => {
    useColorScheme.mockReturnValue('unspecified');
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.theme).toBe('light'));
  });

  test('exposes a font scale and an elevation profile', async () => {
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.fontScale).toBeGreaterThan(0));
    expect(['full', 'reduced', 'flat']).toContain(result.current.elevationProfile);
  });

  test('subscribes to accessibility change events so it updates live (FR-023)', async () => {
    await renderHook(() => useAppearance());
    await waitFor(() => expect(AccessibilityInfo.addEventListener).toHaveBeenCalled());

    const events = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.map(
      ([event]) => event,
    );
    expect(events).toContain('reduceMotionChanged');
    expect(events).toContain('reduceTransparencyChanged');
  });

  test('removes its subscriptions on unmount', async () => {
    const { unmount } = await renderHook(() => useAppearance());
    await waitFor(() => expect(AccessibilityInfo.addEventListener).toHaveBeenCalled());
    await unmount();
    await waitFor(() => expect(removeSpy).toHaveBeenCalled());
  });

  test('reports reduced transparency as false on Android (research R-003)', async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(true);

    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.prefersLessTransparency).toBe(false));

    Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
  });
});
