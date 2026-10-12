/**
 * The Sunrise Passport palette as plain data - the ONE place a colour is authored (004 C4-1,
 * D4-04; feature 005 contract C5-3, data-model section 1).
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
 * Every value is hex, uppercase: `#RRGGBB`, except tints, scrims and alpha lines, which
 * are `#RRGGBBAA` (a light tint is an opaque colour; a dark tint is an alpha wash over the
 * ground). Hex keeps `contrastRatio(hex, hex)` and `blend` valid; the gate flattens an
 * alpha colour over its ground before it measures it.
 *
 * Values are MEASURED, never chosen by eye: `test/theme/contrast-gate.test.ts` measures
 * every pair of contract C5-4 in all four themes on each run. Retune a colour freely;
 * never retune a floor. Where a value differs from the contract's starting table (C5-3)
 * the reason is beside it, and `contracts/design-tokens.md` records it.
 *
 * The aliases of C5-3 (`link`, `placeholder`, `overlay`, `statusActive`, `statusPlanning`,
 * `statusPlanningInk`, `statusPast`, `pending`) have no value of their own: they are
 * resolved from the key they equal, so they cannot drift (gate class P21 asserts it).
 *
 * @typedef {import('./palette').Palette} PaletteColours
 */

/**
 * The authored keys of one theme, in data-model order, then the aliases resolved from them.
 *
 * @param {Omit<PaletteColours, 'link' | 'placeholder' | 'overlay' | 'statusActive'
 *   | 'statusPlanning' | 'statusPlanningInk' | 'statusPast' | 'pending'>} own
 * @returns {PaletteColours}
 */
function withAliases(own) {
  return {
    ...own,
    link: own.ink,
    placeholder: own.subtle,
    overlay: own.surface,
    statusActive: own.accentLine,
    statusPlanning: own.amberLine,
    statusPlanningInk: own.amberInk,
    statusPast: own.muted,
    pending: own.amberInk,
  };
}

/** Sunrise: white paper, warm cream, navy ink, coral for the one thing to do. */
const light = withAliases({
  canvas: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#FFF1E3',
  sand: '#EBDCC9',
  pressed: '#EBDCC9',
  hairline: '#0E2A471F',
  grab: '#0E2A4785',
  border: '#6B7D93',
  focus: '#D93A2E',
  backdrop: '#081A3057',
  ink: '#0E2A47',
  muted: '#4A5B6E',
  subtle: '#566779',
  onInk: '#FFFFFF',
  // The coral fill is 2.82:1 on white (D5-22, M-1): the primary control carries an edge
  // ring in `accentLine` and its label is navy, never white (M-2). Pinned by the gate.
  accent: '#FF6B4A',
  accentInk: '#0E2A47',
  accentPress: '#FF8466',
  accentLine: '#E04A33',
  accentText: '#B92A1D',
  accentTint: '#FFE9E1',
  aqua: '#35C9D6',
  aquaLine: '#1A8FA0',
  aquaInk: '#0B6F7C',
  aquaTint: '#DDF6F8',
  amber: '#FFB547',
  amberLine: '#B86E00',
  amberInk: '#8A5200',
  amberTint: '#FFF0D1',
  danger: '#9F1239',
  dangerInk: '#FFFFFF',
  dangerTint: '#FDE8EE',
  success: '#0D6B4C',
  successTint: '#DDF4E8',
  onPhoto: '#FFFFFF',
  // Raised from the prototype's .46 to .50 (M-5): a white icon on it is 3.41:1 over a
  // white photograph, 3.03:1 at .46.
  scrimButton: '#09182B80',
  scrimButtonLine: '#FFFFFF42',
  ring: '#FFFFFF',
  skeleton: '#F3E8DA',
  skeletonHighlight: '#FFB54729',
  toastSurface: '#0E2A47',
  toastInk: '#FFFFFF',
  stampCoral: '#B92A1D',
  stampNavy: '#1D3F73',
  stampTeal: '#0B7280',
  stampGreen: '#2A7250',
  cover1Start: '#0E2A47',
  cover1End: '#0F4C5C',
  cover2Start: '#8E2417',
  cover2End: '#C0471F',
  cover3Start: '#0B6F7C',
  cover3End: '#0E2A47',
});

/** Nightfall: deep navy paper, the same coral, lifted for the dark. */
const dark = withAliases({
  canvas: '#0A1626',
  surface: '#0F2037',
  surfaceSecondary: '#182E4A',
  sand: '#2B4466',
  pressed: '#2B4466',
  hairline: '#FFFFFF24',
  grab: '#FFFFFF66',
  border: '#7A90AB',
  focus: '#FFB4A0',
  backdrop: '#081A3057',
  ink: '#F4F7FB',
  muted: '#A4B3C4',
  subtle: '#93A5BA',
  onInk: '#0A1626',
  accent: '#FF8266',
  accentInk: '#0A1626',
  accentPress: '#FF9A80',
  accentLine: '#FF8266',
  accentText: '#FFA08C',
  accentTint: '#FF826629',
  aqua: '#35C9D6',
  aquaLine: '#46D5E0',
  aquaInk: '#5FDCE6',
  aquaTint: '#46D5E024',
  amber: '#FFC25E',
  amberLine: '#FFC25E',
  amberInk: '#FFC25E',
  amberTint: '#FFC25E29',
  danger: '#FF8FA8',
  dangerInk: '#0A1626',
  dangerTint: '#FF8FA824',
  success: '#55DDA8',
  successTint: '#55DDA824',
  onPhoto: '#FFFFFF',
  scrimButton: '#09182B8F',
  scrimButtonLine: '#FFFFFF42',
  ring: '#F4F7FB',
  skeleton: '#1F3756',
  skeletonHighlight: '#FFC25E1A',
  toastSurface: '#20395A',
  toastInk: '#F4F7FB',
  stampCoral: '#FF9A86',
  stampNavy: '#8FB4E8',
  stampTeal: '#5FDCE6',
  stampGreen: '#7DE8BC',
  cover1Start: '#0E2A47',
  cover1End: '#0F4C5C',
  cover2Start: '#8E2417',
  cover2End: '#C0471F',
  cover3Start: '#0B6F7C',
  cover3End: '#0E2A47',
});

