/**
 * Static surface primitive — contract C8.
 *
 * A screen declares what a thing IS; the treatment decides how it renders.
 * One view carries both shadows, so this adds no wrapper (research R-001).
 */
import { View, type ViewProps } from 'react-native';

import type { DepthLevel, Radius } from '@/constants/theme';
import { useSurface } from '@/hooks/use-surface';
import type { SurfaceTreatment } from '@/theme/surfaces';

export type SurfaceProps = ViewProps & {
  /** Static treatments only — interactive ones belong to <PressableSurface>. */
  treatment?: Extract<SurfaceTreatment, 'raised' | 'recessed' | 'flat'>;
  depth?: DepthLevel;
  radius?: keyof typeof Radius;
  /**
   * Override the border decision. Static surfaces are borderless by default,
   * which is what keeps most of the visible area soft (research R-002).
   */
  interactive?: boolean;
  /** FR-007 — recorded on the device but not yet synchronised. Composes. */
  pending?: boolean;
  /**
   * Content this surface FRAMES rather than decorates — map, globe, photo.
   * Suppresses every shadow so nothing is cast across the imagery (FR-024).
   */
  media?: boolean;
};

export function Surface({
  treatment = 'flat',
  depth = 1,
  radius = 'md',
  interactive = false,
  pending = false,
  media = false,
  style,
  ...rest
}: SurfaceProps) {
  const surface = useSurface(media ? 'flat' : treatment, {
    depth,
    radius,
    interactive,
    pending,
  });

  return <View style={[surface, style]} {...rest} />;
}
