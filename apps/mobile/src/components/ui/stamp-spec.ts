/**
 * `stampSpec` - the pure rule behind every passport stamp (feature 005; FR-059, FR-077,
 * SC-016; data-model section 4; research D5-08). No React, no native module, no clock.
 *
 * A country and the day of its first visit fix everything about a stamp that is not its text:
 *
 *   h = fnv1a32(ISO2.toUpperCase() + '|' + 'YYYY-MM-DD')        integer arithmetic only
 *   shape      = SHAPES[h % 6]                                  circle rect hex oct scallop oval
 *   ink        = INKS[(h >>> 3) % 4]                            coral navy teal green
 *   rotation   = ((h >>> 7) % 17) - 8                           -8 to +8 whole degrees
 *   wear       = (h >>> 12) % 4                                 which baked wear mask
 *   perforated = ((h >>> 15) & 1) === 1                         a dashed outer ring
 *
 * so the same country and day give the same stamp on every launch and every device, and the
 * traveller's Portugal never changes colour. The text round the top (`top`, a city or the
 * country, upper case, at most 16 characters) and the formatted date are NOT part of the hash:
 * they are display, they follow the device language, and renaming a city must not repaint a
 * stamp. This lives in `components/ui/` because `Stamp` consumes it and the adapter layer must
 * not import from `features/`; the passport feature (T556) picks the country, the first-visit
 * day and the top text, and calls it.
 *
 * `stampDateText` is the date printed on the stamp (upper case, short month: "12 OCT 2026")
 * and `stampLabel` is what the PARENT of a decorative stamp says ("Stamp: Portugal, 12 October
 * 2026"); both use `Intl` with the device locale, read the day as the local calendar day (never
 * UTC), and give back what they cannot read instead of a wrong day.
 */
import { fnv1a32 } from '@/lib/fnv1a';
import { deviceLocale } from '@/lib/locale';

export const STAMP_SHAPES = ['circle', 'rect', 'hex', 'oct', 'scallop', 'oval'] as const;
export const STAMP_INKS = ['coral', 'navy', 'teal', 'green'] as const;

export type StampShape = (typeof STAMP_SHAPES)[number];
export type StampInk = (typeof STAMP_INKS)[number];

/** Which of the four baked wear masks the stamp is seen through. */
export type StampWear = 0 | 1 | 2 | 3;

export interface StampSpec {
  /** The country's ISO alpha-2 code, upper case. */
  iso2: string;
  shape: StampShape;
  ink: StampInk;
  /** A whole number of degrees, -8 to +8. */
  rotationDeg: number;
  wear: StampWear;
  /** The outer ring is dashed. */
  perforated: boolean;
  /** The text round the top: a city or the country, upper case, at most 16 characters. */
  top: string;
  /** The first visit, `YYYY-MM-DD`, as given. Formatted for display with `stampDateText`. */
  date: string;
}

/** What a stamp says when it is given no place. */
const DEFAULT_TOP = 'ARRIVAL';
const TOP_LIMIT = 16;

/** Upper case, cut on a whole character (never half a surrogate pair), without edge spaces. */
function fitTop(text: string | undefined): string {
  const upper = (text ?? '').trim().toUpperCase();
  const cut = Array.from(upper).slice(0, TOP_LIMIT).join('').trim();
  return cut === '' ? DEFAULT_TOP : cut;
}

/**
 * The stamp of `iso2` first visited on `firstVisit` (`YYYY-MM-DD`, the local calendar day).
 * `top` is the text round the top; it does not change the look.
 */
export function stampSpec(iso2: string, firstVisit: string, top?: string): StampSpec {
  const code = iso2.trim().toUpperCase();
  const hash = fnv1a32(`${code}|${firstVisit}`);
  return {
    iso2: code,
    shape: STAMP_SHAPES[hash % STAMP_SHAPES.length],
    ink: STAMP_INKS[(hash >>> 3) % STAMP_INKS.length],
    rotationDeg: ((hash >>> 7) % 17) - 8,
    wear: ((hash >>> 12) % 4) as StampWear,
    perforated: ((hash >>> 15) & 1) === 1,
    top: fitTop(top),
    date: firstVisit,
  };
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A `YYYY-MM-DD` as that day in the device's calendar, or null when it is not a real day. */
function localDay(isoDate: string): Date | null {
  const match = ISO_DAY.exec(isoDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  return real ? date : null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** `Intl` constructors are slow on Hermes and a passport draws many stamps: one per style. */
function formatterFor(
  locale: string,
  key: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const cacheKey = `${locale}|${key}`;
  const known = formatters.get(cacheKey);
  if (known) return known;
  const made = new Intl.DateTimeFormat(locale, options);
  formatters.set(cacheKey, made);
  return made;
}

/**
 * The date printed on a stamp: day, short month and year in the device language, upper case
 * ("12 OCT 2026", or "OCT 12, 2026" in en-US). A day it cannot read, or a locale `Intl` does
 * not know, comes back as given.
 */
export function stampDateText(
  isoDate: string,
  locale: string = deviceLocale().languageTag,
): string {
  const day = localDay(isoDate);
  if (day === null) return isoDate;
  try {
    const formatter = formatterFor(locale, 'stamp', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return formatter.format(day).toLocaleUpperCase(locale);
  } catch {
    return isoDate;
  }
}

/**
 * What the PARENT of a stamp says, because the stamp itself is decoration: "Stamp: Portugal,
 * 12 October 2026" (the month in words, in the device language).
 */
export function stampLabel(
  place: string,
  isoDate: string,
  locale: string = deviceLocale().languageTag,
): string {
  const day = localDay(isoDate);
  let spoken = isoDate;
  if (day !== null) {
    try {
      spoken = formatterFor(locale, 'label', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(day);
    } catch {
      spoken = isoDate;
    }
  }
  return `Stamp: ${place}, ${spoken}`;
}
