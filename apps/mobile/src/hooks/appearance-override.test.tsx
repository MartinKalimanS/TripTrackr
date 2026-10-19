/**
 * Feature 005, T524: the appearance override that lets the dev gallery paint a subtree in
 * another theme and at another text scale (research D5-18).
 *
 * The override replaces the INPUTS of the appearance (the colour scheme, the accessibility
 * flags and the font scale) for the components below a provider, so everything derived from
 * them (`useAppearance`, the lift, the adapters' minimum heights) follows. Outside a provider
 * nothing changes: the context's default is `null`, which is every production render.
 */
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Dimensions } from 'react-native';

import { Colors } from '@/constants/theme';

import {
  AppearanceOverrideContext,
  overrideFlags,
  type AppearanceOverride,
} from './appearance-override';
import {
  __resetAppearanceStoreForTests,
  getAppearanceSnapshot,
} from './appearance-store';
import { useAccessibilityFlags } from './use-accessibility-flags';
import { useAppearance } from './use-appearance';
import { useColorScheme } from './use-color-scheme';
import { useFontScale } from './use-font-scale';

// React Native's own hook, which is what `useColorScheme` of the app answers with when no
// scope is set: a double the test points at light or dark.
const mockDeviceScheme = jest.fn(() => 'light');
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockDeviceScheme(),
}));

const DARK_CONTRAST_LARGE: AppearanceOverride = {
  scheme: 'dark',
  prefersMoreContrast: true,
  prefersLessMotion: true,
  prefersLessTransparency: true,
  fontScale: 2,
};

function scoped(override: AppearanceOverride | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppearanceOverrideContext.Provider value={override}>
        {children}
      </AppearanceOverrideContext.Provider>
    );
  };
}

beforeEach(() => {
  mockDeviceScheme.mockReturnValue('light');
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as never);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false);
  Object.assign(AccessibilityInfo, { isDarkerSystemColorsEnabled: async () => false });
});

afterEach(() => {
  __resetAppearanceStoreForTests();
  jest.restoreAllMocks();
  delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
    .isDarkerSystemColorsEnabled;
});

describe('overrideFlags', () => {
  test('is the three flags of the override, read as settled', () => {
    expect(overrideFlags(DARK_CONTRAST_LARGE)).toEqual({
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: true,
      ready: true,
    });
  });
});

describe('with no override (every production render)', () => {
  test('the colour scheme is the device scheme', async () => {
    mockDeviceScheme.mockReturnValue('dark');
    const { result } = await renderHook(() => useColorScheme());
    expect(result.current).toBe('dark');
  });

  test('the font scale is the window font scale', async () => {
    jest.spyOn(Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1.3,
    });
    const { result } = await renderHook(() => useFontScale());
    expect(result.current).toBe(1.3);
  });

  test('the accessibility flags are the shared store snapshot, unchanged', async () => {
    const { result } = await renderHook(() => useAccessibilityFlags());
    expect(result.current).toBe(getAppearanceSnapshot());
  });

  test('useAppearance resolves from the device, with the tokens of that theme', async () => {
    mockDeviceScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useAppearance());
    expect(result.current.themeName).toBe('light');
    expect(result.current.tokens).toBe(Colors.light);
  });
});

describe('under an override', () => {
  test('the colour scheme is the override, whatever the device says', async () => {
    mockDeviceScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useColorScheme(), {
      wrapper: scoped(DARK_CONTRAST_LARGE),
    });
    expect(result.current).toBe('dark');
  });

  test('the font scale is the override, whatever the window says', async () => {
    const { result } = await renderHook(() => useFontScale(), {
      wrapper: scoped(DARK_CONTRAST_LARGE),
    });
    expect(result.current).toBe(2);
  });

  test('the accessibility flags are the override, ready at once, and stable', async () => {
    const { result, rerender } = await renderHook(() => useAccessibilityFlags(), {
      wrapper: scoped(DARK_CONTRAST_LARGE),
    });
    expect(result.current).toEqual({
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: true,
      ready: true,
    });
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  test('useAppearance derives the theme, the tokens and the scale from the override', async () => {
    mockDeviceScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useAppearance(), {
      wrapper: scoped(DARK_CONTRAST_LARGE),
    });
    expect(result.current).toEqual({
      theme: 'dark',
      themeName: 'dark-contrast',
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: true,
      fontScale: 2,
      tokens: Colors['dark-contrast'],
      ready: true,
    });
  });

  test('useAppearance is the same object between renders under an override', async () => {
    const { result, rerender } = await renderHook(() => useAppearance(), {
      wrapper: scoped(DARK_CONTRAST_LARGE),
    });
    const first = result.current;
    await rerender({});
    expect(result.current).toBe(first);
  });

  test('a null override is no override', async () => {
    mockDeviceScheme.mockReturnValue('light');
    const { result } = await renderHook(() => useAppearance(), { wrapper: scoped(null) });
    expect(result.current.themeName).toBe('light');
  });
});
