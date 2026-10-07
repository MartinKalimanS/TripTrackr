/**
 * The single appearance resolver — contract C4.
 *
 * No component subscribes to `AccessibilityInfo` or `useColorScheme` directly.
 * Centralising it is what keeps the per-platform mapping (research R-003) in
 * one place instead of being something every contributor must remember.
 *
 * Every field updates live: each signal has a change event, which is what
 * Acceptance Scenario 3.2 (switching appearance with the app open) requires.
 */
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  appearanceChangeEvents,
  platformQueries,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
} from '@/theme/accessibility';
import {
  resolveElevationProfile,
  type ElevationProfile,
} from '@/theme/elevation-profile';
import { resolvePaletteName, type PaletteName } from '@/theme/palette';
import type { ThemeName } from '@/theme/surfaces';

export interface AppearanceContext {
  /** The device scheme. */
  theme: ThemeName;
  /**
   * `theme` plus increased contrast: `light-contrast` or `dark-contrast` when
   * `prefersMoreContrast` is true, otherwise equal to `theme` (contract C4-4). The root
   * layout hands it to `Uniwind.setTheme`; nothing else sets the kit's theme.
   */
  themeName: PaletteName;
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  /** Structurally false on Android — the platform has no such setting. */
  prefersLessTransparency: boolean;
  fontScale: number;
  /** Forced to `flat` until the neumorphic primitives are deleted (004 D4-12). */
  elevationProfile: ElevationProfile;
  /** The two-theme legacy `Colors` until the screens migrate (phase 7). */
  tokens: (typeof Colors)['light'] | (typeof Colors)['dark'];
}

interface AccessibilityFlags {
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;
}

/** Android exposes its API level as `Platform.Version`; iOS reports a string. */
function androidApiLevel(): number | null {
  if (Platform.OS !== 'android') return null;
  const version = Platform.Version;
  return typeof version === 'number' ? version : null;
}

export function useAppearance(): AppearanceContext {
  const scheme = useColorScheme();
  const theme: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  const { fontScale } = useWindowDimensions();

  const [flags, setFlags] = useState<AccessibilityFlags>({
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
  });

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const os = Platform.OS;
      const [prefersMoreContrast, prefersLessMotion, prefersLessTransparency] =
        await Promise.all([
          readPrefersMoreContrast(os, platformQueries),
          readPrefersLessMotion(os, platformQueries),
          readPrefersLessTransparency(os, platformQueries),
        ]);
      if (active)
        setFlags({ prefersMoreContrast, prefersLessMotion, prefersLessTransparency });
    };

    void refresh();

    // Subscribe so the context updates live rather than only at launch. The
    // event names differ per platform — see appearanceChangeEvents.
    const subscriptions = appearanceChangeEvents(Platform.OS).map((event) =>
      AccessibilityInfo.addEventListener(
        event as Parameters<typeof AccessibilityInfo.addEventListener>[0],
        () => void refresh(),
      ),
    );

    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription?.remove());
    };
  }, []);

  return useMemo(
    () => ({
      theme,
      themeName: resolvePaletteName(theme, flags.prefersMoreContrast),
      ...flags,
      fontScale,
      elevationProfile: resolveElevationProfile({
        os: Platform.OS,
        apiLevel: androidApiLevel(),
        prefersMoreContrast: flags.prefersMoreContrast,
      }),
      tokens: Colors[theme],
    }),
    [theme, flags, fontScale],
  );
}
