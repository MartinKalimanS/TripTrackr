/**
 * The type scale: nine roles and the serif accent (feature 005 contract C5-7, data-model
 * section 2, research D5-06), in three families (Bricolage Grotesque for display and numerals,
 * DM Sans for body text, Instrument Serif Italic for the one accent word) and three weights
 * (400, 600, 700). The 004 (Atlas) table was deleted by T564: `Text` takes `variant` only.
 *
 * No role writes a `fontFamily`: one family per weight is a CSS variable of `src/global.css`,
 * and `fontClassOf` names the semantic class (`font-display-bold`, `font-body-semibold`, ...)
 * that Uniwind turns into it on both platforms. Sizes are in dp and are scaled by the
 * platform's font scale; every line height exceeds its size so enlarged text does not clip
 * (FR-074).
 *
 * Pure data and pure helpers.
 */
import type { TextStyle } from 'react-native';

import { deepFreeze, type DeepReadonly } from './freeze';

/** Bricolage Grotesque, DM Sans, Instrument Serif Italic. */
export type TypeFamily = 'display' | 'body' | 'serif';
export type TypeWeight = 400 | 600 | 700;
/** The nine sizes of the scale; the accent has none (it inherits). */
export type TypeSize = 12 | 13 | 14 | 16 | 17 | 22 | 28 | 36 | 40;

export type TypeRole =
  | 'display'
  | 'numeral'
  | 'title'
  | 'headline'
  | 'callout'
  | 'body'
  | 'label'
  | 'caption'
  | 'eyebrow'
  | 'accent';

/** The one multiplier a capped role is held to (FR-074). */
export const CappedFontScale = 1.3;

export interface TypeToken {
  family: TypeFamily;
  /** `null` for the accent, which inherits the size of the text it sits in. */
  size: TypeSize | null;
  /** `null` for the accent: it inherits the line height too. */
  lineHeight: number | null;
  weight: TypeWeight;
  /** Tracking in em, already compensated for the `opsz` 14 statics (research D5-06). */
  letterSpacingEm: number;
  /** Tabular figures: only in Bricolage, because DM Sans has no `tnum` feature. */
  tabularNumbers: boolean;
  uppercase?: boolean;
  /** Set ONLY on the roles that are always capped (`numeral`, `eyebrow`). */
  maxFontSizeMultiplier?: typeof CappedFontScale;
}

/** In reading order, largest first. */
export const TypeRoleNames: readonly TypeRole[] = deepFreeze([
  'display',
  'numeral',
  'title',
  'headline',
  'callout',
  'body',
  'label',
  'caption',
  'eyebrow',
  'accent',
]);

const typeRoles: Record<TypeRole, TypeToken> = {
  // Greeting, Welcome headline, iOS large titles (Android: `title`).
  display: {
    family: 'display',
    size: 40,
    lineHeight: 44,
    weight: 700,
    letterSpacingEm: -0.035,
    tabularNumbers: false,
  },
  // Home figures, passport figures, the spending total. Always capped at 1.3.
  numeral: {
    family: 'display',
    size: 36,
    lineHeight: 40,
    weight: 700,
    letterSpacingEm: -0.04,
    tabularNumbers: true,
    maxFontSizeMultiplier: CappedFontScale,
  },
  // Trip hero title, the name on You, Android header titles.
  title: {
    family: 'display',
    size: 28,
    lineHeight: 32,
    weight: 700,
    letterSpacingEm: -0.03,
    tabularNumbers: false,
  },
  // Section titles, sheet titles, year headers.
  headline: {
    family: 'display',
    size: 22,
    lineHeight: 28,
    weight: 700,
    letterSpacingEm: -0.02,
    tabularNumbers: false,
  },
  // Row titles, buttons, the tag title. Capped only on the FAB label and the day chips.
  callout: {
    family: 'display',
    size: 17,
    lineHeight: 22,
    weight: 600,
    letterSpacingEm: 0,
    tabularNumbers: false,
  },
  // Running text, field text (semibold when strong).
  body: {
    family: 'body',
    size: 16,
    lineHeight: 24,
    weight: 400,
    letterSpacingEm: 0,
    tabularNumbers: false,
  },
  // Secondary lines, links, chip text. Capped on chips and pills only.
  label: {
    family: 'body',
    size: 14,
    lineHeight: 20,
    weight: 400,
    letterSpacingEm: 0,
    tabularNumbers: false,
  },
  // Meta, pills, chip counts. Capped on pills and stat labels only.
  caption: {
    family: 'body',
    size: 13,
    lineHeight: 18,
    weight: 600,
    letterSpacingEm: 0,
    tabularNumbers: false,
  },
  // The date above the greeting, the country over a title, tab labels. Always capped.
  eyebrow: {
    family: 'body',
    size: 12,
    lineHeight: 16,
    weight: 700,
    letterSpacingEm: 0.06,
    tabularNumbers: false,
    uppercase: true,
    maxFontSizeMultiplier: CappedFontScale,
  },
  // One word per screen (the greeting name, one headline word): inherits size and line height.
  accent: {
    family: 'serif',
    size: null,
    lineHeight: null,
    weight: 400,
    letterSpacingEm: 0,
    tabularNumbers: false,
  },
};

