import {
  FX_BASE_CURRENCY,
  fitsRateColumn,
  formatRate,
  type UsdRates,
} from '@triptrackr/contracts';
import { z } from 'zod';

/**
 * The rate feed's wire shape — research D-28.
 *
 * Two public feeds are understood so that the provider is a URL change
 * (`FX_RATES_URL`), not a code change:
 *
 *   - ExchangeRate-API's open endpoint (the default): `{ result, base_code,
 *     time_last_update_utc, rates }`, ~160 currencies, no key.
 *   - Frankfurter (`/latest?from=USD`, self-hostable, ECB data): `{ base, date,
 *     rates }` — the exit route for a deployment that must make no third-party
 *     call.
 *
 * Whatever the feed, the snapshot must be USD-based: every cross rate is
 * derived from USD legs (`crossRate` in @triptrackr/contracts, research D-26), and a snapshot in another base would
 * silently make every conversion wrong. A feed that is not USD-based is
 * refused, loudly.
 */

export interface FeedSnapshot {
  /** The feed's own date for the rates, `YYYY-MM-DD`. */
  readonly asOf: string;
  /** One USD in each currency, already formatted as the wire spells a rate. */
  readonly rates: UsdRates;
}

const CurrencyRates = z.record(z.string(), z.union([z.number(), z.string()]));

const ExchangeRateApiFeed = z.object({
  result: z.literal('success'),
  base_code: z.string(),
  time_last_update_utc: z.string(),
  rates: CurrencyRates,
});

const FrankfurterFeed = z.object({
  base: z.string(),
  date: z.string(),
  rates: CurrencyRates,
});

const CURRENCY_CODE = /^[A-Z]{3}$/;

/**
 * "Thu, 24 Sep 2026 00:02:32 +0000" (RFC 1123), an ISO instant, or a bare
 * `YYYY-MM-DD` — all read as the UTC calendar day the feed published for.
 */
function toIsoDate(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`Rate feed carries an unreadable date: ${value}`);
  return new Date(ms).toISOString().slice(0, 10);
}

function toRates(raw: Record<string, number | string>): UsdRates {
  const rates: Record<string, string> = { [FX_BASE_CURRENCY]: formatRate(1) as string };
  for (const [code, value] of Object.entries(raw)) {
    if (!CURRENCY_CODE.test(code)) continue;
    const rate = formatRate(value);
    // Non-positive, unreadable and out-of-column rates are dropped: that
    // currency simply stays on its last known rate (or `fx_pending`).
    if (rate !== null && fitsRateColumn(rate)) rates[code] = rate;
  }
  return rates;
}

function assertUsdBase(base: string): void {
  if (base.toUpperCase() !== FX_BASE_CURRENCY) {
    throw new Error(
      `Rate feed is ${base}-based; only a ${FX_BASE_CURRENCY}-based snapshot is accepted (research D-28).`,
    );
  }
}

/** A feed larger than this is not a rate table; refuse it before parsing. */
export const MAX_FEED_BYTES = 1_048_576;

/**
 * Fewer currencies than this is a truncated or wrong feed (Frankfurter, the
 * smallest supported, quotes ~30). Applying it would leave most pairs stale.
 */
export const MIN_FEED_CURRENCIES = 20;

/** Refuses a snapshot that quotes implausibly few currencies. */
export function assertPlausibleSnapshot(
  snapshot: FeedSnapshot,
  minCurrencies: number = MIN_FEED_CURRENCIES,
): void {
  const count = Object.keys(snapshot.rates).length;
  if (count < minCurrencies) {
    throw new Error(
      `Rate feed quotes only ${count} usable currencies (minimum ${minCurrencies}); keeping the previous snapshot.`,
    );
  }
}

/** Reads a JSON body without ever buffering more than `maxBytes`. */
export async function readFeedJson(
  response: Response,
  maxBytes: number = MAX_FEED_BYTES,
): Promise<unknown> {
  const tooLarge = () =>
    new Error(`Rate feed response is too large (over ${maxBytes} bytes).`);

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();

  // Node types `Response.body` as `ReadableStream<any>`; a fetch body is bytes.
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    response.body?.getReader();
  if (!reader) throw new Error('Rate feed response has no body.');

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Parses either understood feed shape; throws on anything else. */
export function parseFeedSnapshot(body: unknown): FeedSnapshot {
  const era = ExchangeRateApiFeed.safeParse(body);
  if (era.success) {
    assertUsdBase(era.data.base_code);
    return {
      asOf: toIsoDate(era.data.time_last_update_utc),
      rates: toRates(era.data.rates),
    };
  }

  const frankfurter = FrankfurterFeed.safeParse(body);
  if (frankfurter.success) {
    assertUsdBase(frankfurter.data.base);
    return {
      asOf: toIsoDate(frankfurter.data.date),
      rates: toRates(frankfurter.data.rates),
    };
  }

  throw new Error('Rate feed response is not a shape this service understands.');
}