/** Sunrise, increased contrast: text at 7:1, boundaries explicit, a darker line and ink. */
const lightContrast = withAliases({
  canvas: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceSecondary: '#FFF1E3',
  sand: '#D9C3A6',
  pressed: '#D9C3A6',
  hairline: '#06162980',
  grab: '#061629B3',
  border: '#3D4F63',
  focus: '#061629',
  backdrop: '#081A3057',
  ink: '#061629',
  muted: '#2B3B4F',
  subtle: '#3D4F63',
  onInk: '#FFFFFF',
  // Lighter, not darker (M-1): the navy label gains contrast (7.57:1). The fill is
  // 2.40:1 on white, so the ring (2 dp, `accentLine` 7.11:1) carries the boundary.
  accent: '#FF8466',
  accentInk: '#061629',
  accentPress: '#FF9A80',
  accentLine: '#A82618',
  // Contract C5-3 had #8F1D12. Darkened so the accent word on the warmest sky glow holds
  // the 7:1 floor of the contrast themes (6.47:1 -> 7.24:1; white 9.98:1).
  accentText: '#821A10',
  accentTint: '#FFE9E1',
  aqua: '#35C9D6',
  aquaLine: '#08606B',
  aquaInk: '#064F59',
  aquaTint: '#DDF6F8',
  amber: '#FFB547',
  amberLine: '#7A4800',
  amberInk: '#6E4200',
  amberTint: '#FFF0D1',
  danger: '#7F0F2B',
  dangerInk: '#FFFFFF',
  dangerTint: '#FDE8EE',
  success: '#0A5A3F',
  successTint: '#DDF4E8',
  onPhoto: '#FFFFFF',
  scrimButton: '#061222A8',
  scrimButtonLine: '#FFFFFF8C',
  ring: '#FFFFFF',
  skeleton: '#F3E8DA',
  skeletonHighlight: '#FFB54729',
  toastSurface: '#0E2A47',
  toastInk: '#FFFFFF',
  stampCoral: '#B92A1D',
  stampNavy: '#1D3F73',
  stampTeal: '#0B7280',
  stampGreen: '#2A7250',
  cover1Start: '#0E2A47',
  cover1End: '#0F4C5C',
  // White on #C0471F is 5.05:1 and on #0B6F7C 5.87:1, below the 7:1 floor of this theme.
  cover2Start: '#8E2417',
  cover2End: '#8E2417',
  cover3Start: '#08606B',
  cover3End: '#0E2A47',
});

/** Nightfall, increased contrast. */
const darkContrast = withAliases({
  canvas: '#0A1626',
  surface: '#0F2037',
  surfaceSecondary: '#182E4A',
  sand: '#4A6688',
  // Its own darker value (M-4): `ink` on the base `sand` would be 5.92:1; here it is 9.90:1.
  pressed: '#2B4466',
  hairline: '#FFFFFF66',
  grab: '#FFFFFFB3',
  border: '#B8C5D6',
  focus: '#FFFFFF',
  backdrop: '#081A3057',
  ink: '#FFFFFF',
  muted: '#D3DCE8',
  subtle: '#B8C5D6',
  onInk: '#0A1626',
  accent: '#FF9A82',
  accentInk: '#0A1626',
  accentPress: '#FFB09C',
  accentLine: '#FFA690',
  accentText: '#FFC4B4',
  accentTint: '#FF826629',
  aqua: '#35C9D6',
  aquaLine: '#5FDCE6',
  aquaInk: '#8EE8EF',
  aquaTint: '#46D5E024',
  amber: '#FFC25E',
  amberLine: '#FFD27F',
  // Contract C5-3 had #FFD27F, #FFB3C4 and #7DE8BC. A soft chip over cream (a tint wash
  // over `surfaceSecondary`) measured 6.77:1, 6.38:1 and 6.72:1, below the 7:1 floor; each
  // is lightened toward white until it clears it (7.31:1, 7.29:1, 7.23:1 on the chip).
  amberInk: '#FFDC99',
  amberTint: '#FFC25E29',
  danger: '#FFC6D3',
  dangerInk: '#0A1626',
  dangerTint: '#FF8FA824',
  success: '#94EDC8',
  successTint: '#55DDA824',
  onPhoto: '#FFFFFF',
  scrimButton: '#09182B8F',
  scrimButtonLine: '#FFFFFF42',
  ring: '#F4F7FB',
  skeleton: '#1F3756',
  skeletonHighlight: '#FFC25E1A',
  // Darker than the base toast so the action reads 10.33:1 (#0A1626).
  toastSurface: '#0A1626',
  toastInk: '#FFFFFF',
  stampCoral: '#FF9A86',
  stampNavy: '#8FB4E8',
  stampTeal: '#5FDCE6',
  stampGreen: '#7DE8BC',
  cover1Start: '#0E2A47',
  cover1End: '#0F4C5C',
  cover2Start: '#8E2417',
  cover2End: '#8E2417',
  cover3Start: '#08606B',
  cover3End: '#0E2A47',
});

module.exports = Object.freeze({
  light: Object.freeze(light),
  dark: Object.freeze(dark),
  'light-contrast': Object.freeze(lightContrast),
  'dark-contrast': Object.freeze(darkContrast),
});
