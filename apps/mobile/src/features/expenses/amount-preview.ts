/**
 * The amount-first form's derived lines (feature 005, F6; `add-expense.png`): the currency
 * symbol that stands before the figure, and "≈ $26.62 at today's rate" under it.
 *
 * The line is a PREVIEW of what saving will freeze (FR-021): the same `crossRate` and
 * `convertAmount` the repository uses (decimal.js, half-up to two places), from the cached
 * snapshot, on the amount as typed read by `parseAmount`. It is shown only when the cache can
 * back it (a snapshot that quotes both currencies, a readable non-zero amount, a currency
 * other than the home one): never a made-up figure (Q-11). "At today's rate" is said only
 * when the snapshot is of today; an older one says its date.
 */
import {
  convertAmount,
  crossRate,
  parseAmount,
  type UsdRates,
} from '@triptrackr/contracts';

import { fromIsoDate } from '@/features/trips/stop-dates';
import { formatMoney } from '@/lib/locale';

export interface PreviewSnapshot {
  asOf: string;
  rates: UsdRates;
}

/** The symbol the locale writes for `code` ("€"), or the code itself when it has none. */
export function currencySymbol(code: string, languageTag: string): string {
  if (code.length !== 3) return code;
  try {
    const parts = new Intl.NumberFormat(languageTag, {
      style: 'currency',
      currency: code,
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

export interface RatePreviewInput {
  /** The amount as typed. */
  amount: string;
  currency: string;
  /** The trip's home currency. */
  home: string;
  snapshot: PreviewSnapshot | null;
  /** `YYYY-MM-DD`, the local day. */
  today: string;
  languageTag: string;
}

/** "≈ $26.62 at today's rate", or null when nothing honest can be said. */
export function ratePreview({
  amount,
  currency,
  home,
  snapshot,
  today,
  languageTag,
}: RatePreviewInput): string | null {
  if (!snapshot || currency === home) return null;
  const parsed = parseAmount(amount);
  if (parsed === null || /^-?0+(\.0+)?$/.test(parsed)) return null;
  const rate = crossRate(snapshot.rates, currency.toUpperCase(), home);
  if (rate === null) return null;
  const money = formatMoney(convertAmount(parsed, rate), home, languageTag);
  const when = snapshot.asOf === today ? "today's rate" : `the rate of ${snapshot.asOf}`;
  return `≈ ${money} at ${when}`;
}

export interface ExtrasSummaryInput {
  /** `YYYY-MM-DD`, the day the expense was paid. */
  spentAt: string;
  today: string;
  /** The city's name, or null for "No city". */
  place: string | null;
  hasNote: boolean;
  languageTag: string;
}

/**
 * The second line of the collapsed "Add note, date or place" row ("Today, 14 Oct · Lisbon"):
 * what is already set, so closing the row hides nothing. The day is the local calendar day.
 */
export function extrasSummary({
  spentAt,
  today,
  place,
  hasNote,
  languageTag,
}: ExtrasSummaryInput): string {
  const isToday = spentAt === today;
  const day = new Intl.DateTimeFormat(languageTag, {
    ...(isToday ? {} : { weekday: 'short' as const }),
    day: 'numeric',
    month: 'short',
  }).format(fromIsoDate(spentAt));
  return [isToday ? `Today, ${day}` : day, place, hasNote ? 'Note' : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}
