/**
 * An `AppearanceContext` for a suite that mocks `@/hooks/use-appearance`
 * (`jest.mock('@/hooks/use-appearance')`, then `useAppearance.mockReturnValue(appearance())`):
 * the light theme at the default text size with motion allowed, and what a test changes
 * (`fontScale`, `prefersLessMotion`, ...) laid over it.
 */
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

export function appearance(
  overrides: Partial<AppearanceContext> = {},
): AppearanceContext {
  return {
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
    ...overrides,
  };
}
