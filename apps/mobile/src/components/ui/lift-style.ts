/**
 * The lift of a floating control as a style (feature 005, T519 and T520; design-tokens
 * C5-8): `boxShadow` from the `Lift` token of the active theme, with the `elevation`
 * fallback below Android 9 (a device check, `LiftElevation`). Shared by the icon buttons and
 * the sync chip so the two cannot drift. A hairline edge is drawn with the lift by the
 * caller; no other shadow exists.
 */
import { Platform, type ViewStyle } from 'react-native';

import { LiftElevation, liftOf, type LiftName, type PaletteName } from '@/theme';

/** Android 9 is API level 28: the first that draws an outset `boxShadow`. */
const ANDROID_BOX_SHADOW = 28;

export function liftStyle(theme: PaletteName, name: LiftName = 'lift1'): ViewStyle {
  const legacyAndroid =
    Platform.OS === 'android' && Number(Platform.Version) < ANDROID_BOX_SHADOW;
  return legacyAndroid
    ? { elevation: LiftElevation[name] }
    : { boxShadow: liftOf(theme, name) };
}
