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
  CappableInContext,
  CappedFontScale,
  LegacyRoleMap,
  TextRoleNames,
  TextRoles,
  TypeRoleNames,
  TypeRoles,
  fontClassOf,
  maxFontScaleOf,
  numericStyle,
  textStyle,
  typeExtras,
  typeStyle,
  type FontFamilyRole,
  type FontWeight,
  type TextRole,
  type TextSize,
  type TextStyleToken,
  type TypeFamily,
  type TypeRole,
  type TypeSize,
  type TypeToken,
  type TypeWeight,
} from './typography';

export {
  AtlasRadius,
  AtlasSpacing,
  FocusRing,
  IconSize,
  IconWeights,
  Lift,
  LiftElevation,
  PrimaryEdgeRing,
  Radii,
  ScreenMargin,
  Space,
  cornerOf,
  cornerStyle,
  innerRadius,
  liftOf,
  type AtlasRadiusName,
  type AtlasSpacingName,
  type IconWeight,
  type LiftLayer,
  type LiftName,
  type RadiiName,
} from './shape';

export {
  Motion,
  MotionDurationNames,
  MotionProperties,
  isMotionProperty,
  motionDuration,
  pressScaleOf,
  springOf,
  type MotionDurationName,
  type MotionName,
  type MotionProperty,
  type Spring,
} from './motion';

export {
  CoverGlow,
  Passport,
  Scrim,
  Sky,
  colourAt,
  scrimSpec,
  withAlpha,
  type Glow,
  type GradientStop,
  type ScrimSpec,
  type ScrimStop,
  type SkySpec,
} from './scrim';

export { deepFreeze, type DeepReadonly } from './freeze';
