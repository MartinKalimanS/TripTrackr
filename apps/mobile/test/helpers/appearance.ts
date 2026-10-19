/**
 * An `AppearanceContext` for suites that mock `@/hooks/use-appearance` (feature 005; not a
 * test file):
 *
 *   jest.mock('@/hooks/use-appearance');
 *   const { useAppearance } = jest.requireMock('@/hooks/use-appearance');
 *   useAppearance.mockReturnValue(appearance());
 *   useAppearance.mockReturnValue(appearanceOf('dark', { prefersLessTransparency: true }));
 *
 * `appearance` is the light theme at the default text size with motion allowed, and what a
 * test changes (`fontScale`, `prefersLessMotion`, ...) laid over it; `appearanceOf` does the
 * same for any of the four themes.
 */
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import type { PaletteName } from '@/theme';

export function appearanceOf(
  themeName: PaletteName,
  overrides: Partial<AppearanceContext> = {},
): AppearanceContext {
  return {
    theme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersMoreContrast: themeName.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors[themeName],
    ready: true,
    ...overrides,
  };
}

export function appearance(
  overrides: Partial<AppearanceContext> = {},
): AppearanceContext {
  return appearanceOf('light', overrides);
}
