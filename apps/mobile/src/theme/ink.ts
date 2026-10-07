/**
 * Text colour resolution under increased contrast — FR-013.
 *
 * The muted tone of the two-theme `Colors` can sit below the AAA floor of 7:1 that
 * FR-013 demands when a traveller asks for more contrast (light muted is about 6.4:1).
 * Rather than darkening the token — which would push it past its design intent for
 * every traveller — the muted role is PROMOTED to primary ink for the people who
 * asked for it. The hierarchy is lost; the legibility is not. That is the right
 * trade in that direction and the wrong one in the other.
 *
 * Feature 004 solves this properly for migrated screens: the `light-contrast` and
 * `dark-contrast` palettes carry their own muted tone at 7:1 or more. This helper
 * serves the screens that still read `Colors` until phase 7.
 */
import type { Colors } from '@/constants/theme';

/** The two-theme legacy colour keys; the Atlas `Palette` lives in `./palette`. */
export type InkPalette = (typeof Colors)['light'] | (typeof Colors)['dark'];

export type InkRole = 'primary' | 'muted';

export function resolveInk(
  palette: InkPalette,
  role: InkRole,
  prefersMoreContrast: boolean,
): string {
  if (role === 'primary') return palette.textPrimary;
  return prefersMoreContrast ? palette.textPrimary : palette.textMuted;
}
