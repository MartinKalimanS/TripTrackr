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

afterEach(() => {
  jest.restoreAllMocks();
  delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
    .isDarkerSystemColorsEnabled;
  delete (AccessibilityInfo as { isHighTextContrastEnabled?: unknown })
    .isHighTextContrastEnabled;
});

/** iOS's "Increase Contrast" accessor: present on the real module, absent from the Jest mock. */
function setIosIncreasedContrast(enabled: boolean) {
  Object.assign(AccessibilityInfo, {
    isDarkerSystemColorsEnabled: jest.fn().mockResolvedValue(enabled),
  });
}

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

  test('exposes a font scale and the forced flat elevation profile (004 D4-12)', async () => {
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.fontScale).toBeGreaterThan(0));
    expect(result.current.elevationProfile).toBe('flat');
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

describe('useAppearance themeName — contract C4-4', () => {
  test('equals the device scheme when more contrast is not requested', async () => {
    setIosIncreasedContrast(false);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.theme).toBe('light'));
    expect(result.current.themeName).toBe('light');
    expect(result.current.prefersMoreContrast).toBe(false);
  });

  test('is dark when the device is dark and more contrast is not requested', async () => {
    useColorScheme.mockReturnValue('dark');
    setIosIncreasedContrast(false);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.theme).toBe('dark'));
    expect(result.current.themeName).toBe('dark');
  });

  test('is light-contrast when a light device asks for more contrast', async () => {
    setIosIncreasedContrast(true);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.themeName).toBe('light-contrast'));
    expect(result.current.theme).toBe('light');
    expect(result.current.prefersMoreContrast).toBe(true);
  });

  test('is dark-contrast when a dark device asks for more contrast', async () => {
    useColorScheme.mockReturnValue('dark');
    setIosIncreasedContrast(true);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.themeName).toBe('dark-contrast'));
    expect(result.current.theme).toBe('dark');
  });

  test('keeps the two-theme tokens until the screens migrate', async () => {
    useColorScheme.mockReturnValue('dark');
    setIosIncreasedContrast(true);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.themeName).toBe('dark-contrast'));
    expect(result.current.tokens).toBe(Colors.dark);
  });
});
