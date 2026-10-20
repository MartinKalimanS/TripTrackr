/**
 * Media frame — contract C12, FR-024 through FR-026.
 *
 * The style FRAMES the globe, street view, and photographs; it never covers
 * them. This component exists so that "put a border round the picture" and "put
 * a shadow across the picture" cannot be confused at a call site: there is only
 * one way to wrap media, and it is incapable of casting anything inward.
 */
import { View, type ViewProps } from 'react-native';

import { BorderHairline, Radius } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

export type MediaFrameProps = ViewProps & {
  radius?: keyof typeof Radius;
};

export function MediaFrame({ radius = 'md', style, ...rest }: MediaFrameProps) {
  // The edge is the active theme's `border`, increased contrast included.
  const { tokens } = useAppearance();

  return (
    <View
      style={[
        {
          // No backgroundColor, no boxShadow, no opacity: nothing is drawn
          // between the traveller and the content (FR-024).
          borderRadius: Radius[radius],
          // FR-026 — a near-white photo on the light canvas needs an edge.
          borderWidth: BorderHairline,
          borderColor: tokens.border,
          // Keeps the image inside the frame's corners rather than spilling
          // square corners over a rounded border.
          overflow: 'hidden',
        },
        style,
      ]}
      {...rest}
    />
  );
}
