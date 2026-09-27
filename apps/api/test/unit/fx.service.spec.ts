import { HttpException, HttpStatus } from '@nestjs/common';
import { FxRatesResponse } from '@triptrackr/contracts';

import { resetEnvCache } from '@/common/config/env.schema';
import { FxController } from '@/modules/expenses/fx.controller';
import { FxService } from '@/modules/expenses/fx.service';

import { applyUnitTestEnv } from '../support/env';

jest.mock('@/common/db/rls-db', () => ({ rlsDb: jest.fn() }));

const { rlsDb } = jest.requireMock<{ rlsDb: jest.Mock }>('@/common/db/rls-db');

/**
 * The FX snapshot on the request path (tasks.md T081; FR-021; research D-10, D-26, D-28):
 * `FxService` over a stubbed `fx_rates` read, and `GET /fx-rates` (rest-api.md §11) on top
 * of it.
 *
 * The query itself — the newest USD leg per currency — runs against PostgreSQL in
 * test/integration/fx-refresh.spec.ts. What is pinned here is what the service makes of
 * the legs it is handed: a stored leg that is not a usable rate is skipped, so it neither
 * quotes its currency nor dates the snapshot; a currency converts into itself without any
 * snapshot at all; a missing leg is `null` — the caller's `fx_pending`, Constitution II —
 * never an invented number; and a deployment whose worker has not written a snapshot yet
 * answers `GET /fx-rates` with 503 `FX_RATES_UNAVAILABLE`, a temporary condition rather
 * than a client mistake, so the device keeps the snapshot it already holds.
 */

/** One row of the `fx_rates` read: `char(3)`, `NUMERIC(14,6)` and `date` all arrive as text. */
interface Leg {
  readonly quote: string;
  readonly rate: string;
  readonly asOf: string;
}

/** Answers `latestSnapshot()`'s `selectDistinctOn … from … where … orderBy` with `legs`. */
function fxRatesTableHolding(legs: readonly Leg[]): void {
  const orderBy = jest.fn(() => Promise.resolve(legs));
  const where = jest.fn(() => ({ orderBy }));
  const from = jest.fn(() => ({ where }));
  rlsDb.mockReturnValue({ selectDistinctOn: jest.fn(() => ({ from })) });
}

/** The HttpException a call was refused with; a call that succeeds fails the test. */
async function refusal(
  call: Promise<unknown>,
): Promise<{ status: number; body: unknown }> {
  const outcome: unknown = await call.then(
    () => new Error('Expected a refusal, but the call succeeded.'),
    (error: unknown) => error,
  );
  if (!(outcome instanceof HttpException)) throw outcome;

  return { status: outcome.getStatus(), body: outcome.getResponse() };
}

const SOURCE = 'https://rates.example.test';

/** Tables that give the device nothing to cache. */
const UNSERVABLE: readonly [string, readonly Leg[]][] = [
  ['the table is empty — the worker has not run yet', []],
  [
    'every stored leg is unusable',
    [{ quote: 'XAU', rate: '0.000000', asOf: '2026-09-25' }],
  ],
];

beforeEach(() => {
  rlsDb.mockReset();
  applyUnitTestEnv({ FX_RATES_SOURCE: SOURCE });
});

afterAll(() => resetEnvCache());

describe('FxService.latestSnapshot', () => {
  it('keeps one leg per currency and dates the snapshot by the newest of them', async () => {
    fxRatesTableHolding([
      { quote: 'CHF', rate: '0.800000', asOf: '2026-09-23' },
      { quote: 'EUR', rate: '0.900000', asOf: '2026-09-24' },
      { quote: 'JPY', rate: '150.000000', asOf: '2026-09-22' },
    ]);

    await expect(new FxService().latestSnapshot()).resolves.toEqual({
      asOf: '2026-09-24',
      rates: { CHF: '0.800000', EUR: '0.900000', JPY: '150.000000' },
    });
  });

  it('skips a stored leg that is not a usable rate: it neither quotes its currency nor dates the snapshot', async () => {
    fxRatesTableHolding([
      { quote: 'EUR', rate: '0.900000', asOf: '2026-09-24' },
      { quote: 'XAU', rate: '0.000000', asOf: '2026-09-25' },
    ]);

    await expect(new FxService().latestSnapshot()).resolves.toEqual({
      asOf: '2026-09-24',
      rates: { EUR: '0.900000' },
    });
  });
});

describe('FxService.convert — the conversion frozen at entry (FR-021)', () => {
  it('converts a currency into itself at exactly 1, without reading a snapshot at all', async () => {
    await expect(new FxService().convert('12.34', 'CHF', 'CHF')).resolves.toEqual({
      fxRateToHome: '1.000000',
      amountHome: '12.34',
    });
    expect(rlsDb).not.toHaveBeenCalled();
  });

  it('derives the cross rate from the USD legs in decimal arithmetic (research D-26)', async () => {
    fxRatesTableHolding([
      { quote: 'CHF', rate: '0.800000', asOf: '2026-05-01' },
      { quote: 'EUR', rate: '0.900000', asOf: '2026-05-01' },
    ]);

    // EUR→CHF = 0.80 / 0.90 = 0.888889; 9.00 × 0.888889 = 8.000001 → 8.00.
    await expect(new FxService().convert('9.00', 'EUR', 'CHF')).resolves.toEqual({
      fxRateToHome: '0.888889',
      amountHome: '8.00',
    });
  });

  it('answers null — fx_pending — when a leg is missing, rather than inventing a rate (Constitution II)', async () => {
    fxRatesTableHolding([{ quote: 'EUR', rate: '0.900000', asOf: '2026-05-01' }]);

    await expect(new FxService().convert('9.00', 'EUR', 'VND')).resolves.toBeNull();
  });
});

describe('FxService.snapshotForDevice — the snapshot the device caches (research D-10)', () => {
  it('serves the USD-based snapshot with the configured attribution (research D-28)', async () => {
    fxRatesTableHolding([
      { quote: 'EUR', rate: '0.877372', asOf: '2026-09-24' },
      { quote: 'JPY', rate: '158.127269', asOf: '2026-09-24' },
    ]);

    const snapshot = await new FxService().snapshotForDevice();

    expect(snapshot).toEqual({
      base: 'USD',
      as_of: '2026-09-24',
      source: SOURCE,
      rates: { EUR: '0.877372', JPY: '158.127269' },
    });
    expect(FxRatesResponse.safeParse(snapshot).success).toBe(true);
  });

  it.each(UNSERVABLE)('has nothing to serve when %s', async (_case, legs) => {
    fxRatesTableHolding(legs);

    await expect(new FxService().snapshotForDevice()).resolves.toBeNull();
  });
});

describe('FxController.latest — GET /fx-rates (rest-api.md §11)', () => {
  it.each(UNSERVABLE)('answers 503 FX_RATES_UNAVAILABLE when %s', async (_case, legs) => {
    fxRatesTableHolding(legs);

    const answer = await refusal(new FxController(new FxService()).latest());

    expect(answer).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      body: {
        error: {
          code: 'FX_RATES_UNAVAILABLE',
          message: 'Exchange rates are not available yet. Please try again later.',
        },
      },
    });
  });

  it('returns the snapshot through its contract once the worker has written one', async () => {
    fxRatesTableHolding([{ quote: 'EUR', rate: '0.877372', asOf: '2026-09-24' }]);

    await expect(new FxController(new FxService()).latest()).resolves.toEqual({
      base: 'USD',
      as_of: '2026-09-24',
      source: SOURCE,
      rates: { EUR: '0.877372' },
    });
  });
});
