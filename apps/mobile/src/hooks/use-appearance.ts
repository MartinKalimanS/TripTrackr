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
  /**
   * True once the FIRST read of the accessibility flags has settled, whether it answered
   * or failed. Until then `themeName` and `prefersLessMotion` are the defaults, not what
   * the OS said, so the root layout keeps the splash up and renders nothing: the first
   * frame the traveller sees already has the contrast theme and the motion setting
   * (research D4-05). Later change events never reset it.
   */
  ready: boolean;
}

interface AccessibilityFlags {
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;
}

/** What is known before the first read has answered. */
const UNREAD: AccessibilityFlags = {
  prefersMoreContrast: false,
  prefersLessMotion: false,
  prefersLessTransparency: false,
};

/**
 * Reads the platform's accessibility flags at mount and again on each change event, and
 * says whether the first read has settled (`AppearanceContext.ready`).
 */
function useAccessibilityRead() {
  // One state, so `ready` and the flags it vouches for change in the same render.
  const [read, setRead] = useState<{ flags: AccessibilityFlags; ready: boolean }>({
    flags: UNREAD,
    ready: false,
  });

  useEffect(() => {
    let active = true;

    const refresh = async () => {
      const os = Platform.OS;
      let answered: AccessibilityFlags | null = null;
      try {
        const [prefersMoreContrast, prefersLessMotion, prefersLessTransparency] =
          await Promise.all([
            readPrefersMoreContrast(os, platformQueries),
            readPrefersLessMotion(os, platformQueries),
            readPrefersLessTransparency(os, platformQueries),
          ]);
        answered = { prefersMoreContrast, prefersLessMotion, prefersLessTransparency };
      } catch {
        // Each reader already falls back to the more accessible value when its query
        // fails, so this is the read as a whole failing. Keep the flags there are, and
        // still settle: a read that failed must not hold the splash up for good.
      }
      if (active) {
        setRead((previous) => ({ flags: answered ?? previous.flags, ready: true }));
      }
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

  return read;
}

export function useAppearance(): AppearanceContext {
  const scheme = useColorScheme();
  const theme: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  const { fontScale } = useWindowDimensions();

  const read = useAccessibilityRead();

  return useMemo(
    () => ({
      theme,
      themeName: resolvePaletteName(theme, read.flags.prefersMoreContrast),
      ...read.flags,
      fontScale,
      // Forced flat (004 D4-12): no device input reaches it, so none is passed.
      elevationProfile: resolveElevationProfile(),
      tokens: Colors[theme],
      ready: read.ready,
    }),
    [theme, read, fontScale],
  );
}
