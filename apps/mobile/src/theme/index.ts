/**
 * Public surface of the token layer — contract C7.
 *
 * Token NAMES are stable. Token VALUES may be retuned provided the contrast
 * gate still passes.
 */
export {
  blend,
  contrastRatio,
  relativeLuminance,
  meetsFloor,
  ContrastFloor,
  type ContrastFloorName,
} from './contrast';

export {
  PaletteKeys,
  PaletteNames,
  Palettes,
  resolvePaletteName,
  type Palette,
  type PaletteName,
  type ThemeName,
} from './palette';

export {
  appearanceChangeEvents,
  readPrefersLessMotion,
  readPrefersLessTransparency,
  readPrefersMoreContrast,
  platformQueries,
  type AccessibilityQueries,
} from './accessibility';

export {
  TextRoleNames,
  TextRoles,
  numericStyle,
  textStyle,
  type FontFamilyRole,
  type FontWeight,
  type TextRole,
  type TextSize,
  type TextStyleToken,
} from './typography';

export {
  AtlasRadius,
  AtlasSpacing,
  FocusRing,
  cornerStyle,
  type AtlasRadiusName,
  type AtlasSpacingName,
} from './shape';

export {
  Motion,
  MotionProperties,
  isMotionProperty,
  motionDuration,
  type MotionName,
  type MotionProperty,
} from './motion';

export { deepFreeze, type DeepReadonly } from './freeze';
