/**
 * The Atlas type scale — contract C4-6, data-model section 2, research D4-07.
 *
 * Interface text uses the platform face (SF Pro, Roboto) so Dynamic Type and font scaling
 * work for free; one bundled display face, in two weights, carries the large title and
 * the title. React Native has no variable weights for a custom font, so each weight is a
 * separate family: `family` names the ROLE of the face (`system`, `display`,
 * `displayBold`), and the font adapter resolves it to the loaded family. These helpers
 * therefore never write a `fontFamily`.
 *
 * Pure data and pure helpers. Sizes are in points and are scaled by the platform's font
 * scale; every line height exceeds its size so enlarged text does not clip (FR-029).
 */
import type { TextStyle } from 'react-native';

import { deepFreeze, type DeepReadonly } from './freeze';

export type FontFamilyRole = 'system' | 'display' | 'displayBold';
export type FontWeight = 400 | 500 | 600 | 700;
/** Five sizes, plus the iOS headline at 17. */
export type TextSize = 12 | 14 | 16 | 17 | 22 | 32;

export type TextRole =
  'largeTitle' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'numeric';

export interface TextStyleToken {
  family: FontFamilyRole;
  size: TextSize;
  lineHeight: number;
  weight: FontWeight;
  /** Tabular numerals: money, distance, counts and dates must not jitter. */
  tabularNumbers: boolean;
}

/** In reading order, largest first. */
export const TextRoleNames: readonly TextRole[] = deepFreeze([
  'largeTitle',
  'title',
  'headline',
  'body',
  'callout',
  'caption',
  'numeric',
]);

const roles: Record<TextRole, TextStyleToken> = {
  // Trip title, screen hero, statistics figures.
  largeTitle: {
    family: 'displayBold',
    size: 32,
    lineHeight: 38,
    weight: 700,
    tabularNumbers: false,
  },
  // Header titles, sheet titles.
  title: {
    family: 'display',
    size: 22,
    lineHeight: 28,
    weight: 600,
    tabularNumbers: false,
  },
  // Row titles, section headers.
  headline: {
    family: 'system',
    size: 17,
    lineHeight: 24,
    weight: 600,
    tabularNumbers: false,
  },
  // Default text.
  body: {
    family: 'system',
    size: 16,
    lineHeight: 24,
    weight: 400,
    tabularNumbers: false,
  },
  // Secondary lines, chips.
  callout: {
    family: 'system',
    size: 14,
    lineHeight: 20,
    weight: 500,
    tabularNumbers: false,
  },
  // Footnotes, captions.
  caption: {
    family: 'system',
    size: 12,
    lineHeight: 16,
    weight: 500,
    tabularNumbers: false,
  },
  // Money, distance, counts, dates. Size and line height are per context: this is the
  // default (body), and `numericStyle` borrows them from the role it sits in.
  numeric: {
    family: 'system',
    size: 16,
    lineHeight: 24,
    weight: 600,
    tabularNumbers: true,
  },
};

export const TextRoles: DeepReadonly<Record<TextRole, TextStyleToken>> =
  deepFreeze(roles);

const TABULAR: NonNullable<TextStyle['fontVariant']> = ['tabular-nums'];

function weightOf(weight: FontWeight): NonNullable<TextStyle['fontWeight']> {
  return `${weight}` as NonNullable<TextStyle['fontWeight']>;
}

/**
 * The size, line height and weight of a role as a React Native text style, plus tabular
 * numerals for `numeric`. A new object each call, so a caller may extend it.
 */
export function textStyle(role: TextRole): TextStyle {
  const token = TextRoles[role];
  const style: TextStyle = {
    fontSize: token.size,
    lineHeight: token.lineHeight,
    fontWeight: weightOf(token.weight),
  };
  return token.tabularNumbers ? { ...style, fontVariant: [...TABULAR] } : style;
}

/**
 * Numerals in the context of another role: the size and line height of `base`, with the
 * `numeric` role's weight and tabular figures. A large total sits in `largeTitle`, a
 * price in a row in `body`.
 */
export function numericStyle(base: Exclude<TextRole, 'numeric'> = 'body'): TextStyle {
  const { size, lineHeight } = TextRoles[base];
  return {
    fontSize: size,
    lineHeight,
    fontWeight: weightOf(TextRoles.numeric.weight),
    fontVariant: [...TABULAR],
  };
}
