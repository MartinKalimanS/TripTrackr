'use strict';

/**
 * The pure half of the theme generator (feature 004, contract C4-5, research D4-04; the
 * Sunrise variable map of feature 005, contract C5-6, research D5-02).
 *
 * `buildThemeCss(palettes)` turns the palette into the stylesheet the UI kit reads: a
 * pure function of its argument and of the variable map below. No I/O lives here, so the
 * CLI (`build-theme-css.mjs`) and the Jest sync test (`test/theme/theme-css-sync.test.ts`)
 * share ONE implementation: the test regenerates in memory and fails when the committed
 * file differs.
 *
 * Plain CommonJS on purpose, like `src/theme/palette.data.js`: plain Node reads it with
 * no build step and no dependency, and Jest, Metro and `tsc` (`allowJs`) read it too.
 *
 * Structure follows https://heroui.com/docs/native/getting-started/theming and
 * https://docs.uniwind.dev/theming/custom-themes.md: every theme under
 * `@layer theme { :root { @variant <name> { ... } } }`, every theme defining the SAME
 * variables (Uniwind warns in development when one is missing).
 */

/**
 * Every HeroUI Native colour variable and the palette key that supplies it. Neutral
 * foregrounds are all `ink`; `surfaceSecondary` doubles as the field fill and the
 * neutral `--default` fill, `overlay` as the selected segment, `border` as the field
 * border (see the `Palette` interface in `src/theme/palette.ts`).
 *
 * Sunrise (C5-6): the kit's `--surface-tertiary` (the pressed fill) reads `pressed`, its
 * `--separator` reads `hairline`, its `--link` reads `ink` (coral is never a link) and
 * `--accent` and `--accent-foreground` read the coral fill and its navy label. The kit
 * variables the palette has no key for take the closest measured one: `--success-foreground`
 * and `--warning-foreground` read `onInk` and `--warning` reads `amberInk` (all three
 * measured by the gate, class P5), so a kit component that uses them stays on tokens.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
const KIT_VARIABLES = [
  ['--background', 'canvas'],
  ['--foreground', 'ink'],
  ['--surface', 'surface'],
  ['--surface-foreground', 'ink'],
  ['--surface-secondary', 'surfaceSecondary'],
  ['--surface-secondary-foreground', 'ink'],
  ['--surface-tertiary', 'pressed'],
  ['--surface-tertiary-foreground', 'ink'],
  ['--overlay', 'overlay'],
  ['--overlay-foreground', 'ink'],
  ['--backdrop', 'backdrop'],
  ['--muted', 'muted'],
  ['--default', 'surfaceSecondary'],
  ['--default-foreground', 'ink'],
  ['--accent', 'accent'],
  ['--accent-foreground', 'accentInk'],
  ['--field-background', 'surfaceSecondary'],
  ['--field-foreground', 'ink'],
  ['--field-placeholder', 'placeholder'],
  ['--field-border', 'border'],
  ['--success', 'success'],
  ['--success-foreground', 'onInk'],
  ['--warning', 'amberInk'],
  ['--warning-foreground', 'onInk'],
  ['--danger', 'danger'],
  ['--danger-foreground', 'dangerInk'],
  ['--segment', 'overlay'],
  ['--segment-foreground', 'ink'],
  ['--border', 'border'],
  ['--separator', 'hairline'],
  ['--focus', 'focus'],
  ['--link', 'link'],
];

/**
 * The app's own variables: trip status and the pending marker (feature 004), then one for
 * every Sunrise key the kit has no variable for (C5-6). Each is also exposed to Tailwind as
 * `--color-<name>` in an `@theme inline static` block (the kit's own form,
 * `heroui-native/src/styles/theme.css`) so `bg-status-active`, `text-accent-text`,
 * `bg-cover1-start` and friends work. None may collide with a name the kit declares
 * (`test/theme/kit-variables.test.ts` reads the kit to check). The roundel ring is
 * `--photo-ring`: a bare `--ring` is a name the kit may claim.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
const APP_VARIABLES = [
  ['--status-planning', 'statusPlanning'],
  ['--status-planning-ink', 'statusPlanningInk'],
  ['--status-active', 'statusActive'],
  ['--status-past', 'statusPast'],
  ['--pending', 'pending'],
  ['--subtle', 'subtle'],
  ['--on-ink', 'onInk'],
  ['--sand', 'sand'],
  ['--accent-press', 'accentPress'],
  ['--accent-line', 'accentLine'],
  ['--accent-text', 'accentText'],
  ['--accent-tint', 'accentTint'],
  ['--aqua', 'aqua'],
  ['--aqua-line', 'aquaLine'],
  ['--aqua-ink', 'aquaInk'],
  ['--aqua-tint', 'aquaTint'],
  ['--amber', 'amber'],
  ['--amber-line', 'amberLine'],
  ['--amber-ink', 'amberInk'],
  ['--amber-tint', 'amberTint'],
  ['--danger-tint', 'dangerTint'],
  ['--success-tint', 'successTint'],
  ['--grab', 'grab'],
  ['--on-photo', 'onPhoto'],
  ['--scrim-button', 'scrimButton'],
  ['--scrim-button-line', 'scrimButtonLine'],
  ['--photo-ring', 'ring'],
  ['--skeleton', 'skeleton'],
  ['--skeleton-highlight', 'skeletonHighlight'],
  ['--toast-surface', 'toastSurface'],
  ['--toast-ink', 'toastInk'],
  ['--stamp-coral', 'stampCoral'],
  ['--stamp-navy', 'stampNavy'],
  ['--stamp-teal', 'stampTeal'],
  ['--stamp-green', 'stampGreen'],
  ['--cover1-start', 'cover1Start'],
  ['--cover1-end', 'cover1End'],
  ['--cover2-start', 'cover2Start'],
  ['--cover2-end', 'cover2End'],
  ['--cover3-start', 'cover3Start'],
  ['--cover3-end', 'cover3End'],
];

/**
 * Variables shared by every theme, written once in a plain `@theme { }` block, the form
 * in which the kit declares them (`heroui-native/src/styles/variables.css`).
 *
 * The kit ships `--field-border-width: 0px` (its fields are borderless) and reads it in
 * `@theme inline static` as `--border-width-field-width: var(--field-border-width, ...)`.
 * Sunrise draws the field boundary FR-069 requires (`--field-border` is the 3:1 `border`
 * colour), so the width is overridden here; a later `@theme` declaration wins.
 *
 * @type {ReadonlyArray<readonly [string, string]>}
 */
