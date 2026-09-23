/**
 * Public surface of the token layer — contract C7.
 *
 * Token NAMES are stable. Token VALUES may be retuned provided the contrast
 * gate still passes. `SurfaceTreatment` is a closed union: adding a member is a
 * minor change, removing or repurposing one is breaking.
 */
export {
  contrastRatio,
  relativeLuminance,
  meetsFloor,
  ContrastFloor,
  type ContrastFloorName,
} from './contrast';

export {
  resolveElevationProfile,
  type ElevationProfile,
  type ElevationInput,
} from './elevation-profile';

export {
  surfaceStyle,
  type SurfaceTreatment,
  type SurfaceOptions,
  type ThemeName,
} from './surfaces';

export { resolveInk, type InkRole, type Palette } from './ink';

export {
  appearanceChangeEvents,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
  platformQueries,
  type AccessibilityQueries,
} from './accessibility';
