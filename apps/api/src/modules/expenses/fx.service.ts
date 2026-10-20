import { Injectable } from '@nestjs/common';
import {
  FX_BASE_CURRENCY,
  convertAmount,
  crossRate,
  formatRate,
  type FxRatesResponse,
  type UsdRates,
} from '@triptrackr/contracts';
import { desc, eq } from 'drizzle-orm';

import { loadEnv } from '@/common/config/env.schema';
import { rlsDb } from '@/common/db/rls-db';
import { fxRates } from '@/db/schema';

/** The conversion frozen onto a row at entry (FR-021), or nothing — `fx_pending`. */
export interface Conversion {
  readonly fxRateToHome: string;
  readonly amountHome: string;
}

/**
 * What a NEW expense freezes (FR-021, FR-022; research D-10): the device's own
 * conversion when it sent both halves of one, otherwise whatever `resolve`
 * finds — the server's snapshot — or nothing, which stores the row `fx_pending`.
 *
 * One function for the two ways an expense is first stored, `POST
 * /trips/:id/expenses` and `POST /sync/push`, so the freeze cannot drift
 * between them. It is only ever asked for a row that does not exist yet: an
 * edit never comes here, and nothing stored is ever recomputed.
 */
export async function conversionForEntry(
  client: {
    readonly fx_rate_to_home?: string | null;
    readonly amount_home?: string | null;
  },
  resolve: () => Promise<Conversion | null>,
): Promise<Conversion | null> {
  return client.fx_rate_to_home != null && client.amount_home != null
    ? { fxRateToHome: client.fx_rate_to_home, amountHome: client.amount_home }
    : resolve();
}

/**
 * FX rates for the expense path (FR-021; research D-10, D-26, D-28).
 *
 * Conversions are served from the `fx_rates` table — the daily snapshot the
 * worker refreshes — never from a live call, so the common path does not
 * depend on the feed being up at the moment a traveller logs a coffee. The
 * table holds USD legs; a cross rate is derived through `decimal.js` in
 * `@triptrackr/contracts` (`crossRate`, D-26). When a leg is missing the answer is `null`, and the caller
 * stores the row `fx_pending` rather than refusing it (Constitution II).
 *
 * "Latest" is per currency, not per day: each leg is the newest row for that
 * pair. A feed that drops a minor currency for a day therefore leaves
 * yesterday's known rate in place rather than turning every expense in that
 * currency `fx_pending` — a dated rate beats none. The snapshot's `as_of` is
 * the newest date among the legs it carries.
 *
 * Reads run on the request's RLS transaction like every other read
 * (`rlsDb()`); `fx_rates` carries no policy, so the transaction is merely
 * where the connection is.
 */
@Injectable()
export class FxService {
  /** The newest rate per currency, as `{ quote: rate }` USD legs. Empty when the table is. */
  async latestSnapshot(): Promise<{ asOf: string | null; rates: UsdRates }> {
    const rows = await rlsDb()
      .selectDistinctOn([fxRates.quoteCurrency], {
        quote: fxRates.quoteCurrency,
        rate: fxRates.rate,
        asOf: fxRates.asOf,
      })
      .from(fxRates)
      .where(eq(fxRates.baseCurrency, FX_BASE_CURRENCY))
      .orderBy(fxRates.quoteCurrency, desc(fxRates.asOf));

    const rates: Record<string, string> = {};
    let asOf: string | null = null;
    for (const row of rows) {
      const rate = formatRate(row.rate);
      if (!rate) continue;
      rates[row.quote.trim()] = rate;
      if (asOf === null || row.asOf > asOf) asOf = row.asOf;
    }
    return { asOf, rates };
  }

  /** The rate and converted amount to freeze on a new row, or `null` for `fx_pending`. */
  async convert(amount: string, from: string, to: string): Promise<Conversion | null> {
    const rate =
      from === to
        ? crossRate({}, from, to)
        : crossRate((await this.latestSnapshot()).rates, from, to);
    if (rate === null) return null;

    return { fxRateToHome: rate, amountHome: convertAmount(amount, rate) };
  }

  /** `GET /fx-rates` — the snapshot the device caches for aeroplane mode (D-10). */
  async snapshotForDevice(): Promise<FxRatesResponse | null> {
    const { asOf, rates } = await this.latestSnapshot();
    if (!asOf) return null;

    return {
      base: FX_BASE_CURRENCY,
      as_of: asOf,
      source: loadEnv().FX_RATES_SOURCE,
      rates,
    };
  }
}