const SHARED_VARIABLES = [['--field-border-width', '1px']];

/** Only the plain light theme casts a shadow; the others are flat (research D4-11). */
const SHADOWED_THEMES = ['light'];

/** A zero shadow that still lets the kit's ring utilities work (HeroUI docs). */
const NO_SHADOW = '0 0 0 0 transparent inset';

/**
 * Every colour is `#RRGGBB`; only tints, scrims and alpha lines (C5-1) may also be
 * `#RRGGBBAA`. An alpha channel on any other key (an `ink` at 80 percent) is refused, so
 * no text colour can lose contrast silently. A light tint is an opaque colour, so a
 * translucent key may be either form.
 */
const HEX_OPAQUE = /^#[0-9A-Fa-f]{6}$/;
const HEX_TRANSLUCENT = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;
const TRANSLUCENT_KEYS = Object.freeze([
  'hairline',
  'grab',
  'backdrop',
  'accentTint',
  'aquaTint',
  'amberTint',
  'dangerTint',
  'successTint',
  'scrimButton',
  'scrimButtonLine',
  'skeletonHighlight',
]);

/** A theme name becomes a CSS identifier, so it is checked rather than trusted. */
const THEME_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Prettier's `printWidth` (see .prettierrc); the generated file must be Prettier-stable. */
const PRINT_WIDTH = 90;
const DECLARATION_INDENT = '      ';

const HEADER = [
  '/* GENERATED by scripts/build-theme-css.mjs - do not edit.',
  ' * Source of truth: src/theme/palette.data.js. Regenerate from the repository root with:',
  ' *   npm run theme:build -w apps/mobile',
  " * A Jest test fails when this file differs from the generator's output. */",
].join('\n');

/**
 * The themes are whatever the palette data holds, in its order: the generator has no
 * second list to drift from the data. A name must be a safe CSS identifier.
 *
 * @param {Readonly<Record<string, unknown>>} palettes
 * @returns {string[]}
 */
function themeNames(palettes) {
  const names = Object.keys(palettes);
  if (names.length === 0) throw new Error('The palette data holds no theme.');
  for (const name of names) {
    if (!THEME_NAME.test(name)) {
      throw new Error(
        `Invalid theme name "${name}": expected a lowercase CSS identifier.`,
      );
    }
  }
  return names;
}

/**
 * @param {Readonly<Record<string, string>>} palette
 * @param {string} theme
 * @param {string} key
 */
