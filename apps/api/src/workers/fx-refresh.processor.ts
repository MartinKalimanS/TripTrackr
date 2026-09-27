import { FX_BASE_CURRENCY, convertAmount, crossRate } from '@triptrackr/contracts';
import type { Sql } from 'postgres';

import { parseFeedSnapshot } from '@/modules/expenses/fx-feed';

/**
 * The daily FX refresh — tasks.md T081 (FR-021; research D-10, D-28).
 *
 * Runs in the worker as a BullMQ job scheduler's job (queue `fx-refresh`):
 * fetch one USD-based snapshot from `FX_RATES_URL`, validate its shape, upsert
 * one `fx_rates` row per currency for the feed's own date, then backfill
 * every expense that has been waiting for a rate. Backfill writes ONLY rows
 * with `fx_pending = true`; a row that already carries a rate is frozen and
 * never revisited (FR-022).
 *
 * The connection is the API role's (`DATABASE_URL`), outside any request
 * transaction. `fx_rates` is reference data with no policy, so the upsert is
 * plain SQL. `expenses` is policed, and a worker has no traveller identity —
 * `expenses_owner_only` would show it nothing — so the backfill goes through
 * two SECURITY DEFINER keyholes owned by the migration role (0009):
 * `fx_pending_expenses()` returns exactly the pending rows with their trip's
 * home currency, and `fx_backfill_expense()` writes exactly one pending row.
 * Neither can reach a row that already has a rate.
 *
 * Any failure throws: BullMQ records the attempt and retries with backoff,
 * and the previous snapshot stays in place — a stale rate is a known, dated
 * rate, which is better than none and far better than a wrong one.
 */

export interface FxRefreshDeps {
  /** API-role PostgreSQL connection. */
  readonly sql: Sql;
  /** Injected so the processor can be exercised without the network. */
  readonly fetch: typeof fetch;
  readonly url: string;
}

export interface FxRefreshResult {
  readonly asOf: string;
  readonly currencies: number;
  readonly backfilled: number;
}

/** How long to wait for the feed before giving up on this attempt. */
const FEED_TIMEOUT_MS = 15_000;

export async function refreshFxRates({
  sql,
  fetch,
  url,
}: FxRefreshDeps): Promise<FxRefreshResult> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Rate feed answered ${response.status}; keeping the previous snapshot.`,
    );
  }

  const snapshot = parseFeedSnapshot(await response.json());
  const entries = Object.entries(snapshot.rates);

  await sql.begin(async (tx) => {
    for (const [quote, rate] of entries) {
      await tx`
        INSERT INTO fx_rates (base_currency, quote_currency, rate, as_of)
        VALUES (${FX_BASE_CURRENCY}, ${quote}, ${rate}::numeric, ${snapshot.asOf}::date)
        ON CONFLICT (base_currency, quote_currency, as_of) DO UPDATE SET rate = EXCLUDED.rate
      `;
    }
  });

  const backfilled = await backfillPending(sql, snapshot.rates);

  return { asOf: snapshot.asOf, currencies: entries.length, backfilled };
}

/** Freezes a rate onto every pending expense whose pair the snapshot now resolves. */
async function backfillPending(
  sql: Sql,
  rates: Readonly<Record<string, string>>,
): Promise<number> {
  const pending = await sql<
    { id: string; amount: string; currency: string; home_currency: string }[]
  >`SELECT id, amount::text, currency, home_currency FROM fx_pending_expenses()`;

  let count = 0;
  for (const row of pending) {
    const rate = crossRate(rates, row.currency.trim(), row.home_currency.trim());
    if (rate === null) continue;

    const updated = await sql<{ id: string }[]>`
      SELECT id FROM fx_backfill_expense(
        ${row.id}::uuid, ${rate}::numeric, ${convertAmount(row.amount, rate)}::numeric
      )
    `;
    count += updated.length;
  }
  return count;
}
