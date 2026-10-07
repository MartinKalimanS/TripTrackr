/**
 * The Atlas palette as plain data - the ONE place a colour is authored (004 C4-1, D4-04).
 *
 * Why plain JavaScript and not TypeScript: three consumers read this file.
 *
 *   1. `palette.ts` (the typed API for the app, the navigation theme and the gate),
 *   2. `scripts/build-theme-css.mjs`, which runs under plain Node with no build step
 *      and no new dependency, and writes `generated/theme.css` for the kit,
 *   3. the Jest gate, through `palette.ts`.
 *
 * A TypeScript file cannot be `import`ed by plain Node, and a second hand-kept copy
 * is exactly the drift D4-04 exists to prevent. CommonJS `module.exports` is read by
 * Node (ESM `import` interop), Metro, Jest and `tsc` (`allowJs`) alike. The shape is
 * enforced by `palette.ts` (a `Record<PaletteName, Palette>` assignment fails to
 * compile when a key is missing) and by `test/theme/palette.test.ts`.
 *
 * Every value is hex, uppercase: `#RRGGBB`, except `backdrop`, a scrim, which is
 * `#RRGGBBAA` by design. Hex keeps `contrastRatio(hex, hex)` and the whole gate valid.
 *
 * Values are MEASURED, never chosen by eye: `test/theme/palette-gate.test.ts` measures
 * every pair of contract C4-3 in all four themes on each run. Retune a colour freely;
 * never retune a floor. Where a value differs from the starting point recorded in
 * research D4-01 the reason is beside it.
 *
 * @typedef {{
 *   canvas: string, surface: string, surfaceSecondary: string, surfaceTertiary: string,
 *   overlay: string, separator: string, backdrop: string,
 *   ink: string, muted: string, placeholder: string,
 *   accent: string, accentInk: string, link: string, border: string, focus: string,
 *   danger: string, dangerInk: string, success: string, successInk: string,
 *   warning: string, warningInk: string,
 *   statusPlanning: string, statusPlanningInk: string, statusActive: string,
 *   statusPast: string, pending: string,
 * }} PaletteColours
 */

/** @type {PaletteColours} */
const light = {
  canvas: '#F5F2EB',
  surface: '#FEFDFB',
  // Field fill, segment track and the neutral `--default` fill.
  surfaceSecondary: '#EFEBE2',
  surfaceTertiary: '#E8E4DA',
  overlay: '#FEFDFB',
  separator: '#E4DFD3',
  backdrop: '#111B2866',
  ink: '#111B28',
  // Research D4-01 had #525C69. Darkened so muted text still clears 4.5:1 on a PRESSED
  // tertiary fill (10% ink over #E8E4DA) with the 0.1 blend tolerance.
  muted: '#4F5966',
  placeholder: '#505A67',
  accent: '#2456C7',
  // Research D4-01 had #FFFFFF; base themes use no pure white (data-model section 1).
  accentInk: '#FEFDFB',
  link: '#2456C7',
  border: '#7E8792',
  // Near-black: it is the only luminance that clears 3:1 on canvas, surface, field fill
  // AND the accent fill at once (see palette-gate.test.ts, focus ring).
  focus: '#03060B',
  danger: '#B71A18',
  dangerInk: '#FEFDFB',
  // Research D4-01 had #00713E, which is 4.42:1 on its own 15% chip over canvas.
  success: '#006B3A',
  successInk: '#FEFDFB',
  // Amber text must be the darker planning ink, not the arc colour (D4-01).
  warning: '#854E00',
  warningInk: '#FEFDFB',
  statusPlanning: '#9A5B00',
  statusPlanningInk: '#854E00',
  statusActive: '#2456C7',
  // Research D4-01 had #5F6773, which is 4.21:1 on its own 15% chip over canvas.
  statusPast: '#585F69',
  pending: '#6B46C1',
};