function colourOf(palette, theme, key) {
  const value = palette[key];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Palette "${theme}" has no "${key}" colour.`);
  }
  const pattern = TRANSLUCENT_KEYS.includes(key) ? HEX_TRANSLUCENT : HEX_OPAQUE;
  if (!pattern.test(value)) {
    throw new Error(`Palette "${theme}" "${key}" is not a hex colour: "${value}".`);
  }
  return value;
}

/**
 * Prettier lowercases hex colours in CSS and CI runs `prettier --check`, so the file
 * carries them lowercase; the palette keeps them uppercase (the gate's canonical form).
 */
function cssColour(palette, theme, key) {
  return colourOf(palette, theme, key).toLowerCase();
}

/** `#RRGGBB` to its channels, for the shadow tint. */
function channelsOf(hex) {
  const value = parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/**
 * Shadows are derived from the theme's ink rather than authored: very soft in the light
 * theme, none in the dark and increased-contrast themes, and never on a field.
 *
 * @returns {Array<[string, string]>}
 */
function shadowVariables(theme, palette) {
  if (!SHADOWED_THEMES.includes(theme)) {
    return [
      ['--surface-shadow', NO_SHADOW],
      ['--overlay-shadow', NO_SHADOW],
      ['--field-shadow', NO_SHADOW],
    ];
  }
  const [red, green, blue] = channelsOf(colourOf(palette, theme, 'ink'));
  const tint = (alpha) => `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  return [
    ['--surface-shadow', `0 1px 2px 0 ${tint(0.04)}, 0 0 1px 0 ${tint(0.05)}`],
    ['--overlay-shadow', `0 2px 8px 0 ${tint(0.03)}, 0 14px 28px 0 ${tint(0.05)}`],
    ['--field-shadow', NO_SHADOW],
  ];
}

/**
 * One declaration, laid out as Prettier lays out a custom property: on one line while it
 * fits, otherwise the value drops to its own, further indented, line.
 */
function declaration(variable, value) {
  const line = `${DECLARATION_INDENT}${variable}: ${value};`;
  if (line.length <= PRINT_WIDTH) return line;
  return `${DECLARATION_INDENT}${variable}:\n${DECLARATION_INDENT}  ${value};`;
}

/** One `@variant` block: kit colours, shadows, then the app's own variables. */
function themeBlock(theme, palette) {
  if (palette === null || typeof palette !== 'object') {
    throw new Error(`Palette "${theme}" is missing.`);
  }
  const resolve = ([variable, key]) => [variable, cssColour(palette, theme, key)];
  const declarations = [
    ...KIT_VARIABLES.map(resolve),
    ...shadowVariables(theme, palette),
    ...APP_VARIABLES.map(resolve),
  ].map(([variable, value]) => declaration(variable, value));
  return [`    @variant ${theme} {`, ...declarations, '    }'].join('\n');
}

/** `--status-active` becomes `--color-status-active`, the name Tailwind reads. */
function tailwindColour(variable) {
  return `--color-${variable.slice(2)}`;
}

/** The plain `@theme { }` block of variables every theme shares. */
function sharedBlock() {
  const declarations = SHARED_VARIABLES.map(
    ([variable, value]) => `  ${variable}: ${value};`,
  );
  return [
    '/* The kit ships --field-border-width: 0px (borderless fields); Sunrise draws the',
    ' * field boundary that FR-069 requires. */',
    '@theme {',
    ...declarations,
    '}',
  ].join('\n');
}

/** Fails when a theme in the data did not reach the stylesheet. */
function assertEveryThemeEmitted(css, names) {
  for (const name of names) {
    if (!css.includes(`@variant ${name} {`)) {
      throw new Error(
        `Theme "${name}" is in the palette data but not in the stylesheet.`,
      );
    }
  }
}

/**
 * The generated stylesheet for a set of palettes. Pure: no I/O, no mutation, the same
 * palettes always give the same text (LF line endings, one trailing newline).
 *
 * @param {Readonly<Record<string, Readonly<Record<string, string>>>>} palettes
 *   Theme name to palette. Every theme in the data, in its order, is emitted.
 * @returns {string}
 * @throws if there is no theme, a theme name is unsafe, or a key a theme needs is
 *   missing or is not a hex colour.
 */
function buildThemeCss(palettes) {
  const names = themeNames(palettes);
  const blocks = names.map((theme) => themeBlock(theme, palettes[theme]));
  const exposed = APP_VARIABLES.map(
    ([variable]) => `  ${tailwindColour(variable)}: var(${variable});`,
  );
  const css = [
    HEADER,
    '',
    sharedBlock(),
    '',
    '@layer theme {',
    '  :root {',
    blocks.join('\n\n'),
    '  }',
    '}',
    '',
    '@theme inline static {',
    ...exposed,
    '}',
    '',
  ].join('\n');
  assertEveryThemeEmitted(css, names);
  return css;
}

module.exports = { buildThemeCss, TRANSLUCENT_KEYS };
