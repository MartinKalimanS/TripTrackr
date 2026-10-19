/**
 * The appearance override - feature 005, T524; research D5-18.
 *
 * The dev gallery (`components/dev/`) shows every adapter in the four themes at text scale 1
 * and 2 on one device, so it must be able to paint a SUBTREE in an appearance the device is
 * not in. `AppearanceScope` (`components/ui/appearance-scope.tsx`) provides this context; the
 * hooks that read the device (`useColorScheme`, `useAccessibilityFlags`, `useFontScale`) answer
 * from it when it is set, and `useAppearance`, `useLiftStyle` and the adapters' minimum heights
 * are derived from those, so they follow without being touched.
 *
 * It replaces INPUTS (the scheme, the flags, the scale), never the derived `AppearanceContext`,
 * so `themeName` and `tokens` stay the one resolution of `resolvePaletteName`.
 *
 * Production behaviour is unchanged: the default is `null`, nothing but the gallery provides
 * a value, and the hooks then return exactly what they returned before. The file holds no
 * dev-only import, so it adds no gallery code to a release bundle.
 */
import { createContext, useContext } from 'react';

import type { AppearanceSnapshot } from '@/hooks/appearance-store';

export interface AppearanceOverride {
  scheme: 'light' | 'dark';
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;
  /** The text scale the subtree lays out at (1 is the default size). */
  fontScale: number;
}

export const AppearanceOverrideContext = createContext<AppearanceOverride | null>(null);

/** The override of the nearest scope, or `null` outside every scope. */
export function useAppearanceOverride(): AppearanceOverride | null {
  return useContext(AppearanceOverrideContext);
}

/** The accessibility flags of an override, in the shape of the shared store's snapshot. */
export function overrideFlags(override: AppearanceOverride): AppearanceSnapshot {
  return {
    prefersMoreContrast: override.prefersMoreContrast,
    prefersLessMotion: override.prefersLessMotion,
    prefersLessTransparency: override.prefersLessTransparency,
    ready: true,
  };
}
