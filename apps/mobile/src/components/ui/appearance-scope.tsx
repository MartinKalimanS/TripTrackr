/**
 * `AppearanceScope` - a subtree painted in another theme and at another text scale
 * (feature 005, T524; research D5-18). It exists for the dev gallery, which shows every
 * adapter in the four themes at text scale 1 and 2 on one device, and for nothing else:
 * no screen wraps itself in one.
 *
 *   <AppearanceScope theme="dark-contrast" fontScale={2}>...</AppearanceScope>
 *   <AppearanceScope reduceTransparency>...</AppearanceScope>   inherits the rest
 *
 * Two things change below it, and only below it:
 *
 * - the appearance override (`hooks/appearance-override.ts`): the colour scheme, the
 *   accessibility flags and the font scale that `useAppearance`, the lift and the adapters'
 *   minimum heights are derived from;
 * - Uniwind's `ScopedTheme`: the classes (`bg-surface`) and `useCSSVariable`, so the kit's
 *   `useThemeColor` and every `useColors` key resolve in the scoped theme.
 *
 * A prop that is not given is inherited from the scope above, or from the device when there
 * is none, so a frame inside a scope may change one flag and keep the theme. The text scale
 * is a LAYOUT scale: adapters take their minimum heights and reflow from it, but the glyphs
 * follow the system text size, which only the system setting changes. The gallery says so.
 *
 * This file is in `components/ui/` because only that folder may import `uniwind`.
 */
import { useMemo, type ReactNode } from 'react';
import { ScopedTheme } from 'uniwind';

import {
  AppearanceOverrideContext,
  type AppearanceOverride,
} from '@/hooks/appearance-override';
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFontScale } from '@/hooks/use-font-scale';
import { resolvePaletteName, type PaletteName } from '@/theme/palette';

export interface AppearanceScopeProps {
  /** One of the four themes. Default: the scope above, else the device's. */
  theme?: PaletteName;
  /** The text scale to lay out at. Default: the scope above, else the device's. */
  fontScale?: number;
  /** Default: the scope above, else the device's. */
  reduceMotion?: boolean;
  /** Default: the scope above, else the device's. */
  reduceTransparency?: boolean;
  children?: ReactNode;
}

/** The scheme and the contrast flag a theme name stands for. */
function partsOf(
  theme: PaletteName,
): Pick<AppearanceOverride, 'scheme' | 'prefersMoreContrast'> {
  return {
    scheme: theme.startsWith('dark') ? 'dark' : 'light',
    prefersMoreContrast: theme.endsWith('-contrast'),
  };
}

export function AppearanceScope({
  theme,
  fontScale,
  reduceMotion,
  reduceTransparency,
  children,
}: AppearanceScopeProps) {
  const inheritedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const inherited = useAccessibilityFlags();
  const inheritedScale = useFontScale();

  const value = useMemo<AppearanceOverride>(
    () => ({
      ...(theme
        ? partsOf(theme)
        : {
            scheme: inheritedScheme,
            prefersMoreContrast: inherited.prefersMoreContrast,
          }),
      prefersLessMotion: reduceMotion ?? inherited.prefersLessMotion,
      prefersLessTransparency: reduceTransparency ?? inherited.prefersLessTransparency,
      fontScale: fontScale ?? inheritedScale,
    }),
    [
      theme,
      fontScale,
      reduceMotion,
      reduceTransparency,
      inheritedScheme,
      inherited,
      inheritedScale,
    ],
  );

  return (
    <AppearanceOverrideContext.Provider value={value}>
      <ScopedTheme theme={resolvePaletteName(value.scheme, value.prefersMoreContrast)}>
        {children}
      </ScopedTheme>
    </AppearanceOverrideContext.Provider>
  );
}
