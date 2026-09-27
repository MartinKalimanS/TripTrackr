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

export interface DeviceLocale {
  /** BCP 47, e.g. "de-AT". */
  languageTag: string;
  /** "." or "," — what the traveller's keypad produces. */
  decimalSeparator: string;
  /** The region's currency, or null when the platform cannot say. */
  currencyCode: string | null;
}

export function deviceLocale(): DeviceLocale {
  const [first] = getLocales();
  return {
    languageTag: first?.languageTag ?? 'en',
    decimalSeparator: first?.decimalSeparator ?? '.',
    currencyCode: first?.currencyCode ?? null,
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

/** "1 EUR = 0.888889 CHF" — the disclosure FR-026 asks for. */
export function describeRate(from: string, rate: string, to: string): string {
  return `1 ${from} = ${rate} ${to}`;
}
