import { z } from 'zod';

import { CurrencyCode, IsoDate, RateString } from '../scalars';

/**
 * FX rates (rest-api.md §11; data-model.md §6 `fx_rates`; research D-10, D-28).
 *
 * One daily snapshot, USD-based: `rates[X]` is how many X one USD buys. Any
 * cross rate is derived — `rate(A→B) = rates[B] / rates[A]` — through
 * `decimal.js`, never floating point (D-26). The device caches the whole
 * response so an expense logged in aeroplane mode converts from the last
 * snapshot it saw; `as_of` is what it shows the traveller about how fresh
 * that conversion is.
 */
export const FX_BASE_CURRENCY = 'USD';

export const FxRatesResponse = z.strictObject({
  base: z.literal(FX_BASE_CURRENCY),
  as_of: IsoDate,
  /** Attribution for the feed the snapshot came from (its terms require it). */
  source: z.string().min(1),
  rates: z.record(CurrencyCode, RateString),
});
export type FxRatesResponse = z.infer<typeof FxRatesResponse>;
