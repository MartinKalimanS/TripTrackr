/**
 * The Atlas palette — data-model section 1, contract C4-1 and C4-4.
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
 * One theme's colours. Hex strings; `backdrop` alone is `#RRGGBBAA` (a scrim).
 *
 * `surfaceSecondary` is the field fill, the segment track and the neutral `--default`
 * fill, and `border` is the field border: the kit's `--field-background` and
 * `--field-border` are mapped from them, so the palette needs no separate keys.
 */
export interface Palette {
  // Neutral ramp
  /** App background (grouped-list ground). */
  canvas: string;
  /** Cards and rows. */
  surface: string;
  /** Field fill, segment track, neutral buttons. */
  surfaceSecondary: string;
  /** Pressed fill, skeleton base. */
  surfaceTertiary: string;
  /** Sheets, menus; also the selected segment. */
  overlay: string;
  /** Decorative hairline. Gate-exempt. */
  separator: string;
  /** Scrim behind sheets (translucent). Gate-exempt. */
  backdrop: string;
  // Ink
  /** Primary text. */
  ink: string;
  /** Secondary text, chevrons. */
  muted: string;
  /** Field placeholder. */
  placeholder: string;
  // Accent and states
  accent: string;
  /** Label on an accent fill. */
  accentInk: string;
  link: string;
  /** 3:1 boundary for fields and outlined controls. */
  border: string;
  /**
   * Focus ring colour. Drawn `FocusRing.offset` dp off the control, so it needs 3:1 on
   * the neutral fills it touches (canvas, surface, field fill), not on an accent fill.
   */
  focus: string;
  danger: string;
  /** Label on a danger fill. */
  dangerInk: string;
  success: string;
  /** Label on a success fill. */
  successInk: string;
  warning: string;
  /** Label on a warning fill. */
  warningInk: string;
  // Trip status (shared with the globe's connection hues)
  statusPlanning: string;
  /** Chip label; darker than the arc in light themes. */
  statusPlanningInk: string;
  statusActive: string;
  statusPast: string;
  // Sync
  /** Pending-synchronisation marker (icon and text). */
  pending: string;
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
 * Contract C4-4: the device scheme plus the increased-contrast preference selects the
 * theme. The root layout hands this to `Uniwind.setTheme`; nothing else sets the theme.
 */
export function resolvePaletteName(
  scheme: ThemeName,
  prefersMoreContrast: boolean,
): PaletteName {
  return prefersMoreContrast ? `${scheme}-contrast` : scheme;
}
