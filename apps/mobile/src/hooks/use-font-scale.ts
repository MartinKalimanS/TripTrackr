/**
 * `useFontScale()` - the text scale a control lays out at (feature 005, T524).
 *
 * The window's font scale, which is what `useWindowDimensions` reports, unless the dev
 * gallery has scoped an override (`appearance-override.ts`): then the scale it is showing.
 * A control repeated down a list (`Button`, `Tappable`, `AreaPill`) reads the scale from here
 * and not from `useAppearance`, which also subscribes to the colour scheme and the flags.
 */
import { useWindowDimensions } from 'react-native';

import { useAppearanceOverride } from '@/hooks/appearance-override';

export function useFontScale(): number {
  const { fontScale } = useWindowDimensions();
  const override = useAppearanceOverride();
  return override ? override.fontScale : fontScale;
}
