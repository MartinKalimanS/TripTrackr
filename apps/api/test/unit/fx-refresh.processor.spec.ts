import type { Sql } from 'postgres';

import { MAX_FEED_BYTES, MIN_FEED_CURRENCIES } from '@/modules/expenses/fx-feed';
import { refreshFxRates } from '@/workers/fx-refresh.processor';

/**
 * The worker path of the daily FX refresh (tasks.md T081; research D-28) must
 * apply the guards `fx-feed.ts` defines: a body over the size cap and a
 * snapshot quoting implausibly few currencies are both refused before a single
 * statement runs, so the previous snapshot stays in place.
 */
function fakeSql() {
  const begin = jest.fn().mockResolvedValue(undefined);
  const query = jest.fn().mockResolvedValue([]);
  const sql = Object.assign(query, { begin }) as unknown as Sql;
  return { sql, query, begin };
}

/** A USD-based ExchangeRate-API body quoting exactly `currencies` codes. */
function feedOf(currencies: number): string {
  const rates: Record<string, number> = { USD: 1 };
  for (let i = 0; i < currencies - 1; i += 1) {
    const code = `Q${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`;
    rates[code] = 1 + i;
  }
  return JSON.stringify({
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: '2026-09-24T00:00:00Z',
    rates,
  });
}

const respond =
  (body: string, headers: Record<string, string> = {}): typeof fetch =>
  () =>
    Promise.resolve(new Response(body, { status: 200, headers }));

const FEED_URL = 'https://feed.example.test/latest/USD';

describe('refreshFxRates feed guards (research D-28)', () => {
  it('refuses a body larger than the cap before touching the database', async () => {
    const { sql, query, begin } = fakeSql();

    await expect(
      refreshFxRates({
        sql,
        fetch: respond('{}', { 'content-length': String(MAX_FEED_BYTES + 1) }),
        url: FEED_URL,
      }),
    ).rejects.toThrow(/too large/i);
    expect(begin).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('refuses a snapshot quoting fewer currencies than the floor before touching the database', async () => {
    const { sql, query, begin } = fakeSql();

    await expect(
      refreshFxRates({
        sql,
        fetch: respond(feedOf(MIN_FEED_CURRENCIES - 1)),
        url: FEED_URL,
      }),
    ).rejects.toThrow(/currencies/i);
    expect(begin).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('applies a snapshot at the floor', async () => {
    const { sql, begin } = fakeSql();

    const result = await refreshFxRates({
      sql,
      fetch: respond(feedOf(MIN_FEED_CURRENCIES)),
      url: FEED_URL,
    });

    expect(begin).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      asOf: '2026-09-24',
      currencies: MIN_FEED_CURRENCIES,
      backfilled: 0,
    });
  });
});
