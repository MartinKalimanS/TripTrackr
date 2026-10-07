/**
 * The single appearance resolver — contract C4.
 *
 * No component subscribes to `AccessibilityInfo` or `useColorScheme` directly.
 * Centralising it is what keeps the per-platform mapping (research R-003) in
 * one place instead of being something every contributor must remember.
 *
 * Every field updates live: each signal has a change event, which is what
 * Acceptance Scenario 3.2 (switching appearance with the app open) requires.
 *
 * The accessibility flags are NOT read here. They live in one shared store
 * (`appearance-store.ts`) that registers one listener per event type and runs one read per
 * signal for the whole app, however many components call this hook (tasks.md T461). What
 * stays per component is the cheap part: the colour scheme and the window's font scale.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { useWindowDimensions } from 'react-native';

import { Colors } from '@/constants/theme';
import {
  getAppearanceServerSnapshot,
  getAppearanceSnapshot,
  subscribeToAppearance,
} from '@/hooks/appearance-store';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
  /**
   * True once the FIRST read of the accessibility flags has settled, whether it answered
   * or failed. Until then `themeName` and `prefersLessMotion` are the defaults, not what
   * the OS said, so the root layout keeps the splash up and renders nothing: the first
   * frame the traveller sees already has the contrast theme and the motion setting
   * (research D4-05). Later change events never reset it.
   */
  ready: boolean;
}

/**
 * The returned object is the same one between renders until the scheme, the font scale or a
 * shared accessibility flag changes.
 */
export function useAppearance(): AppearanceContext {
  const scheme = useColorScheme();
  const theme: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  const { fontScale } = useWindowDimensions();

  // One snapshot, so `ready` and the flags it vouches for change in the same render.
  const accessibility = useSyncExternalStore(
    subscribeToAppearance,
    getAppearanceSnapshot,
    getAppearanceServerSnapshot,
  );

  return useMemo(
    () => ({
      theme,
      themeName: resolvePaletteName(theme, accessibility.prefersMoreContrast),
      prefersMoreContrast: accessibility.prefersMoreContrast,
      prefersLessMotion: accessibility.prefersLessMotion,
      prefersLessTransparency: accessibility.prefersLessTransparency,
      fontScale,
      // Forced flat (004 D4-12): no device input reaches it, so none is passed.
      elevationProfile: resolveElevationProfile(),
      tokens: Colors[theme],
      ready: accessibility.ready,
    }),
    [theme, accessibility, fontScale],
  );
}
