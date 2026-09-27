import { z } from 'zod';

/** Row identity. Generated on the device that creates the row (research D-15). */
export const Uuid = z.uuid();

/** Server-side instants. Always UTC, always with an offset, so two devices agree. */
export const IsoDateTime = z.iso.datetime({ offset: true });

/** Calendar dates with no time component — stop dates, spend dates. */
export const IsoDate = z.iso.date();

/** ISO 4217, upper case. */
export const CurrencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Expected an ISO 4217 currency code');

/**
 * Money travels as a decimal string with at most two fractional digits.
 * NUMERIC on the server, never a float anywhere: SC-016 requires totals to
 * reconcile exactly, and IEEE-754 cannot promise that. Negative values are
 * legitimate — a refund is an expense (spec edge case).
 */
export const DecimalString = z
  .string()
  .regex(
    /^-?\d{1,10}(\.\d{1,2})?$/,
    'Expected a decimal amount with at most two decimals',
  );

/** FX rates carry more precision than amounts; six decimals matches NUMERIC(14,6). */
export const RateString = z
  .string()
  .regex(
    /^(?=.*[1-9])\d{1,8}(\.\d{1,6})?$/,
    'Expected a positive rate with at most six decimals',
  );

/** Reference-data identifiers (GeoNames-derived integers). */
export const CityId = z.int().positive();
export const CountryId = z.int().positive();
