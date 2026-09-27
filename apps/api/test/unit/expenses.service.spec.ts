import { HttpException, HttpStatus } from '@nestjs/common';
import {
  CreateExpenseRequest,
  Expense,
  PatchExpenseRequest,
  SYSTEM_EXPENSE_CATEGORIES,
  type CreateExpenseInput,
  type ListExpensesQuery,
  type Trip,
} from '@triptrackr/contracts';

import type {
  ExpensePatch,
  ExpenseRow,
  ExpensesRepository,
  NewExpense,
} from '@/modules/expenses/expenses.repository';
import { ExpensesService } from '@/modules/expenses/expenses.service';
import type { Conversion, FxService } from '@/modules/expenses/fx.service';
import { tripNotFound, type TripsService } from '@/modules/trips/trips.service';

import { CITY } from '../support/geography';

/**
 * Expense decisions (rest-api.md §7; FR-020, FR-021, FR-022; tasks.md T082), against a
 * stubbed repository, owner view and rate service.
 *
 * The HTTP suites prove the happy paths against PostgreSQL (expenses-fx-freeze,
 * expenses-summary, contract/fx-pending, privacy/expenses). Pinned here are the edges a
 * real database makes awkward to stage:
 *
 *   - a replayed create by client id is the same create (research D-15) — but only on the
 *     same trip: an id taken on another trip, or by a row the policy hides, is one
 *     identical 409 `EXPENSE_ID_UNAVAILABLE` that says nothing about whose it is;
 *   - the rate is resolved once, at entry: a client conversion is stored as sent
 *     (research D-10), a missing leg stores the row `fx_pending` rather than refusing it
 *     (Constitution II), and a patch converts a new amount with the rate already on the
 *     row (FR-022);
 *   - a row tombstoned between a patch's read and its write is the same
 *     `EXPENSE_NOT_FOUND` as a row that never existed (contracts/README.md rule 1);
 *   - unknown cities and unseen categories are `VALIDATION_FAILED` before any write — the
 *     envelope the validation pipe answers with, never a database error (FR-072).
 *
 * Money stays in decimal strings end to end (research D-26).
 */

const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_TRIP_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_TRIP_ID = '44444444-4444-4444-8444-444444444444';
const EXPENSE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GENERATED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const UNSEEN_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
const UNKNOWN_CITY = 999_999;
const CREATED_AT = new Date('2026-06-02T08:00:00.000Z');
const UPDATED_AT = new Date('2026-06-03T09:30:00.000Z');

/** The caller's own trips; the owner view answers anything else with `TRIP_NOT_FOUND`. */
const OWN_TRIPS: ReadonlySet<string> = new Set([TRIP_ID, OTHER_TRIP_ID]);

function ownTrip(id: string): Trip {
  return {
    id,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    title: 'Swiss summer',
    home_currency: 'CHF',
    is_public: false,
    cover_photo_id: null,
    status: 'planning',
    stops: [],
  };
}

