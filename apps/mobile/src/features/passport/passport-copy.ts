/**
 * The words of the You screen (feature 005, F13; FR-058; the pictures `profile.png` and
 * `profile-dark.png`): the identity line, the period labels, the passport card's heading and
 * lap line, the stamps page's count and the recap entry. Pure; no `Intl.PluralRules` (Hermes
 * has none), no figure that is not given to it.
 */
import { countParts } from '@/features/home/home-format';

import { WORLD_COUNTRIES } from './country-summary';
import type { PassportPeriodKey } from './stamp-spec';

/** "Traveller since 2021" from the account's creation date; `null` when it has none to read. */
export function travellerSince(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : `Traveller since ${date.getFullYear()}`;
}

export const periodLabel = (period: PassportPeriodKey): string =>
  period === 'all' ? 'All time' : period;

/** The card's heading: "Passport · all time", "Passport · 2026" (the eyebrow draws capitals). */
export const passportHeading = (period: PassportPeriodKey): string =>
  `Passport \u00b7 ${period === 'all' ? 'all time' : period}`;

/** What a screen reader says for the card: "Passport, all time". */
export const passportName = (period: PassportPeriodKey): string =>
  `Passport, ${period === 'all' ? 'all time' : period}`;

/** The stamps page's count: "14 of 195". */
export function stampsCount(count: number, languageTag: string): string {
  return `${countParts(count, '', '', languageTag).figure} of ${WORLD_COUNTRIES}`;
}

/**
 * "1.5\u00d7 around the Earth" from the real laps; `null` for no distance (nothing is claimed),
 * and "Under 0.1\u00d7" while it would round to nothing.
 */
export function lapText(laps: number, languageTag: string): string | null {
  if (!(laps > 0)) return null;
  let figure: string;
  try {
    figure = new Intl.NumberFormat(languageTag, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(laps);
  } catch {
    figure = laps.toFixed(1);
  }
  return laps < 0.05
    ? 'Under 0.1\u00d7 around the Earth'
    : `${figure}\u00d7 around the Earth`;
}

/** The recap entry's title: the year in view, or this year for All time. */
export function recapTitle(period: PassportPeriodKey, thisYear: number): string {
  return `Your ${period === 'all' ? thisYear : period} in 7 slides`;
}

export const RECAP_SUBTITLE = 'See it and share it';

const MRZ_LENGTH = 44;
const MRZ_HEAD = 'P<TRIPTRACKR<<';

/**
 * The machine-readable strip drawn along the foot of the passport card, as a passport has one:
 * `P<TRIPTRACKR<<` then the traveller's name in capital Latin letters (accents folded, spaces
 * as `<`), padded with `<` to 44 characters. Decoration only: it says nothing the card does not,
 * and the card hides it from assistive technology.
 */
export function mrzLine(displayName: string): string {
  const name = displayName
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .trim()
    .replace(/\s+/g, '<');
  return `${MRZ_HEAD}${name}`.slice(0, MRZ_LENGTH).padEnd(MRZ_LENGTH, '<');
}
