/**
 * Opaque surfaces (feature 005, T562; FR-072, FR-073, SC-008).
 *
 * A control may be translucent by design: a tint over the paper in the dark themes (the
 * palette writes `accentTint` and its four siblings as 14 to 16 percent colours there), the
 * paper at 92 percent over the sky. When the traveller asks for increased contrast or for
 * reduced transparency, EVERY surface is opaque. This is the one place that decides it, so
 * no adapter reads the two flags to paint a fill.
 *
 *   useOpaqueSurfaces()        true under either flag
 *   solidOver(colour, ground)  the colour a translucent one comes to over `ground`
 *
 * The ground is the theme's `surface`: the colour the contrast gate measures every tint
 * over (P4), so the opaque tint is the very colour the gate vouches for. `useColors` reads it
 * in the same kit call as the colours it hands over, so it is the surface of the theme those
 * colours are painted in.
 */
import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import { blend } from '@/theme';

/** `#RRGGBBAA`, as the generated stylesheet writes a tint (lower case) or a token (upper). */
const WITH_ALPHA = /^#([0-9a-f]{6})([0-9a-f]{2})$/i;

/** Increased contrast or reduced transparency: nothing translucent may be drawn. */
export function useOpaqueSurfaces(): boolean {
  const { prefersLessTransparency, prefersMoreContrast } = useAccessibilityFlags();
  return prefersLessTransparency || prefersMoreContrast;
}

/**
 * `colour` laid over `ground` as an opaque `#RRGGBB`. A colour that has no alpha byte (an
 * opaque token, the grey of a test double) comes back unchanged.
 */
export function solidOver(colour: string, ground: string): string {
  const match = WITH_ALPHA.exec(colour);
  if (match === null) return colour;
  return blend(`#${match[1]}`, ground, parseInt(match[2], 16) / 255).toLowerCase();
}
