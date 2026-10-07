/**
 * Coverage for the single appearance resolver — contract C4.
 *
 * The pure mapping is asserted in test/theme/appearance.test.ts; this covers the
 * hook's own job: reading the platform, subscribing to change events, and
 * cleaning up after itself.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { Colors } from '@/constants/theme';

import { __resetAppearanceStoreForTests } from './appearance-store';
import { useAppearance } from './use-appearance';

// The contrast reader is the one that decides the theme, so a test can make it fail. It wraps
// the real reader; `beforeEach` points it back at it, whatever an earlier test changed.
jest.mock('@/theme/accessibility', () => {
  const actual = jest.requireActual('@/theme/accessibility');
  return { ...actual, readPrefersMoreContrast: jest.fn() };
});

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: jest.fn(() => 'light'),
}));

const { useColorScheme } = jest.requireMock('@/hooks/use-color-scheme') as {
  useColorScheme: jest.Mock;
};
const { readPrefersMoreContrast } = jest.requireMock('@/theme/accessibility') as {
  readPrefersMoreContrast: jest.Mock;
};
const realReadPrefersMoreContrast = (
  jest.requireActual('@/theme/accessibility') as typeof import('@/theme/accessibility')
).readPrefersMoreContrast;

let removeSpy: jest.Mock;

beforeEach(() => {
  readPrefersMoreContrast.mockImplementation(realReadPrefersMoreContrast);
  removeSpy = jest.fn();
  useColorScheme.mockReturnValue('light');
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: removeSpy } as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
});

afterEach(() => {
  // The store is shared by the whole module registry: a test must not inherit the last one's.
  __resetAppearanceStoreForTests();
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

describe('useAppearance ready — the first accessibility read has settled (004 D4-05)', () => {
  /** A query a test settles by hand, on the iOS "Increase Contrast" accessor. */
  function pendingContrast() {
    let settle: { resolve: (value: boolean) => void; reject: (error: Error) => void };
    const promise = new Promise<boolean>((resolve, reject) => {
      settle = { resolve, reject };
    });
    Object.assign(AccessibilityInfo, {
      isDarkerSystemColorsEnabled: jest.fn(() => promise),
    });
    return {
      resolve: (value: boolean) => settle.resolve(value),
      reject: (e: Error) => settle.reject(e),
    };
  }

  test('is false while a query is still pending, with the flags at their defaults', async () => {
    pendingContrast();

    const { result } = await renderHook(() => useAppearance());
    await waitFor(() =>
      expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled(),
    );

    expect(result.current.ready).toBe(false);
    expect(result.current.themeName).toBe('light');
  });

  test('stays false for as long as the query never answers', async () => {
    pendingContrast();

    const { result } = await renderHook(() => useAppearance());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(result.current.ready).toBe(false);
  });

  test('becomes true, with the flags it read, in the same render', async () => {
    const contrast = pendingContrast();
    const seen: { ready: boolean; themeName: string }[] = [];

    const { result } = await renderHook(() => {
      const appearance = useAppearance();
      seen.push({ ready: appearance.ready, themeName: appearance.themeName });
      return appearance;
    });
    await act(async () => {
      contrast.resolve(true);
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.themeName).toBe('light-contrast');
    // Never ready with the flags still unread: every ready render already has them.
    const readyThemes = seen
      .filter((entry) => entry.ready)
      .map((entry) => entry.themeName);
    expect(readyThemes.length).toBeGreaterThan(0);
    expect(new Set(readyThemes)).toEqual(new Set(['light-contrast']));
  });

  test('becomes true when the platform query rejects, which reads as more contrast', async () => {
    const contrast = pendingContrast();

    const { result } = await renderHook(() => useAppearance());
    await act(async () => {
      contrast.reject(new Error('the accessibility service is not available'));
    });

    await waitFor(() => expect(result.current.ready).toBe(true));
    // Contract C4: an unavailable query falls back to the MORE accessible value.
    expect(result.current.prefersMoreContrast).toBe(true);
  });

  test('becomes true when the whole first read rejects, on the more accessible flags (C4)', async () => {
    readPrefersMoreContrast.mockRejectedValue(new Error('unexpected'));

    const { result } = await renderHook(() => useAppearance());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.prefersMoreContrast).toBe(true);
    expect(result.current.themeName).toBe('light-contrast');
    expect(result.current.prefersLessMotion).toBe(true);
  });

  test('a later whole-read failure keeps the flags it had', async () => {
    setIosIncreasedContrast(false);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.ready).toBe(true));
    readPrefersMoreContrast.mockRejectedValue(new Error('unexpected'));

    const handlers = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.map(
      ([, handler]) => handler as () => void,
    );
    await act(async () => {
      handlers.forEach((handler) => handler());
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.prefersMoreContrast).toBe(false);
    expect(result.current.themeName).toBe('light');
  });

  test('stays true when a later change event starts another read that has not answered', async () => {
    setIosIncreasedContrast(false);
    const { result } = await renderHook(() => useAppearance());
    await waitFor(() => expect(result.current.ready).toBe(true));
    pendingContrast();

    const handlers = (AccessibilityInfo.addEventListener as jest.Mock).mock.calls.map(
      ([, handler]) => handler as () => void,
    );
    await act(async () => {
      handlers.forEach((handler) => handler());
    });

    expect(result.current.ready).toBe(true);
  });

  test('sets nothing once unmounted, whether the read resolves or rejects late', async () => {
    const contrast = pendingContrast();
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { unmount } = await renderHook(() => useAppearance());
    await unmount();
    await act(async () => {
      contrast.resolve(true);
    });

    expect(errors).not.toHaveBeenCalled();
  });
});
