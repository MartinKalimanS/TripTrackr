/**
 * FX snapshot cache — tasks.md T206 (research D-10, D-26, D-28).
 *
 * `GET /fx-rates` is written here whole, replacing the previous snapshot, and
 * read back whenever an expense is logged. Conversion uses the SAME
 * `crossRate` / `convertAmount` the server uses (`@triptrackr/contracts`), so
 * an expense converted on the device in aeroplane mode carries exactly the
 * rate the server would have frozen from the same snapshot — and the server
 * stores what the device sent (rest-api.md §7). With no snapshot, or a
 * currency the snapshot does not quote, the expense is stored `fx_pending`
 * and the server backfills it later (Constitution II).
 *
 * Reference data: refreshed, never pushed, no `is_dirty`.
 */
import {
  convertAmount,
  crossRate,
  type FxRatesResponse,
  type UsdRates,
} from '@triptrackr/contracts';

import type { AppDatabase } from '@/db/client';
import { fxRates } from '@/db/schema';

import { chunk } from './shared';

export interface FxSnapshot {
  asOf: string;
  source: string;
  rates: UsdRates;
}

/** The conversion to freeze onto a local expense, or null for `fx_pending`. */
export interface LocalConversion {
  fx_rate_to_home: string;
  amount_home: string;
}

/** Well under SQLite's default 999 bound-parameter ceiling at four columns a row. */
const ROWS_PER_STATEMENT = 200;

/** Every row, live-queryable — screens that show freshness subscribe to this. */
function snapshotQuery(db: AppDatabase) {
  return db.select().from(fxRates).orderBy(fxRates.quote_currency);
}

/** The cached snapshot, or null when the device has never seen one. */
function snapshot(db: AppDatabase): FxSnapshot | null {
  const rows = snapshotQuery(db).all();
  const first = rows[0];
  if (!first) return null;

  const rates: Record<string, string> = {};
  for (const row of rows) rates[row.quote_currency] = row.rate;
  return { asOf: first.as_of, source: first.source, rates };
}

/** Replaces the cache with the server's snapshot, in one transaction. */
function replaceSnapshot(db: AppDatabase, response: FxRatesResponse): void {
  const rows = Object.entries(response.rates).map(([quote_currency, rate]) => ({
    quote_currency,
    rate,
    as_of: response.as_of,
    source: response.source,
  }));

  db.transaction((tx) => {
    tx.delete(fxRates).run();
    for (const batch of chunk(rows, ROWS_PER_STATEMENT)) {
      if (batch.length > 0) tx.insert(fxRates).values(batch).run();
    }
  });
}

/** `amount` in `from`, converted to `to` from the cache — or null, meaning pending. */
function convert(
  db: AppDatabase,
  amount: string,
  from: string,
  to: string,
): LocalConversion | null {
  const rates = from === to ? {} : (snapshot(db)?.rates ?? {});
  const rate = crossRate(rates, from, to);
  if (rate === null) return null;
  return { fx_rate_to_home: rate, amount_home: convertAmount(amount, rate) };
}

export const fxRatesRepository = { snapshotQuery, snapshot, replaceSnapshot, convert };
