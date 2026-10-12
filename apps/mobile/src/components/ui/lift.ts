/**
 * The lift of a surface for the device scheme (feature 005; contract C5-8; FR-003, FR-027):
 * the ONLY shadow an adapter draws. There are two, `lift1` (a card, a tile) and `lift2` (the
 * action button, the pill, the sheet, the toast, a card over the map), and each theme has its
 * own: a navy contact shadow and a long soft one in the light themes, a hairline ring and a
 * tonal shadow in the dark ones (a shadow cannot read on navy). The two contrast themes share
 * the lifts of their base theme, so the device scheme is all that is needed to pick one.
 *
 * The mapping from a lift to a style, `boxShadow` with the `elevation` fallback below
 * Android 9, is `liftStyle` of `lift-style.ts` (T519, shared with the icon buttons and the
 * sync chip); this hook only adds the scheme and the "no lift" case. A surface cancels the
 * kit's own shadow (`shadow-none`) and takes this one in `style`, so a card never stacks two.
 *
 * `useLiftStyle` reads the colour scheme and nothing else: a card repeated down a list needs
 * no more from the appearance hook than that.
 */
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';
import type { LiftName } from '@/theme';

import { liftStyle } from './lift-style';

/** The lift for the device scheme, or `undefined` for a surface with none. */
export function useLiftStyle(name: LiftName | null): ViewStyle | undefined {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return useMemo(() => (name ? liftStyle(scheme, name) : undefined), [scheme, name]);
}
