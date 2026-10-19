/**
 * An `AppearanceContext` for a theme, for suites that mock `@/hooks/use-appearance` (feature
 * 005, T526). Not a test file.
 *
 *   jest.mock('@/hooks/use-appearance');
 *   const { useAppearance } = jest.requireMock('@/hooks/use-appearance');
 *   useAppearance.mockReturnValue(appearanceOf('dark', { prefersLessTransparency: true }));
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
