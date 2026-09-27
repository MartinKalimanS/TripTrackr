import { Decimal } from 'decimal.js';

/**
 * Money arithmetic — research D-26 (SC-016).
 *
 * The wire carries decimal STRINGS (`DecimalString`, `RateString` in
 * scalars.ts) and both sides must produce them the same way, so the functions
 * that produce them live beside the formats they satisfy. Decimal strings in,
 * decimal strings out; nothing here ever becomes a JavaScript `number`. The
 * two rounding rules are the schema's: a rate carries six places
 * (`NUMERIC(14,6)`), an amount two (`NUMERIC(12,2)`), both half-up — the
 * rounding a traveller expects from a receipt.
 *
 * The server uses these to freeze a conversion at entry (FR-021) and to total
 * a summary; the device uses the same functions to convert from its cached
 * snapshot in aeroplane mode (research D-10) and to total the local mirror,
 * where SQLite has no decimal type to do it in SQL.
 */

const RATE_PLACES = 6;
const AMOUNT_PLACES = 2;

/** One USD in each currency — the shape of a snapshot (research D-28). */
export type UsdRates = Readonly<Record<string, string>>;

/** The smallest rate the column can carry; anything that rounds below it is not a rate. */
const MIN_RATE = new Decimal(1).div(new Decimal(10).pow(RATE_PLACES));

function toDecimal(value: string | number): Decimal | null {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() ? decimal : null;
  } catch {
    return null;
  }
}

/** A positive rate as the wire spells it, or null when the feed's value is unusable. */
export function formatRate(value: string | number): string | null {
  const decimal = toDecimal(value);
  if (!decimal || decimal.lte(0)) return null;

  const rounded = decimal.toDecimalPlaces(RATE_PLACES, Decimal.ROUND_HALF_UP);
  return rounded.lt(MIN_RATE) ? null : rounded.toFixed(RATE_PLACES);
}

/**
 * `rate(from → to)` from a USD-based snapshot: `usd[to] / usd[from]`. A currency
 * against itself is 1 whatever the snapshot holds; a missing leg is `null`,
 * which the caller records as `fx_pending` rather than inventing a number.
 */
export function crossRate(usd: UsdRates, from: string, to: string): string | null {
  if (from === to) return formatRate(1);

  const fromLeg = from === 'USD' ? '1' : usd[from];
  const toLeg = to === 'USD' ? '1' : usd[to];
  if (fromLeg === undefined || toLeg === undefined) return null;

  const numerator = toDecimal(toLeg);
  const denominator = toDecimal(fromLeg);
  if (!numerator || !denominator || denominator.lte(0)) return null;

  return formatRate(numerator.div(denominator).toString());
}

/** `amount × rate`, half-up to two places — the `amount_home` frozen on a row (FR-021). */
export function convertAmount(amount: string, rate: string): string {
  return new Decimal(amount)
    .times(new Decimal(rate))
    .toDecimalPlaces(AMOUNT_PLACES, Decimal.ROUND_HALF_UP)
    .toFixed(AMOUNT_PLACES);
}

/** Exact sum of decimal strings, two places. */
export function sumAmounts(amounts: readonly string[]): string {
  return amounts
    .reduce((total, amount) => total.plus(new Decimal(amount)), new Decimal(0))
    .toFixed(AMOUNT_PLACES);
}

/** Largest magnitudes the columns hold: `NUMERIC(12,2)` amounts, `NUMERIC(14,6)` rates. */
const MAX_AMOUNT = new Decimal('9999999999.99');
const MAX_RATE = new Decimal('99999999.999999');

/** True when the value is a finite amount that fits `NUMERIC(12,2)` (either sign). */
export function fitsAmountColumn(amount: string): boolean {
  const decimal = toDecimal(amount);
  return decimal !== null && decimal.abs().lte(MAX_AMOUNT);
}

/** True when the value is a positive rate that fits `NUMERIC(14,6)`. */
export function fitsRateColumn(rate: string): boolean {
  const decimal = toDecimal(rate);
  return decimal !== null && decimal.gt(0) && decimal.lte(MAX_RATE);
}

/** Sort comparator for decimal strings: negative when `a < b`, zero when equal. */
export function compareAmounts(a: string, b: string): number {
  return new Decimal(a).comparedTo(new Decimal(b));
}

/**
 * A typed amount as a `DecimalString`, or null when it is not one.
 *
 * Travellers type "12,50" in Vienna and "12.50" in Denver, and many type "."
 * everywhere because that is the key the numeric keypad shows (research
 * D-27). The rule therefore does not trust the locale; it reads the digits:
 * with both separators present the later one is the decimal point and the
 * other is grouping ("1.234,50" and "1,234.50" are both 1234.50); with one
 * separator, one or two trailing digits make it a decimal point and exactly
 * three make it grouping ("1,234" is 1234). Spaces and apostrophes are
 * grouping. A leading minus is a refund. Anything else is refused rather
 * than guessed.
 */
export function parseAmount(input: string): string | null {
  const text = input.trim().replace(/[\s\u00a0\u202f']/g, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');

  let normalised: string | null;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const at = text.lastIndexOf(decimal);
    const integer = ungroup(text.slice(0, at), decimal === ',' ? '.' : ',');
    normalised = integer === null ? null : `${integer}.${text.slice(at + 1)}`;
  } else if (lastComma !== -1 || lastDot !== -1) {
    const separator = lastComma !== -1 ? ',' : '.';
    const parts = text.split(separator);
    const tail = parts[parts.length - 1] ?? '';
    normalised =
      parts.length === 2 && tail.length <= 2 ? parts.join('.') : ungroup(text, separator);
  } else {
    normalised = text;
  }

  if (normalised === null || !/^-?\d{1,10}(\.\d{1,2})?$/.test(normalised)) return null;

  return new Decimal(normalised).toFixed(AMOUNT_PLACES);
}

/** Digits with `grouping` removed, provided every group after the first has exactly three. */
function ungroup(text: string, grouping: string): string | null {
  const [head, ...rest] = text.split(grouping);
  if (rest.length === 0) return text;
  if (!/^-?\d{1,3}$/.test(head ?? '') || rest.some((group) => !/^\d{3}$/.test(group))) {
    return null;
  }
  return [head, ...rest].join('');
}
