/**
 * Treatment -> concrete style — contract C6.
 *
 * A screen declares what a thing IS. This decides how it renders under the
 * current theme, contrast preference, and device capability.
 */
import { useMemo } from 'react';
import type { ViewStyle } from 'react-native';

import type { DepthLevel, Radius } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';
import { surfaceStyle, type SurfaceTreatment } from '@/theme/surfaces';

export interface UseSurfaceOptions {
  depth?: DepthLevel;
  radius?: keyof typeof Radius;
  interactive?: boolean;
  /** FR-007 — recorded locally, not yet synchronised. Composes with any treatment. */
  pending?: boolean;
}

export function useSurface(
  treatment: SurfaceTreatment,
  options: UseSurfaceOptions = {},
): ViewStyle {
  const { theme, elevationProfile } = useAppearance();
  const { depth, radius, interactive, pending } = options;

  return useMemo(
    () =>
      surfaceStyle(treatment, {
        theme,
        profile: elevationProfile,
        depth,
        radius,
        interactive,
        pending,
      }),
    [treatment, theme, elevationProfile, depth, radius, interactive, pending],
  );
}
