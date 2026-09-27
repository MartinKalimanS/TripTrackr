import type { NestExpressApplication } from '@nestjs/platform-express';
import { ExpenseResponse, FxRatesResponse } from '@triptrackr/contracts';
import type { Sql } from 'postgres';
import request from 'supertest';

import { refreshFxRates } from '@/workers/fx-refresh.processor';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { apiSql, migrationSql } from '../support/db';
import { FOOD, createTripFor } from '../support/expenses';
import { seedGeography } from '../support/geography';

/**
 * The daily FX refresh (research D-10, D-28) — tasks.md T081.
 *
 * The processor is run directly with a stubbed `fetch`, against the real
 * database, through the API role's connection — exactly what the worker
 * process gives it. It must (1) upsert one row per currency for the feed's
 * date, (2) backfill every expense that was waiting for a rate, freezing the
 * rate it found, and (3) leave a row that already has a rate alone (FR-022).
 * `GET /fx-rates` then serves the same snapshot to the device.
 *
 * Currencies are private to this file (`XRH` home, `XRE` spend, `XRF` for the
 * failing feed) because every spec shares one `fx_rates` table: a pending
 * expense here must stay pending until THIS feed quotes its currency, whatever
 * another file seeds in the meantime.
 */
const HOME = 'XRH';
const SPEND = 'XRE';
const NEVER_QUOTED = 'XRF';