/** A live row as the repository reads it: `NUMERIC` columns arrive as decimal strings. */
function expenseRow(overrides: Partial<ExpenseRow> = {}): ExpenseRow {
  return {
    id: EXPENSE_ID,
    tripId: TRIP_ID,
    cityId: null,
    categoryId: FOOD,
    amount: '9.00',
    currency: 'EUR',
    fxRateToHome: '0.888889',
    amountHome: '8.00',
    fxPending: false,
    spentAt: '2026-06-02',
    note: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

/** What `INSERT … RETURNING` hands back for an accepted row. */
function insertedRow(expense: NewExpense): ExpenseRow {
  return expenseRow({
    id: expense.id ?? GENERATED_ID,
    tripId: expense.tripId,
    cityId: expense.cityId,
    categoryId: expense.categoryId,
    amount: expense.amount,
    currency: expense.currency,
    fxRateToHome: expense.fxRateToHome,
    amountHome: expense.amountHome,
    fxPending: expense.fxPending,
    spentAt: expense.spentAt,
    note: expense.note,
  });
}

/** What `UPDATE … RETURNING` hands back: only the keys the patch sets change. */
function patchedRow(current: ExpenseRow, patch: ExpensePatch): ExpenseRow {
  return {
    ...current,
    ...(patch.cityId !== undefined && { cityId: patch.cityId }),
    ...(patch.categoryId !== undefined && { categoryId: patch.categoryId }),
    ...(patch.amount !== undefined && { amount: patch.amount }),
    ...(patch.amountHome !== undefined && { amountHome: patch.amountHome }),
    ...(patch.spentAt !== undefined && { spentAt: patch.spentAt }),
    ...(patch.note !== undefined && { note: patch.note }),
    updatedAt: UPDATED_AT,
  };
}

interface World {
  /** Live rows the caller's policy lets them see. */
  readonly visible?: readonly ExpenseRow[];
  /** Ids held by rows the policy hides: another traveller's, or tombstoned. */
  readonly hiddenIds?: readonly string[];
  readonly knownCities?: readonly number[];
  /** The system rows plus the caller's own; everyone else's are invisible. */
  readonly visibleCategories?: readonly string[];
  /** What the latest snapshot converts to; `null` is a missing leg. */
  readonly conversion?: Conversion | null;
}

/** The repository over a small world: policy-scoped reads, `ON CONFLICT DO NOTHING` inserts. */
function stubRepository(world: World) {
  const live = new Map((world.visible ?? []).map((row) => [row.id, row]));
  const taken = new Set([...live.keys(), ...(world.hiddenIds ?? [])]);
  const cities = new Set(world.knownCities ?? [CITY.zurich]);
  const categories = new Set(world.visibleCategories ?? [FOOD]);

  return {
    listForTrip: jest.fn((tripId: string, _query: ListExpensesQuery) =>
      Promise.resolve([...live.values()].filter((row) => row.tripId === tripId)),
    ),
    findLive: jest.fn((id: string) => Promise.resolve(live.get(id) ?? null)),
    insert: jest.fn((expense: NewExpense) =>
      Promise.resolve(
        expense.id !== undefined && taken.has(expense.id) ? null : insertedRow(expense),
      ),
    ),
    update: jest.fn((id: string, patch: ExpensePatch) => {
      const current = live.get(id);
      return Promise.resolve(current ? patchedRow(current, patch) : null);
    }),
    tombstone: jest.fn((id: string) => Promise.resolve(live.delete(id))),
    cityExists: jest.fn((cityId: number) => Promise.resolve(cities.has(cityId))),
    categoryVisible: jest.fn((id: string) => Promise.resolve(categories.has(id))),
  };
}

function harness(world: World = {}) {
  const repository = stubRepository(world);
  const trips = {
    loadOwned: jest.fn((tripId: string) =>
      OWN_TRIPS.has(tripId)
        ? Promise.resolve(ownTrip(tripId))
        : Promise.reject(tripNotFound()),
    ),
  };
  const fx = {
    convert: jest.fn((_amount: string, _from: string, _to: string) =>
      Promise.resolve(world.conversion ?? null),
    ),
  };
  const service = new ExpensesService(
    repository as unknown as ExpensesRepository,
    trips as unknown as TripsService,
    fx as unknown as FxService,
  );

  return { service, repository, fx };
}

/** A create exactly as the validation pipe hands it over: parsed, defaults applied. */
function createRequest(input: Partial<CreateExpenseInput> = {}): CreateExpenseRequest {
  return CreateExpenseRequest.parse({
    category_id: FOOD,
    amount: '9.00',
    currency: 'EUR',
    spent_at: '2026-06-02',
    ...input,
  });
}

function patchRequest(input: PatchExpenseRequest): PatchExpenseRequest {
  return PatchExpenseRequest.parse(input);
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

/** The envelope the validation pipe answers with; a reference check must read the same. */
function invalid(path: string, message: string) {
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message:
        'Some of the information provided is not valid. Please check it and try again.',
      details: { issues: [{ path, message }] },
    },
  };
}

describe('ExpensesService.create — a replayed create is the same create (research D-15)', () => {
  it('hands back the row already stored under the id on this trip, with the rate frozen at first entry', async () => {
    // Arrange — the snapshot has moved on since the first attempt.
    const { service, repository, fx } = harness({
      visible: [expenseRow()],
      conversion: { fxRateToHome: '0.950000', amountHome: '8.55' },
    });

    // Act
    const replay = await service.create(TRIP_ID, createRequest({ id: EXPENSE_ID }));

    // Assert — the stored conversion, not a new one; nothing written, nothing resolved.
    expect(replay).toEqual({
      id: EXPENSE_ID,
      created_at: '2026-06-02T08:00:00.000Z',
      updated_at: '2026-06-02T08:00:00.000Z',
      trip_id: TRIP_ID,
      city_id: null,
      category_id: FOOD,
      amount: '9.00',
      currency: 'EUR',
      spent_at: '2026-06-02',
      note: null,
      fx_rate_to_home: '0.888889',
      amount_home: '8.00',
      fx_pending: false,
    });
    expect(repository.insert).not.toHaveBeenCalled();
    expect(fx.convert).not.toHaveBeenCalled();
  });

  it('refuses an id taken on another trip, or by a row the policy hides, with one identical 409', async () => {
    // Arrange — the caller's own row on another trip; and a row they cannot see at all.
    const elsewhere = harness({ visible: [expenseRow({ tripId: OTHER_TRIP_ID })] });
    const hidden = harness({ hiddenIds: [EXPENSE_ID] });

    // Act
    const onOtherTrip = await refusal(
      elsewhere.service.create(TRIP_ID, createRequest({ id: EXPENSE_ID })),
    );
    const heldByStranger = await refusal(
      hidden.service.create(TRIP_ID, createRequest({ id: EXPENSE_ID })),
    );

    // Assert — the row on the other trip is not handed back, and neither refusal
    // says whose the id is (contracts/README.md rule 1).
    expect(onOtherTrip).toEqual({
      status: HttpStatus.CONFLICT,
      body: {
        error: {
          code: 'EXPENSE_ID_UNAVAILABLE',
          message: 'That expense id is already in use. Please retry with a new id.',
        },
      },
    });
    expect(heldByStranger).toEqual(onOtherTrip);
  });
});

describe('ExpensesService.create — the rate is resolved once, at entry (FR-021)', () => {
  it('stores a client conversion exactly as sent, without consulting the snapshot (research D-10)', async () => {
    const { service, fx } = harness({
      conversion: { fxRateToHome: '0.950000', amountHome: '8.55' },
    });

    const expense = await service.create(
      TRIP_ID,
      createRequest({ fx_rate_to_home: '0.880000', amount_home: '7.92' }),
    );

    expect(expense).toMatchObject({
      id: GENERATED_ID,
      amount: '9.00',
      fx_rate_to_home: '0.880000',
      amount_home: '7.92',
      fx_pending: false,
    });
    expect(fx.convert).not.toHaveBeenCalled();
  });

  it("converts into the trip's home currency from the snapshot when the client sent no conversion", async () => {
    const { service, fx } = harness({
      conversion: { fxRateToHome: '0.888889', amountHome: '8.00' },
    });

    const expense = await service.create(
      TRIP_ID,
      createRequest({ amount: '9.00', currency: 'EUR' }),
    );

    // The target is the trip's home currency (CHF), read through the owner view.
    expect(fx.convert).toHaveBeenCalledWith('9.00', 'EUR', 'CHF');
    expect(expense).toMatchObject({
      amount: '9.00',
      currency: 'EUR',
      fx_rate_to_home: '0.888889',
      amount_home: '8.00',
      fx_pending: false,
    });
  });

  it('stores the row fx_pending, with neither rate nor home amount, when no rate resolves (Constitution II)', async () => {
    // Arrange — an explicit null conversion is no conversion; the snapshot lacks VND.
    const { service, fx } = harness({ conversion: null });

    // Act
    const expense = await service.create(
      TRIP_ID,
      createRequest({
        amount: '250000.00',
        currency: 'VND',
        fx_rate_to_home: null,
        amount_home: null,
      }),
    );

    // Assert — accepted, not refused, and still a valid wire expense.
    expect(fx.convert).toHaveBeenCalledWith('250000.00', 'VND', 'CHF');
    expect(expense).toMatchObject({
      amount: '250000.00',
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: true,
    });
    expect(Expense.safeParse(expense).success).toBe(true);
  });
});

describe('ExpensesService.create — references are checked before any write (FR-072)', () => {
  it('refuses an unknown city as VALIDATION_FAILED on city_id', async () => {
    const { service, repository } = harness({ knownCities: [CITY.zurich] });

    const { status, body } = await refusal(
      service.create(TRIP_ID, createRequest({ city_id: UNKNOWN_CITY })),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('city_id', 'Unknown city'));
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("refuses a category the caller cannot see — someone else's, or none — as VALIDATION_FAILED on category_id", async () => {
    const { service, repository } = harness({ visibleCategories: [FOOD] });

    const { status, body } = await refusal(
      service.create(TRIP_ID, createRequest({ category_id: UNSEEN_CATEGORY_ID })),
    );

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toEqual(invalid('category_id', 'Unknown category'));
    expect(repository.insert).not.toHaveBeenCalled();
  });
});

describe('ExpensesService — the trip is loaded through the owner view first (FR-027)', () => {
  it("refuses a create on a stranger's trip as TRIP_NOT_FOUND before any expense is looked at", async () => {
    const { service, repository } = harness({ visible: [expenseRow()] });

    const { status, body } = await refusal(
      service.create(STRANGER_TRIP_ID, createRequest({ id: EXPENSE_ID })),
    );

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(repository.findLive).not.toHaveBeenCalled();
    expect(repository.insert).not.toHaveBeenCalled();
  });

  it("lists nothing from a stranger's trip: TRIP_NOT_FOUND before any expense is read", async () => {
    const { service, repository } = harness({
      visible: [expenseRow({ tripId: STRANGER_TRIP_ID })],
    });

    const { status, body } = await refusal(service.list(STRANGER_TRIP_ID, {}));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body).toMatchObject({ error: { code: 'TRIP_NOT_FOUND' } });
    expect(repository.listForTrip).not.toHaveBeenCalled();
  });
});

describe('ExpensesService.patch', () => {
  it('converts a changed amount with the rate already on the row, never a fresh one (FR-022)', async () => {
    // Arrange — the snapshot now says 0.95; the row was frozen at 0.888889.
    const { service, fx } = harness({
      visible: [
        expenseRow({ amount: '9.00', fxRateToHome: '0.888889', amountHome: '8.00' }),
      ],
      conversion: { fxRateToHome: '0.950000', amountHome: '17.10' },
    });

    // Act
    const expense = await service.patch(EXPENSE_ID, patchRequest({ amount: '18.00' }));

    // Assert — 18.00 × 0.888889 = 16.000002, half-up to 16.00; the rate is untouched.
    expect(expense).toMatchObject({
      amount: '18.00',
      fx_rate_to_home: '0.888889',
      amount_home: '16.00',
      fx_pending: false,
      updated_at: UPDATED_AT.toISOString(),
    });
    expect(fx.convert).not.toHaveBeenCalled();
  });

  it('leaves a pending row pending when its amount changes — the worker backfills it', async () => {
    const { service, fx } = harness({
      visible: [expenseRow({ fxRateToHome: null, amountHome: null, fxPending: true })],
      conversion: { fxRateToHome: '0.888889', amountHome: '10.67' },
    });

    const expense = await service.patch(EXPENSE_ID, patchRequest({ amount: '12.00' }));

    expect(expense).toMatchObject({
      amount: '12.00',
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: true,
    });
    expect(fx.convert).not.toHaveBeenCalled();
  });

  it('refuses an unknown city or an unseen category before writing anything', async () => {
    const { service, repository } = harness({
      visible: [expenseRow()],
      knownCities: [CITY.zurich],
      visibleCategories: [FOOD],
    });

    const city = await refusal(
      service.patch(EXPENSE_ID, patchRequest({ city_id: UNKNOWN_CITY })),
    );
    const category = await refusal(
      service.patch(EXPENSE_ID, patchRequest({ category_id: UNSEEN_CATEGORY_ID })),
    );

    expect(city.body).toEqual(invalid('city_id', 'Unknown city'));
    expect(category.body).toEqual(invalid('category_id', 'Unknown category'));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('answers one EXPENSE_NOT_FOUND for a hidden row and for a row tombstoned between read and write', async () => {
    // Arrange — someone else's row (or none); and a row a parallel DELETE removes
    // after the read but before the UPDATE, which then matches nothing.
    const hidden = harness({ hiddenIds: [EXPENSE_ID] });
    const racing = harness({ visible: [expenseRow()] });
    racing.repository.update.mockResolvedValueOnce(null);

    // Act
    const unseen = await refusal(
      hidden.service.patch(EXPENSE_ID, patchRequest({ note: 'mine now' })),
    );
    const vanished = await refusal(
      racing.service.patch(EXPENSE_ID, patchRequest({ note: 'too late' })),
    );

    // Assert
    expect(unseen).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: {
        error: {
          code: 'EXPENSE_NOT_FOUND',
          message: 'Expense does not exist or you do not have access.',
        },
      },
    });
    expect(vanished).toEqual(unseen);
    expect(hidden.repository.update).not.toHaveBeenCalled();
  });
});

describe('ExpensesService.remove', () => {
  it('tombstones a visible row once; deleting it again is EXPENSE_NOT_FOUND', async () => {
    const { service } = harness({ visible: [expenseRow()] });

    await expect(service.remove(EXPENSE_ID)).resolves.toBeUndefined();
    const again = await refusal(service.remove(EXPENSE_ID));

    expect(again.status).toBe(HttpStatus.NOT_FOUND);
    expect(again.body).toMatchObject({ error: { code: 'EXPENSE_NOT_FOUND' } });
  });
});