export const TypeRoles: DeepReadonly<Record<TypeRole, TypeToken>> = deepFreeze(typeRoles);

/**
 * The roles that are capped at 1.3 ONLY in their chrome context (FR-074): the FAB label and
 * the day chips (`callout`), chips and pills (`label`), pills and stat labels (`caption`).
 * A `Text` says so with `capped`; every other role scales without a cap.
 */
export const CappableInContext: readonly TypeRole[] = deepFreeze([
  'callout',
  'label',
  'caption',
]);

/**
 * The cap of a role: always for `numeral` and `eyebrow`; for `callout`, `label` and
 * `caption` only when `capped` says the text is chrome; never otherwise.
 */
export function maxFontScaleOf(role: TypeRole, capped = false): number | undefined {
  const own = TypeRoles[role].maxFontSizeMultiplier;
  if (own !== undefined) return own;
  return capped && CappableInContext.includes(role) ? CappedFontScale : undefined;
}

/**
 * The semantic class of a bundled face. Each weight is its own family (React Native has no
 * variable weights for a custom font), and `src/global.css` turns the matching
 * `--font-<name>` variable into the `font-<name>` class, with the iOS PostScript spelling
 * under `@variant ios` (D5-06). Only the six bundled faces exist.
 */
const FONT_CLASSES: Readonly<Record<string, string>> = deepFreeze({
  'display-600': 'font-display',
  'display-700': 'font-display-bold',
  'body-400': 'font-body',
  'body-600': 'font-body-semibold',
  'body-700': 'font-body-bold',
  'serif-400': 'font-serif-italic',
});

export function fontClassOf(family: TypeFamily, weight: TypeWeight): string {
  const fontClass = FONT_CLASSES[`${family}-${weight}`];
  if (fontClass === undefined) {
    throw new Error(`No bundled face for ${family} at weight ${weight}.`);
  }
  return fontClass;
}

const TABULAR: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

/** Tracking in dp: React Native has no `em`, so the token's em is multiplied by the size. */
function trackingOf(token: TypeToken): number | undefined {
  if (token.letterSpacingEm === 0 || token.size === null) return undefined;
  return Math.round(token.letterSpacingEm * token.size * 100) / 100;
}

/**
 * What a role asks of a text beyond its size, line height and face (the classes carry
 * those): tracking in dp, upper case, tabular figures. A new object each call.
 */
export function typeExtras(role: TypeRole): TextStyle {
  const token = TypeRoles[role];
  const letterSpacing = trackingOf(token);
  return {
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
    ...(token.uppercase ? { textTransform: 'uppercase' as const } : {}),
    ...(token.tabularNumbers ? { fontVariant: [...TABULAR] } : {}),
  };
}

/**
 * The whole of a role as a React Native text style, for code that cannot take a class (a
 * native header, a chart label): size, line height, then `typeExtras`. The face is a class
 * or a CSS variable, never written here, and the cap is a prop, not a style. The accent
 * has neither size nor line height: it inherits them.
 */
export function typeStyle(role: TypeRole): TextStyle {
  const { size, lineHeight } = TypeRoles[role];
  return {
    ...(size === null ? {} : { fontSize: size }),
    ...(lineHeight === null ? {} : { lineHeight }),
    ...typeExtras(role),
  };
}
