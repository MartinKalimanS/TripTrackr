import { View, type ViewProps } from 'react-native';

import { ThemeColor, type DepthLevel, type Radius } from '@/constants/theme';
import { useSurface } from '@/hooks/use-surface';
import { useTheme } from '@/hooks/use-theme';
import type { SurfaceTreatment } from '@/theme/surfaces';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
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
  // Destructured only so they are not spread onto the native View.
  lightColor: _lightColor,
  darkColor: _darkColor,
  type,
  treatment,
  depth = 1,
  radius = 'md',
  pending = false,
  ...otherProps
}: ThemedViewProps) {
  const theme = useTheme();
  const surface = useSurface(treatment ?? 'flat', { depth, radius, pending });

  if (treatment || pending) {
    return <View style={[surface, style]} {...otherProps} />;
  }

  return (
    <View
      style={[{ backgroundColor: theme[type ?? 'background'] }, style]}
      {...otherProps}
    />
  );
}
