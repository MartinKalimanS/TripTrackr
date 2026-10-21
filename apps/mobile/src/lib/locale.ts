/**
 * Device locale and money formatting — research D-27 (FR-025, FR-026).
 *
 * `expo-localization` supplies the traveller's language tag and decimal
 * separator (https://docs.expo.dev/versions/v57.0.0/sdk/localization/);
 * Hermes's `Intl` does the formatting. Amounts arrive as the wire's decimal
 * strings and are handed to `Intl.NumberFormat` as strings too — it accepts
 * them — so no amount is ever widened to a binary float on its way to the
 * screen (research D-26).
 */
import { getLocales } from 'expo-localization';

export type MeasurementSystem = 'metric' | 'us' | 'uk';

export interface DeviceLocale {
  /** BCP 47, e.g. "de-AT". */
  languageTag: string;
  /** "." or "," — what the traveller's keypad produces. */
  decimalSeparator: string;
  /** The region's currency, or null when the platform cannot say. */
  currencyCode: string | null;
  /** How the region measures; travel distances are miles in `us` and `uk`. */
  measurementSystem: MeasurementSystem;
}

export function deviceLocale(): DeviceLocale {
  const [first] = getLocales();
  return {
    languageTag: first?.languageTag ?? 'en',
    decimalSeparator: first?.decimalSeparator ?? '.',
    currencyCode: first?.currencyCode ?? null,
    measurementSystem: first?.measurementSystem ?? 'metric',
  };
}

const formatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, languageTag: string): Intl.NumberFormat {
  const key = `${languageTag}|${currency}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(languageTag, { style: 'currency', currency });
    } catch {
      // An unknown or test-range code (XTS) has no currency data; show the
      // amount with the code beside it rather than failing to render at all.
      formatter = new Intl.NumberFormat(languageTag, { minimumFractionDigits: 2 });
    }
    formatters.set(key, formatter);
  }
  return formatter;
}

/** "€12.50" / "12,50 €" per locale; a code `Intl` does not know renders as "12.50 XTS". */
export function formatMoney(
  amount: string,
  currency: string,
  languageTag: string = deviceLocale().languageTag,
): string {
  const formatter = moneyFormatter(currency, languageTag);
  const text = formatter.format(amount as unknown as number);
  return formatter.resolvedOptions().style === 'currency' ? text : `${text} ${currency}`;
}

const wholeFormatters = new Map<string, Intl.NumberFormat>();

/** The currency formatter with no fraction digits: for an amount that is a whole number. */
function wholeMoneyFormatter(currency: string, languageTag: string): Intl.NumberFormat {
  const key = `${languageTag}|${currency}`;
  let formatter = wholeFormatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(languageTag, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } catch {
      formatter = new Intl.NumberFormat(languageTag, { maximumFractionDigits: 0 });
    }
    wholeFormatters.set(key, formatter);
  }
  return formatter;
}

/** True when a decimal string has nothing but zeros after the point: no digit is lost without them. */
function isWholeAmount(amount: string): boolean {
  return /^-?\d+(\.0*)?$/.test(amount.trim());
}

function tightFormatter(amount: string, currency: string, languageTag: string) {
  return isWholeAmount(amount)
    ? wholeMoneyFormatter(currency, languageTag)
    : moneyFormatter(currency, languageTag);
}

/**
 * "€842" for 842.00 and "€14.80" for 14.80: `formatMoney`, but a whole amount drops its zero
 * fraction (the spending figures of the pictures). Nothing is rounded: only digits that are all
 * zero are left out, so the figure is the same amount.
 */
export function formatMoneyTight(
  amount: string,
  currency: string,
  languageTag: string = deviceLocale().languageTag,
): string {
  const formatter = tightFormatter(amount, currency, languageTag);
  const text = formatter.format(amount as unknown as number);
  return formatter.resolvedOptions().style === 'currency' ? text : `${text} ${currency}`;
}

/** An amount cut at its currency sign, so a screen can raise the sign (the hero's numeral). */
export interface MoneyParts {
  before: string;
  /** The currency sign or code as the locale writes it; empty when `Intl` cannot split it. */
  symbol: string;
  after: string;
}

/**
 * `formatMoneyTight` in three pieces around the currency sign ("€", "842"; or "842", "€" where
 * the locale puts it after). `before + symbol + after` is always the text `formatMoneyTight`
 * gives; where `formatToParts` is missing the whole text is `before`.
 */
export function formatMoneyParts(
  amount: string,
  currency: string,
  languageTag: string = deviceLocale().languageTag,
): MoneyParts {
  const formatter = tightFormatter(amount, currency, languageTag);
  const whole = formatMoneyTight(amount, currency, languageTag);
  if (formatter.resolvedOptions().style !== 'currency' || !formatter.formatToParts) {
    return { before: whole, symbol: '', after: '' };
  }
  const parts = formatter.formatToParts(amount as unknown as number);
  const at = parts.findIndex((part) => part.type === 'currency');
  if (at < 0) return { before: whole, symbol: '', after: '' };
  const join = (list: Intl.NumberFormatPart[]) => list.map((part) => part.value).join('');
  return {
    before: join(parts.slice(0, at)),
    symbol: parts[at]!.value,
    after: join(parts.slice(at + 1)),
  };
}

/** A whole-unit decimal string ("281", "-4") grouped for the locale: the label under a bar. */
export function formatWholeUnits(
  whole: string,
  languageTag: string = deviceLocale().languageTag,
): string {
  return new Intl.NumberFormat(languageTag, { maximumFractionDigits: 0 }).format(
    whole as unknown as number,
  );
}

/** "1 EUR = 0.888889 CHF" — the disclosure FR-026 asks for. */
export function describeRate(from: string, rate: string, to: string): string {
  return `1 ${from} = ${rate} ${to}`;
}

const KM_PER_MILE = 1.609344;

export interface FormattedDistance {
  /** "12,346 km" — for the screen. */
  text: string;
  /** "12,346 kilometres" — for a screen reader, which may spell "km" out letter by letter. */
  spoken: string;
}

/** A distance as the number and the unit of the device's measurement system, apart. */
export interface DistanceFigure {
  /** Whole units: kilometres, or miles in `us` and `uk`. */
  value: number;
  unit: 'km' | 'mi';
  /** The unit spelled out, singular: "kilometre" or "mile". */
  unitWord: 'kilometre' | 'mile';
}

/**
 * The whole-unit figure of a travel distance and its unit, for a screen that draws the number
 * on its own (the Home's kilometres counts up beside a lighter "km"). `formatDistance` is
 * built on it, so the two cannot disagree.
 */
export function distanceFigure(
  km: number,
  locale: DeviceLocale = deviceLocale(),
): DistanceFigure {
  const miles = locale.measurementSystem !== 'metric';
  return {
    value: Math.round(miles ? km / KM_PER_MILE : km),
    unit: miles ? 'mi' : 'km',
    unitWord: miles ? 'mile' : 'kilometre',
  };
}

/**
 * A travel distance in whole units of the device's measurement system (FR-050,
 * research D-30), grouped in its locale. The unit is appended rather than
 * formatted with `Intl`'s `unit` style, whose support varies across Hermes
 * builds; grouping is all `Intl` is asked for.
 */
export function formatDistance(
  km: number,
  locale: DeviceLocale = deviceLocale(),
): FormattedDistance {
  const { value, unit, unitWord } = distanceFigure(km, locale);
  const figure = new Intl.NumberFormat(locale.languageTag, {
    maximumFractionDigits: 0,
  }).format(value);
  return {
    text: `${figure} ${unit}`,
    spoken: `${figure} ${value === 1 ? unitWord : `${unitWord}s`}`,
  };
}
