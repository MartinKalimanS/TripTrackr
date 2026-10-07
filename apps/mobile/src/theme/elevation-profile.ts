/**
 * Elevation profile resolution — contract C5, data-model §3, amended by feature 004.
 *
 * The profile decided how richly a neumorphic treatment rendered: two composed shadows
 * (`full`), one outset shadow plus a stronger border (`reduced`), or borders and tonal
 * fill only (`flat`), from the Android capability tier and the increased-contrast
 * preference.
 *
 * 004 D4-12 retires the shadows. Until the old `Surface` and `PressableSurface` are
 * deleted (phase 7) the resolver ALWAYS returns `flat`, so every unconverted screen
 * renders with its shadows collapsed and its boundaries carried by the stronger border.
 * The input and the return type stay, so no call site changes; the capability logic is
 * in git history and is not needed again, because the Atlas look has no soft shadow to
 * degrade.
 *
 * Pure, total and deterministic.
 */

export type ElevationProfile =
  /** Two composed shadows; inset available. Retired by 004 D4-12. */
  | 'full'
  /** One outset shadow plus a stronger border; no inset. Retired by 004 D4-12. */
  | 'reduced'
  /** Borders and tonal fill only; no shadows. The only value ever resolved. */
  | 'flat';

export interface ElevationInput {
  /** `Platform.OS`. Values other than ios/android are handled, not assumed away. */
  os: string;
  /** `Platform.Version` on Android; null elsewhere or when unknown. */
  apiLevel: number | null;
  /** Normalised from the per-platform accessors — see src/theme/accessibility.ts. */
  prefersMoreContrast: boolean;
}

/**
 * Resolve the elevation profile for the current device and preferences: always `flat`
 * (004 D4-12). The parameter is kept so the signature, and every caller, is unchanged.
 */
export function resolveElevationProfile(_input: ElevationInput): ElevationProfile {
  return 'flat';
}
