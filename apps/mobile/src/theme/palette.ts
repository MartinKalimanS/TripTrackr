/**
 * The Sunrise Passport palette — feature 005 data-model section 1, contracts C5-1, C5-3
 * and C5-5 (the resolver is unchanged from 004 C4-4).
 *
 * The values live in `palette.data.js` (plain data, so the theme generator can read them
 * under plain Node; see that file for why). This module gives them their types and the
 * one resolver that maps the device appearance onto a theme name.
 *
 * Two names are in play and they are different: `ThemeName` is the DEVICE scheme (two
 * values), `PaletteName` is the theme the app paints (four: the scheme plus increased
 * contrast).
 */
import data from './palette.data';

/** The device colour scheme. */
export type ThemeName = 'light' | 'dark';

export type PaletteName = 'light' | 'dark' | 'light-contrast' | 'dark-contrast';

/** In the order the generated stylesheet and the gate list them. */
export const PaletteNames: readonly PaletteName[] = Object.freeze([
  'light',
  'dark',
  'light-contrast',
  'dark-contrast',
]);

/**
 * One theme's colours. Hex strings: `#RRGGBB`, except tints, scrims and alpha lines, which
 * may be `#RRGGBBAA` (C5-1). The gate (`test/theme/contrast-gate.test.ts`) measures every
 * pair class of C5-4 over these in all four themes.
 *
 * Kit variable mapping (C5-6): `surfaceSecondary` is the field fill, the segment track and
 * the neutral `--default` fill; `border` is the field border; `pressed` is the kit's
 * `--surface-tertiary`; `hairline` is its `--separator`.
 */
export interface Palette {
  // Surfaces
  /** Behind sheets. */
  canvas: string;
  /** "Paper": screens, sheets, cards. */
  surface: string;
  /** "Cream": tiles, fields, raised rows (needs a hairline). */
  surfaceSecondary: string;
  /** Decorative only: dashes, perforation, tracks. Gate-exempt as a boundary. */
  sand: string;
  /** Sheets and menus (= `surface`). */
  overlay: string;
  /** Pressed fill. Only `ink` text sits on it (finding M-4). */
  pressed: string;
  // Lines
  /** Decorative divider and card edge; an explicit boundary in the contrast themes. */
  hairline: string;
  /** Sheet handle, a graphic at 3:1. */
  grab: string;
  /** Field boundary, 3:1. */
  border: string;
  /**
   * Focus ring colour. Drawn 2.5 dp wide, `FocusRing.offset` dp off the control, so it
   * needs 3:1 on the neutral fills it touches (canvas, surface, cream), not on an accent fill.
   */
  focus: string;
  /** Scrim behind form sheets (translucent). Gate-exempt. */
  backdrop: string;
  // Ink
  ink: string;
  /** Secondary text ("ink-2"). */
  muted: string;
  /** Tertiary text and the placeholder ("ink-3"). */
  subtle: string;
  /** Label on an `ink` fill (a selected chip, segment or day). */
  onInk: string;
  // Coral: the one thing to do, and "now"
  /** Primary fill. Below 3:1 on white in `light` and `light-contrast`: pinned, with an edge ring. */
  accent: string;
  /** Label on the accent fill: navy, never white. */
  accentInk: string;
  accentPress: string;
  /** Graphic at 3:1: the edge ring, the active node, bars, arcs. */
  accentLine: string;
  /** Coral as text or an icon. */
  accentText: string;
  /** Soft chip fill. */
  accentTint: string;
  // Aqua: water and "only you"
  /** Fills only (2.0:1 on white: never text or a line). */
  aqua: string;
  aquaLine: string;
  aquaInk: string;
  aquaTint: string;
  // Amber: planned
  /** Fill or ring on photographs. */
  amber: string;
  /** Planned graphic on paper. */
  amberLine: string;
  /** Planned text on its tint. */
  amberInk: string;
  amberTint: string;
  // States
  /** Text, an icon, or a fill under `dangerInk`. */
  danger: string;
  dangerInk: string;
  dangerTint: string;
  /** Text and icon ("success ink"). */
  success: string;
  successTint: string;
  // Trip status and sync (kept keys, new values; aliases of C5-3)
  /** = `accentLine`. */
  statusActive: string;
  /** = `amberLine`. */
  statusPlanning: string;
  /** = `amberInk`. */
  statusPlanningInk: string;
  /** = `muted`. */
  statusPast: string;
  /** Pending-synchronisation marker ink (= `amberInk`). */
  pending: string;
  /** = `ink`, underlined; coral is never a link. */
  link: string;
  /** = `subtle`. */
  placeholder: string;
  // Over photographs (theme-aware where the prototype is)
  /** Always `#FFFFFF`, opaque. */
  onPhoto: string;
  /** The floating icon button's disc. */
  scrimButton: string;
  scrimButtonLine: string;
  /** Roundel and avatar ring. */
  ring: string;
  // Skeleton and toast
  skeleton: string;
  skeletonHighlight: string;
  /** Dark in every theme; its action is `accentPress`. */
  toastSurface: string;
  toastInk: string;
  // Stamp inks and generated-cover stops (theme-aware, C5-3)
  stampCoral: string;
  stampNavy: string;
  stampTeal: string;
  stampGreen: string;
  cover1Start: string;
  cover1End: string;
  cover2Start: string;
  cover2End: string;
  cover3Start: string;
  cover3End: string;
}

/**
 * Every key of `Palette`, derived from the palette data (the keys of the first theme, in
 * data order), so there is no second list to keep in step with it. Two checks stand
 * behind it: `Palettes` below fails to compile when the data lacks a `Palette` key, and
 * `test/theme/palette.test.ts` compares this list with the data-model section 1 keys,
 * written out independently, so a key added to the data without the spec is caught.
 */
export const PaletteKeys: readonly (keyof Palette)[] = Object.freeze(
  Object.keys(data.light) as (keyof Palette)[],
);

/** The four palettes, deeply frozen. Assigning from the data fails to compile on a missing key. */
export const Palettes: Readonly<Record<PaletteName, Readonly<Palette>>> = data;

/**
 * Contract C4-4 (inherited by C5-5): the device scheme plus the increased-contrast
 * preference selects the theme. The root layout hands this to `Uniwind.setTheme`; nothing
 * else sets the theme.
 */
export function resolvePaletteName(
  scheme: ThemeName,
  prefersMoreContrast: boolean,
): PaletteName {
  return prefersMoreContrast ? `${scheme}-contrast` : scheme;
}
