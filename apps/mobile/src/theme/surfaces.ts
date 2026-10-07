/**
 * Surface treatment recipes — contract C6, data-model §1.4 and §4.
 *
 * One view carries both shadows. React Native's `boxShadow` accepts an array of
 * composed shadow values, which is exactly the two-shadow neumorphic recipe, so
 * no wrapper view and no shadow library is needed (research R-001).
 *
 * Sign convention: positive `offsetY` moves the shadow DOWN, matching CSS.
 * Confirmed from the native implementations (RCTBoxShadow.mm,
 * OutsetBoxShadowDrawable.kt), NOT from the documentation page, which claims
 * the opposite — see research R-008.1.
 */
import type { ViewStyle } from 'react-native';

import {
  BorderHairline,
  Colors,
  Depth,
  LightSource,
  Radius,
  type DepthLevel,
} from '@/constants/theme';

import type { ElevationProfile } from './elevation-profile';

export type ThemeName = 'light' | 'dark';

export type SurfaceTreatment =
  /** Lifted out of the background. Cards, buttons, headers. */
  | 'raised'
  /** Pressed into it. Inputs, progress tracks, wells. */
  | 'recessed'
  /** Neither. Dense list rows, backgrounds. */
  | 'flat'
  /** Transient — held touch only. */
  | 'pressed'
  /** Operation in flight; rejects input. */
  | 'busy'
  /** Flat and inert; announced unavailable. */
  | 'disabled';

/** Opacity applied to a surface whose action is in flight. */
const BUSY_OPACITY = 0.6;
/** Opacity applied to an unavailable surface. */
const DISABLED_OPACITY = 0.45;

export interface SurfaceOptions {
  theme: ThemeName;
  profile: ElevationProfile;
  depth?: DepthLevel;
  radius?: keyof typeof Radius;
  /**
   * Whether this surface identifies an actionable control. Interactive surfaces
   * carry the compliant border; static ones stay borderless, which is what
   * preserves the soft look across most of the visible area (research R-002).
   *
   * Defaults to FALSE. It cannot be inferred from the treatment name: `raised`
   * describes a card just as often as a button, and guessing wrong puts a
   * visible 3:1 outline around every static panel — the opposite of the effect
   * this style exists to produce. Callers that ARE controls say so explicitly
   * (<PressableSurface>, <TextField>).
   */
  interactive?: boolean;
  /** FR-007 — recorded on the device but not yet synchronised. Composes. */
  pending?: boolean;
}

interface ShadowValue {
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  color: string;
  inset?: boolean;
}

/**
 * The two-shadow pair. `inset` flips it from raised to recessed; the offsets
 * themselves never change, because the light direction never changes (FR-005).
 */
function shadowPair(theme: ThemeName, depth: DepthLevel, inset: boolean): ShadowValue[] {
  const { offset, blur } = Depth[depth];
  const palette = Colors[theme];

  return [
    {
      offsetX: LightSource.x * offset,
      offsetY: LightSource.y * offset,
      blurRadius: blur,
      color: palette.shadowLight,
      inset,
    },
    {
      offsetX: -LightSource.x * offset,
      offsetY: -LightSource.y * offset,
      blurRadius: blur,
      color: palette.shadowDark,
      inset,
    },
  ];
}

/** Whether this treatment renders as pressed-in. */
function isRecessed(treatment: SurfaceTreatment): boolean {
  return treatment === 'recessed' || treatment === 'pressed';
}

/** Whether this treatment renders any shadow at all. */
function hasElevation(treatment: SurfaceTreatment): boolean {
  return treatment !== 'flat' && treatment !== 'disabled';
}

/**
 * Build the concrete style for a treatment under the current appearance.
 *
 * The profile decides HOW a treatment renders; it never decides WHICH treatment
 * was asked for. Call sites never branch on profile (contract C5).
 */
export function surfaceStyle(
  treatment: SurfaceTreatment,
  options: SurfaceOptions,
): ViewStyle {
  const {
    theme,
    profile,
    depth = 1,
    radius = 'md',
    interactive = false,
    pending,
  } = options;
  const palette = Colors[theme];
  const recessed = isRecessed(treatment);

  const base: ViewStyle = {
    backgroundColor:
      recessed && profile !== 'full' ? palette.surfaceSunk : palette.surface,
    borderRadius: Radius[radius],
  };

  // FR-009: interactive surfaces always carry a compliant border. In reduced
  // and flat profiles it does more work, so it uses the stronger tone.
  if (interactive) {
    base.borderWidth = BorderHairline;
    base.borderColor = profile === 'full' ? palette.border : palette.borderStrong;
  } else if (profile === 'flat' && hasElevation(treatment)) {
    // 004 D4-12 interim look. The profile is forced to `flat`, so the shadow that used to
    // separate a static card from the canvas is gone, and the Atlas canvas and surface
    // are nearly the same tone. Until phase 7 deletes this module, a non-interactive
    // surface that used to be shadowed carries a hairline in the palette's separator
    // colour (decorative, below 3:1 by design). Interactive surfaces keep their stronger
    // border above; dense rows and disabled surfaces were never shadowed.
    base.borderWidth = BorderHairline;
    base.borderColor = palette.separator;
  }

  if (profile !== 'flat' && hasElevation(treatment)) {
    if (profile === 'full') {
      base.boxShadow = shadowPair(theme, depth, recessed);
    } else if (!recessed) {
      // `reduced`: outset only. A recessed treatment falls back to the sunken
      // fill already applied above rather than to an undifferentiated rectangle.
      base.boxShadow = [shadowPair(theme, depth, false)[1]];
    }
  }

  if (treatment === 'busy') base.opacity = BUSY_OPACITY;
  if (treatment === 'disabled') base.opacity = DISABLED_OPACITY;

  // FR-007 composes rather than replacing: a pending card is still a card.
  if (pending) {
    base.borderWidth = BorderHairline;
    base.borderColor = palette.accent;
    base.borderStyle = 'dashed';
  }

  return base;
}
