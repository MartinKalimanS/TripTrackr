/**
 * Text colour resolution under increased contrast — FR-013.
 *
 * The muted tone clears AA (6.03:1 light, 6.60:1 dark) but not the AAA floor of
 * 7:1 that FR-013 demands when a traveller asks for more contrast. Rather than
 * darkening the token — which would push it past its design intent for every
 * traveller — the muted role is PROMOTED to primary ink for the people who
 * asked for it. The hierarchy is lost; the legibility is not. That is the right
 * trade in that direction and the wrong one in the other.
 */
import type { Colors } from '@/constants/theme';

export type Palette = (typeof Colors)['light'] | (typeof Colors)['dark'];

export type InkRole = 'primary' | 'muted';

export function resolveInk(
  palette: Palette,
  role: InkRole,
  prefersMoreContrast: boolean,
): string {
  if (role === 'primary') return palette.textPrimary;
  return prefersMoreContrast ? palette.textPrimary : palette.textMuted;
}