/** @type {PaletteColours} */
const dark = {
  canvas: '#091018',
  surface: '#141B25',
  surfaceSecondary: '#1C2530',
  surfaceTertiary: '#212A37',
  // The highest elevation is the lightest in a dark theme; it is also the selected
  // segment, which must read lighter than the `surfaceSecondary` track.
  overlay: '#212A37',
  separator: '#222B37',
  backdrop: '#04080E99',
  ink: '#F4F1EC',
  muted: '#A3ACB8',
  placeholder: '#A3ACB8',
  // Research D4-01 had #7FA8FF. No focus ring can clear 3:1 on the canvas, the field
  // fill AND a #7FA8FF fill at once (that needs 9:1 between accent and canvas, and
  // more because of the field fill); a pale cobalt does. The globe keeps #7FA8FF
  // through `statusActive`.
  accent: '#B9CFFF',
  accentInk: '#091018',
  link: '#B9CFFF',
  border: '#6B7583',
  focus: '#6C727E',
  danger: '#F7857D',
  dangerInk: '#091018',
  success: '#65C98C',
  successInk: '#091018',
  warning: '#F2B45C',
  warningInk: '#091018',
  statusPlanning: '#F2B45C',
  statusPlanningInk: '#F2B45C',
  statusActive: '#7FA8FF',
  statusPast: '#9CA5B1',
  pending: '#B9A4F5',
};

/** @type {PaletteColours} */
const lightContrast = {
  canvas: '#FAF8F3',
  surface: '#FEFEFC',
  surfaceSecondary: '#F2EFE8',
  surfaceTertiary: '#EAE6DD',
  overlay: '#FEFEFC',
  // Still decorative (below 3:1), but visible to a low-vision traveller.
  separator: '#BDB6A8',
  backdrop: '#0A111B99',
  ink: '#0A111B',
  muted: '#353D48',
  placeholder: '#353D48',
  // Research D4-01 had #173F99. A focus ring needs the accent at least 9:1 from the
  // canvas to sit between them; this navy leaves room for a mid-tone ring.
  accent: '#12307F',
  accentInk: '#FEFEFC',
  link: '#12307F',
  border: '#4A525C',
  focus: '#7F8591',
  // Research D4-01 had #8F1210, 6.60:1 on its own 15% chip over canvas (7:1 needed).
  danger: '#85110F',
  dangerInk: '#FEFEFC',
  success: '#004E2A',
  successInk: '#FEFEFC',
  warning: '#5C3700',
  warningInk: '#FEFEFC',
  statusPlanning: '#7A4800',
  statusPlanningInk: '#5C3700',
  statusActive: '#12307F',
  statusPast: '#3D4550',
  pending: '#4B2E96',
};

/** @type {PaletteColours} */
const darkContrast = {
  canvas: '#05090E',
  surface: '#0D131B',
  surfaceSecondary: '#151D27',
  surfaceTertiary: '#1B2531',
  overlay: '#1B2531',
  separator: '#364150',
  backdrop: '#02050AB3',
  ink: '#FBFAF7',
  muted: '#C6CDD6',
  placeholder: '#C6CDD6',
  // Research D4-01 had #A9C5FF; see the dark accent above.
  accent: '#D2E1FF',
  accentInk: '#05090E',
  link: '#D2E1FF',
  border: '#A3ACB8',
  focus: '#6E7480',
  danger: '#FFB1AA',
  dangerInk: '#05090E',
  success: '#8FE3B0',
  successInk: '#05090E',
  warning: '#FFD08A',
  warningInk: '#05090E',
  statusPlanning: '#FFC978',
  statusPlanningInk: '#FFD08A',
  statusActive: '#A9C5FF',
  statusPast: '#C0C8D2',
  pending: '#D2C4FA',
};

/**
 * @template T
 * @param {T} value
 * @returns {Readonly<T>}
 */
function freeze(value) {
  return Object.freeze(value);
}

module.exports = freeze({
  light: freeze(light),
  dark: freeze(dark),
  'light-contrast': freeze(lightContrast),
  'dark-contrast': freeze(darkContrast),
});
