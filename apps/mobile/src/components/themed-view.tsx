import { View, type ViewProps } from 'react-native';

import { ThemeColor, type DepthLevel, type Radius } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { useSurface } from '@/hooks/use-surface';
import type { SurfaceTreatment } from '@/theme/surfaces';

export type ThemedViewProps = ViewProps & {
  /** A flat fill from the ramp. Defaults to the canvas. */
  type?: ThemeColor;
  /**
   * Neumorphic surface treatment (feature 002). When given, it supersedes
   * `type`: the treatment supplies the background as well as the depth, so
   * setting both would be two sources of truth for one colour.
   */
  treatment?: Extract<SurfaceTreatment, 'raised' | 'recessed' | 'flat'>;
  depth?: DepthLevel;
  radius?: keyof typeof Radius;
  /** FR-007 — recorded locally, not yet synchronised. Composes with `treatment`. */
  pending?: boolean;
};

export function ThemedView({
  style,
  type,
  treatment,
  depth = 1,
  radius = 'md',
  pending = false,
  ...otherProps
}: ThemedViewProps) {
  // Contract C4: the appearance resolver is the single subscription point. The
  // scaffold's `useTheme` read `useColorScheme` on its own, which is exactly the
  // second source of truth that lets one view lag a theme switch (FR-023).
  const { tokens } = useAppearance();
  const surface = useSurface(treatment ?? 'flat', { depth, radius, pending });

  if (treatment || pending) {
    return <View style={[surface, style]} {...otherProps} />;
  }

  return (
    <View
      style={[{ backgroundColor: tokens[type ?? 'canvas'] }, style]}
      {...otherProps}
    />
  );
}
