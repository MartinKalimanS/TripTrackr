/**
 * The lift of a surface (feature 005; contract C5-8; FR-003, FR-027): the ONLY shadow an
 * adapter draws. There are two, `lift1` (a card, a tile) and `lift2` (the action button,
 * the pill, the tag, the sheet, the toast, a card over the map), and each theme has its own:
 * a navy contact shadow and a long soft one in the light themes, a hairline ring and a tonal
 * shadow in the dark ones (a shadow cannot read on navy). The two contrast themes share the
 * lifts of their base theme, so the device scheme is all that is needed to pick one.
 *
 * `boxShadow` is the New Architecture's, and an outset one needs Android 9 (API 28) or later;
 * below that the surface asks for the token's elevation instead (a starting value, a device
 * check). A surface cancels the kit's own shadow (`shadow-none`) and takes this one in
 * `style`, so a card never stacks two.
 *
 * `useLiftStyle` reads the colour scheme and nothing else: a card repeated down a list needs
 * no more from the appearance hook than that.
 */
import { useMemo } from 'react';
import { Platform, type ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LiftElevation, liftOf, type LiftName } from '@/theme';

/** Outset `boxShadow` is drawn from Android 9, which is API level 28. */
const BOX_SHADOW_API_LEVEL = 28;

export interface LiftPlatform {
  os: string;
  version: string | number;
}

function drawsBoxShadow({ os, version }: LiftPlatform): boolean {
  return os !== 'android' || Number(version) >= BOX_SHADOW_API_LEVEL;
}

/** The style of one lift on one scheme; a copy, so a caller may extend it. */
export function liftStyle(
  scheme: 'light' | 'dark',
  name: LiftName,
  platform: LiftPlatform = { os: Platform.OS, version: Platform.Version },
): ViewStyle {
  return drawsBoxShadow(platform)
    ? { boxShadow: liftOf(scheme, name) }
    : { elevation: LiftElevation[name] };
}

/** The lift for the device scheme, or `undefined` for a surface with none. */
export function useLiftStyle(name: LiftName | null): ViewStyle | undefined {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => (name ? liftStyle(scheme, name) : undefined), [scheme, name]);
}