describe('fx refresh', () => {
  let app: NestExpressApplication;
  let owner: Sql;
  let api: Sql;
  let traveller: RegisteredTraveller;
  let tripId: string;

  const feed = (rates: Record<string, number>, date: string) => ({
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: `${date}T00:02:32.000Z`,
    rates,
  });

  const fetchStub =
    (body: unknown, ok = true): typeof fetch =>
    () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: ok ? 200 : 503,
          headers: { 'content-type': 'application/json' },
        }),
      );

  beforeAll(async () => {
    app = await bootTestApp();
    owner = migrationSql();
    api = apiSql();
    await seedGeography(owner);
    traveller = await registerTraveller(app);
    tripId = await createTripFor(app, traveller, HOME);
  });

  afterAll(async () => {
    await api?.end();
    await owner?.end();
    await app?.close();
  });

  const auth = () => bearer(traveller.tokens.access_token);
  const server = () => request(app.getHttpServer());

  it('upserts the snapshot, backfills pending expenses, and leaves frozen rows alone', async () => {
    // Arrange — with no rate for the pair, an expense is stored pending…
    const pendingResponse = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '9.00',
        currency: SPEND,
        spent_at: '2026-06-03',
      });
    expect(pendingResponse.status).toBe(201);
    const pending = ExpenseResponse.parse(pendingResponse.body).expense;
    expect(pending.fx_pending).toBe(true);

    // …and a client-converted one is stored as sent.
    const frozenResponse = await server()
      .post(`/v1/trips/${tripId}/expenses`)
      .set(auth())
      .send({
        category_id: FOOD,
        amount: '10.00',
        currency: SPEND,
        spent_at: '2026-06-03',
        fx_rate_to_home: '0.950000',
        amount_home: '9.50',
      });
    const frozen = ExpenseResponse.parse(frozenResponse.body).expense;

    // Act — the daily job runs against a feed that quotes both legs.
    const result = await refreshFxRates({
      sql: api,
      fetch: fetchStub(feed({ USD: 1, [SPEND]: 0.9, [HOME]: 0.8 }, '2026-06-10')),
      url: 'https://feed.example.test/latest/USD',
    });

    // Assert — the snapshot landed…
    expect(result).toMatchObject({ asOf: '2026-06-10', currencies: 3 });
    expect(result.backfilled).toBeGreaterThanOrEqual(1);
    const rows = await owner<{ quote_currency: string; rate: string }[]>`
      SELECT quote_currency, rate::text FROM fx_rates
      WHERE as_of = '2026-06-10' AND quote_currency IN (${SPEND}, ${HOME})
      ORDER BY quote_currency
    `;
    expect(rows).toEqual([
      { quote_currency: SPEND, rate: '0.900000' },
      { quote_currency: HOME, rate: '0.800000' },
    ]);

    // …the pending row was backfilled with the rate now available…
    const [backfilled] = await owner<
      {
        fx_rate_to_home: string | null;
        amount_home: string | null;
        fx_pending: boolean;
      }[]
    >`
      SELECT fx_rate_to_home::text, amount_home::text, fx_pending
      FROM expenses WHERE id = ${pending.id}::uuid
    `;
    expect(backfilled).toEqual({
      fx_rate_to_home: '0.888889',
      amount_home: '8.00',
      fx_pending: false,
    });

    // …and the frozen row did not move (FR-022).
    const [untouched] = await owner<{ fx_rate_to_home: string; amount_home: string }[]>`
      SELECT fx_rate_to_home::text, amount_home::text FROM expenses WHERE id = ${frozen.id}::uuid
    `;
    expect(untouched).toEqual({ fx_rate_to_home: '0.950000', amount_home: '9.50' });

    // Running the same day twice is an upsert, not a duplicate and not an error,
    // and nothing is left to backfill for this pair.
    const again = await refreshFxRates({
      sql: api,
      fetch: fetchStub(feed({ USD: 1, [SPEND]: 0.91, [HOME]: 0.8 }, '2026-06-10')),
      url: 'https://feed.example.test/latest/USD',
    });
    expect(again.asOf).toBe('2026-06-10');
    const [spend] = await owner<{ rate: string; n: string }[]>`
      SELECT rate::text, count(*) OVER ()::text AS n FROM fx_rates
      WHERE as_of = '2026-06-10' AND quote_currency = ${SPEND}
    `;
    expect(spend).toEqual({ rate: '0.910000', n: '1' });
    const [stillOnce] = await owner<{ fx_rate_to_home: string }[]>`
      SELECT fx_rate_to_home::text FROM expenses WHERE id = ${pending.id}::uuid
    `;
    expect(stillOnce?.fx_rate_to_home).toBe('0.888889');
  });

  it('GET /fx-rates serves the newest rate per currency to the device (research D-10)', async () => {
    const response = await server().get('/v1/fx-rates').set(auth());

    expect(response.status).toBe(200);
    const snapshot = FxRatesResponse.parse(response.body);
    expect(snapshot.base).toBe('USD');
    expect(snapshot.rates).toMatchObject({
      [SPEND]: '0.910000',
      [HOME]: '0.800000',
      USD: '1.000000',
    });
    expect(snapshot.as_of >= '2026-06-10').toBe(true);
    expect(snapshot.source).toEqual(expect.any(String));
  });

  it('GET /fx-rates requires a session — it is not a free proxy for the feed', async () => {
    const response = await server().get('/v1/fx-rates');
    expect(response.status).toBe(401);
  });

  it('a failing feed changes nothing and is reported, not swallowed', async () => {
    await expect(
      refreshFxRates({
        sql: api,
        fetch: fetchStub({ result: 'error', rates: { [NEVER_QUOTED]: 2 } }, false),
        url: 'https://feed.example.test/latest/USD',
      }),
    ).rejects.toThrow(/503/);

    const rows = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM fx_rates WHERE quote_currency = ${NEVER_QUOTED}
    `;
    expect(rows[0]?.n).toBe('0');
  });

  it('a feed in another base is refused before anything is written', async () => {
    await expect(
      refreshFxRates({
        sql: api,
        fetch: fetchStub({
          ...feed({ [NEVER_QUOTED]: 2 }, '2026-06-11'),
          base_code: 'EUR',
        }),
        url: 'https://feed.example.test/latest/EUR',
      }),
    ).rejects.toThrow(/USD/);

    const rows = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM fx_rates WHERE quote_currency = ${NEVER_QUOTED}
    `;
    expect(rows[0]?.n).toBe('0');
  });
});
