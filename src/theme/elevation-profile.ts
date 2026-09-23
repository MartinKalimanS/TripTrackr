/**
 * Elevation profile resolution — contract C5, data-model §3.
 *
 * One place decides how richly a treatment renders, so that no screen or
 * component ever branches on OS version. A component asks for `recessed`; this
 * decides whether that is an inset shadow pair or a sunken fill.
 *
 * Collapses two separate concerns that happen to have the same answer:
 *   - Android capability tiers (research R-001): outset needs API 28+, inset API 29+
 *   - the increased-contrast requirement (FR-013), which needs borders
 *
 * Pure, total, deterministic, and monotonic in capability.
 */

/** Android API level at which outset `boxShadow` becomes available. */
const ANDROID_OUTSET_SHADOW_API = 28;
/** Android API level at which inset `boxShadow` becomes available. */
const ANDROID_INSET_SHADOW_API = 29;

export type ElevationProfile =
  /** Two composed shadows; inset available. */
  | 'full'
  /** One outset shadow plus a stronger border; no inset. */
  | 'reduced'
  /** Borders and tonal fill only; no shadows. */
  | 'flat';

export interface ElevationInput {
  /** `Platform.OS`. Values other than ios/android are handled, not assumed away. */
  os: string;
  /** `Platform.Version` on Android; null elsewhere or when unknown. */
  apiLevel: number | null;
  /** Normalised from the per-platform accessors — see src/theme/accessibility.ts. */
  prefersMoreContrast: boolean;
}

/** Highest profile the platform itself can render, ignoring preferences. */
function platformCeiling({
  os,
  apiLevel,
}: Pick<ElevationInput, 'os' | 'apiLevel'>): ElevationProfile {
  if (os === 'ios') return 'full';

  if (os === 'android') {
    // An unknown API level is treated as incapable rather than optimistically
    // capable: a missing shadow is a smaller failure than a broken one.
    if (apiLevel === null) return 'flat';
    if (apiLevel >= ANDROID_INSET_SHADOW_API) return 'full';
    if (apiLevel >= ANDROID_OUTSET_SHADOW_API) return 'reduced';
    return 'flat';
  }

  // Web renders the full treatment: react-native-web 0.21 composes an array
  // boxShadow via `createBoxShadowArrayValue` (preprocess.js:167) and emits the
  // `inset` keyword (preprocess.js:67). Confirmed from source — research R-008.2.
  if (os === 'web') return 'full';

  // Anything else is treated as incapable rather than optimistically capable.
  return 'flat';
}

/**
 * Resolve the elevation profile for the current device and preferences.
 */
export function resolveElevationProfile(input: ElevationInput): ElevationProfile {
  const ceiling = platformCeiling(input);

  // Increased contrast asks for borders, which is what `reduced` renders — but
  // it must never promote a device that cannot draw shadows at all.
  if (input.prefersMoreContrast) {
    return ceiling === 'flat' ? 'flat' : 'reduced';
  }

  return ceiling;
}
