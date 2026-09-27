import { convertAmount, crossRate } from '@triptrackr/contracts';

import {
  MIN_FEED_CURRENCIES,
  assertPlausibleSnapshot,
  parseFeedSnapshot,
  readFeedJson,
} from '@/modules/expenses/fx-feed';

/**
 * FR-021 — currency conversion and home-amount precomputation — tasks.md T078.
 *
 * The arithmetic itself (`crossRate`, `convertAmount`, rounding) lives in
 * `@triptrackr/contracts` so the device converts exactly as the server does
 * (research D-26), and is pinned by `packages/contracts/test/money.spec.ts`.
 * What is the API's own is the feed: how a provider's JSON becomes the dated,
 * USD-based snapshot the arithmetic consumes (research D-28) — and the one
 * end-to-end check that the two compose into the frozen conversion.
 */
describe('parseFeedSnapshot (research D-28)', () => {
  const feed = {
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: 'Thu, 24 Sep 2026 00:02:32 +0000',
    rates: { USD: 1, EUR: 0.877372, JPY: 158.127269, VND: 25961.694126, XXX: 0 },
  };

  it('reads the ExchangeRate-API open shape into a dated, USD-based snapshot', () => {
    const snapshot = parseFeedSnapshot(feed);
    expect(snapshot).toEqual({
      asOf: '2026-09-24',
      rates: {
        USD: '1.000000',
        EUR: '0.877372',
        JPY: '158.127269',
        VND: '25961.694126',
      },
    });
  });

  it('reads the Frankfurter shape too, so a self-hosted feed is a URL change', () => {
    const snapshot = parseFeedSnapshot({
      amount: 1,
      base: 'USD',
      date: '2026-09-24',
      rates: { EUR: 0.8774, CHF: 0.8245 },
    });
    expect(snapshot).toEqual({
      asOf: '2026-09-24',
      rates: { USD: '1.000000', EUR: '0.877400', CHF: '0.824500' },
    });
  });

  it('drops keys that are not currency codes and rates that are not usable', () => {
    const snapshot = parseFeedSnapshot({
      ...feed,
      rates: { EUR: 0.9, eur: 0.9, 'X-Y': 1, ZZZ: -1, CHF: '0.8' },
    });
    expect(snapshot.rates).toEqual({ USD: '1.000000', EUR: '0.900000', CHF: '0.800000' });
  });

  it('refuses a feed that is not USD-based, reports failure, or is unrecognisable', () => {
    expect(() => parseFeedSnapshot({ ...feed, base_code: 'EUR' })).toThrow(/USD/);
    expect(() => parseFeedSnapshot({ ...feed, result: 'error' })).toThrow();
    expect(() => parseFeedSnapshot({ hello: 'world' })).toThrow();
    expect(() =>
      parseFeedSnapshot({ ...feed, time_last_update_utc: 'not a date' }),
    ).toThrow(/date/);
  });

  it('composes with the shared arithmetic into the conversion frozen at entry (FR-021)', () => {
    const { rates } = parseFeedSnapshot({
      ...feed,
      rates: { USD: 1, EUR: 0.9, CHF: 0.8 },
    });
    const rate = crossRate(rates, 'EUR', 'CHF');
    expect(rate).toBe('0.888889');
    expect(convertAmount('9.00', rate as string)).toBe('8.00');
  });
});

describe('feed plausibility (research D-28)', () => {
  const rates = (count: number): Record<string, number> => {
    const out: Record<string, number> = { USD: 1 };
    for (let i = 0; i < count; i += 1) {
      out[
        `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`
      ] = 1 + i;
    }
    return out;
  };
  const feedOf = (r: Record<string, number>) => ({
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: '2026-09-24T00:00:00Z',
    rates: r,
  });

  it('refuses a snapshot that quotes fewer currencies than the minimum', () => {
    expect(() => assertPlausibleSnapshot(parseFeedSnapshot(feedOf(rates(3))))).toThrow(
      /currenc/i,
    );
  });

  it('accepts a snapshot at the minimum', () => {
    expect(() =>
      assertPlausibleSnapshot(parseFeedSnapshot(feedOf(rates(MIN_FEED_CURRENCIES)))),
    ).not.toThrow();
  });

  it('honours an explicit minimum', () => {
    expect(() =>
      assertPlausibleSnapshot(parseFeedSnapshot(feedOf(rates(3))), 1),
    ).not.toThrow();
  });

  it('drops non-positive rates and rates above the column maximum', () => {
    const snapshot = parseFeedSnapshot(
      feedOf({ USD: 1, EUR: 0.9, ZER: 0, NEG: -2, HUG: 100_000_000 }),
    );
    expect(Object.keys(snapshot.rates).sort()).toEqual(['EUR', 'USD']);
  });
});

describe('readFeedJson', () => {
  const jsonResponse = (text: string, headers: Record<string, string> = {}) =>
    new Response(text, { status: 200, headers });

  it('parses a body under the cap', async () => {
    await expect(readFeedJson(jsonResponse('{"a":1}'), 100)).resolves.toEqual({ a: 1 });
  });

  it('refuses a body whose declared length exceeds the cap', async () => {
    const response = jsonResponse('{}', { 'content-length': '5000' });
    await expect(readFeedJson(response, 100)).rejects.toThrow(/too large/i);
  });

  it('refuses a body that streams past the cap with no declared length', async () => {
    const response = jsonResponse(JSON.stringify({ pad: 'x'.repeat(500) }));
    await expect(readFeedJson(response, 100)).rejects.toThrow(/too large/i);
  });

  it('refuses a response that carries no body at all, rather than reading it as a snapshot', async () => {
    // A 204 — or a proxy that answers with headers only — has `body: null`.
    const response = new Response(null, { status: 204 });
    await expect(readFeedJson(response)).rejects.toThrow(/no body/i);
  });
});
