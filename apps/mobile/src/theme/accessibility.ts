/**
 * Accessibility signal mapping — contract C4, research R-003.
 *
 * Two facts here are easy to get wrong from memory and were confirmed against
 * the versioned React Native documentation:
 *
 *   1. "Increased contrast" has NO single cross-platform accessor. iOS exposes
 *      `isDarkerSystemColorsEnabled`; Android's nearest equivalent is
 *      `isHighTextContrastEnabled`. Read the wrong one and FR-013 silently
 *      works on one platform only.
 *   2. Android has no "reduce transparency" setting at all. FR-014 is satisfied
 *      there by construction, because the design is opaque by default.
 *
 * The queries are injected rather than imported so the mapping is testable
 * without mocking React Native internals.
 */
import { AccessibilityInfo } from 'react-native';

export interface AccessibilityQueries {
  isReduceMotionEnabled?: () => Promise<boolean>;
  /** iOS only. */
  isReduceTransparencyEnabled?: () => Promise<boolean>;
  /** iOS only — this is iOS's "Increase Contrast". */
  isDarkerSystemColorsEnabled?: () => Promise<boolean>;
  /** Android only — Android's "High contrast text". */
  isHighTextContrastEnabled?: () => Promise<boolean>;
}

/**
 * Run a query, falling back to the value that produces the MORE accessible
 * rendering when the platform cannot answer (contract C4: never fall back to
 * the less accessible one).
 */
async function query(
  fn: (() => Promise<boolean>) | undefined,
  fallbackWhenUnavailable: boolean,
): Promise<boolean> {
  if (typeof fn !== 'function') return fallbackWhenUnavailable;
  try {
    return await fn();
  } catch {
    return fallbackWhenUnavailable;
  }
}

/** FR-013. Normalises the two different per-platform accessors into one flag. */
export async function readPrefersMoreContrast(
  os: string,
  queries: AccessibilityQueries,
): Promise<boolean> {
  if (os === 'ios') return query(queries.isDarkerSystemColorsEnabled, true);
  if (os === 'android') return query(queries.isHighTextContrastEnabled, true);
  return false;
}

/** FR-014. Structurally false on Android — the setting does not exist there. */
export async function readPrefersLessTransparency(
  os: string,
  queries: AccessibilityQueries,
): Promise<boolean> {
  if (os !== 'ios') return false;
  return query(queries.isReduceTransparencyEnabled, true);
}

/** FR-015. The one signal with the same accessor on both platforms. */
export async function readPrefersLessMotion(
  os: string,
  queries: AccessibilityQueries,
): Promise<boolean> {
  return query(queries.isReduceMotionEnabled, true);
}

/**
 * What the three readers above return when NONE of their queries can answer: the value that
 * produces the MORE accessible rendering, and `false` where the platform has no such signal
 * (contract C4). Used when a read fails as a whole, so that it does not leave the signals at
 * their less accessible defaults. `test/theme/appearance.test.ts` pins that it matches the
 * readers, so the two cannot drift apart.
 */
export function accessibleFallbackFlags(os: string): {
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;
} {
  return {
    prefersMoreContrast: os === 'ios' || os === 'android',
    prefersLessMotion: true,
    prefersLessTransparency: os === 'ios',
  };
}

/** The real platform queries, bound to React Native's AccessibilityInfo. */
export const platformQueries: AccessibilityQueries = {
  isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
  isReduceTransparencyEnabled: () => AccessibilityInfo.isReduceTransparencyEnabled(),
  isDarkerSystemColorsEnabled: () =>
    // Present on iOS only; guarded because the JS surface varies by version.
    typeof (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
      .isDarkerSystemColorsEnabled === 'function'
      ? (
          AccessibilityInfo as unknown as {
            isDarkerSystemColorsEnabled: () => Promise<boolean>;
          }
        ).isDarkerSystemColorsEnabled()
      : Promise.resolve(false),
  isHighTextContrastEnabled: () =>
    typeof (AccessibilityInfo as { isHighTextContrastEnabled?: unknown })
      .isHighTextContrastEnabled === 'function'
      ? (
          AccessibilityInfo as unknown as {
            isHighTextContrastEnabled: () => Promise<boolean>;
          }
        ).isHighTextContrastEnabled()
      : Promise.resolve(false),
};

/**
 * Change events to subscribe to so the appearance context updates live rather
 * than only at launch (contract C4, FR-023).
 *
 * These are per-platform for the same reason the QUERIES are: the contrast
 * signal is `highTextContrastChanged` on Android and `darkerSystemColorsChanged`
 * on iOS, and neither platform emits the other's event.
 *
 * Found on a real device (T058, Galaxy S23 / Android 16): increased contrast was
 * read correctly at mount but never updated afterwards, because only the motion
 * and transparency events were subscribed. The setting is one a traveller
 * toggles precisely BECAUSE they are struggling to read the screen — making them
 * relaunch the app to see the effect is the wrong moment to ask for patience.
 */
export function appearanceChangeEvents(os: string): string[] {
  if (os === 'android') {
    // Android has no reduce-transparency setting, so there is no event for it.
    return ['reduceMotionChanged', 'highTextContrastChanged'];
  }

  if (os === 'ios') {
    return [
      'reduceMotionChanged',
      'reduceTransparencyChanged',
      'darkerSystemColorsChanged',
    ];
  }

  return [];
}
