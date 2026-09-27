/**
 * REST DTO contracts for User Story 2 (contracts/rest-api.md §4, §7, §11).
 *
 * The posture is the same as the sync tests: strict shapes, so a field the
 * contract does not name is a refusal — and the field FR-027 forbids anyone
 * to ever add to an expense, a visibility flag, is proven refused on every
 * write shape that touches one (contract test 9).
 */
import {
  CreateExpenseCategoryRequest,
  CreateExpenseRequest,
  CreateNoteRequest,
  Expense,
  ExpenseSummary,
  FxRatesResponse,
  ListExpensesQuery,
  ListNotesQuery,
  Note,
  PatchExpenseRequest,
  PatchNoteRequest,
  SYSTEM_EXPENSE_CATEGORIES,
  SYSTEM_EXPENSE_CATEGORY_IDS,
  Uuid,
  isSystemExpenseCategory,
} from '../src';

const UUID = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';
const NOW = '2026-09-24T10:12:03.000Z';

describe('notes (FR-017, FR-018, FR-019)', () => {
  it('accepts the three anchor levels as one shape', () => {
    expect(CreateNoteRequest.safeParse({ body: 'Tripwide', country_id: 1 }).success).toBe(
      true,
    );
    expect(
      CreateNoteRequest.safeParse({ body: 'Country', country_id: 1, city_id: null })
        .success,
    ).toBe(true);
    expect(
      CreateNoteRequest.safeParse({ body: 'City', country_id: 1, city_id: 100 }).success,
    ).toBe(true);
  });

  it('refuses a note with no anchor at all (FR-019), naming country_id', () => {
    const result = CreateNoteRequest.safeParse({ body: 'Nowhere' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toContain('country_id');
    }
  });

  it('defaults a new note to private and no title (Constitution I)', () => {
    const parsed = CreateNoteRequest.parse({ body: 'x', city_id: 100 });
    expect(parsed.is_public).toBe(false);
    expect(parsed.title).toBeNull();
    expect(parsed.country_id).toBeNull();
  });

  it('refuses an empty body and an unknown key', () => {
    expect(CreateNoteRequest.safeParse({ body: '', country_id: 1 }).success).toBe(false);
    expect(
      CreateNoteRequest.safeParse({ body: 'x', country_id: 1, owner_id: UUID }).success,
    ).toBe(false);
  });

  it('a patch may move a note between levels and must change something', () => {
    expect(PatchNoteRequest.safeParse({ city_id: 100 }).success).toBe(true);
    expect(PatchNoteRequest.safeParse({ city_id: null }).success).toBe(true);
    expect(PatchNoteRequest.safeParse({}).success).toBe(false);
    expect(PatchNoteRequest.safeParse({ trip_id: UUID }).success).toBe(false);
  });

  it('the list query coerces its numeric filters from the query string', () => {
    expect(ListNotesQuery.parse({ city_id: '100' })).toEqual({ city_id: 100 });
    expect(ListNotesQuery.safeParse({ city_id: 'abc' }).success).toBe(false);
  });

  it('the read shape carries no tombstone and still requires an anchor', () => {
    const note = {
      id: UUID,
      created_at: NOW,
      updated_at: NOW,
      trip_id: UUID,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'x',
      is_public: false,
    };
    expect(Note.safeParse(note).success).toBe(true);
    expect(Note.safeParse({ ...note, deleted_at: null }).success).toBe(false);
    expect(Note.safeParse({ ...note, country_id: null }).success).toBe(false);
  });
});

describe('expense categories (FR-023, FR-024, research D-29)', () => {
  it('publishes six system categories with fixed, valid, distinct ids', () => {
    expect(SYSTEM_EXPENSE_CATEGORIES.map((c) => c.name)).toEqual([
      'Food',
      'Lodging',
      'Transport',
      'Activities',
      'Shopping',
      'Other',
    ]);
    for (const category of SYSTEM_EXPENSE_CATEGORIES) {
      expect(Uuid.safeParse(category.id).success).toBe(true);
      expect(isSystemExpenseCategory(category.id)).toBe(true);
    }
    expect(SYSTEM_EXPENSE_CATEGORY_IDS.size).toBe(6);
    expect(isSystemExpenseCategory(UUID)).toBe(false);
  });

  it('a custom category needs a name and may choose its own id', () => {
    expect(CreateExpenseCategoryRequest.parse({ name: ' Coffee ' })).toEqual({
      name: 'Coffee',
      icon: null,
    });
    expect(CreateExpenseCategoryRequest.safeParse({ name: '  ' }).success).toBe(false);
    expect(
      CreateExpenseCategoryRequest.safeParse({ name: 'x', user_id: UUID }).success,
    ).toBe(false);
  });
});

describe('expenses (FR-020 to FR-027)', () => {
  const create = {
    category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
    amount: '12.50',
    currency: 'EUR',
    spent_at: '2026-05-12',
  };

  it('accepts an expense with no conversion, or with both halves of one', () => {
    expect(CreateExpenseRequest.parse(create)).toMatchObject({
      ...create,
      city_id: null,
      note: null,
    });
    expect(
      CreateExpenseRequest.safeParse({
        ...create,
        fx_rate_to_home: '0.877372',
        amount_home: '10.97',
      }).success,
    ).toBe(true);
  });

  it('refuses half a client conversion — a rate without the amount, or the reverse', () => {
    expect(
      CreateExpenseRequest.safeParse({ ...create, fx_rate_to_home: '0.9' }).success,
    ).toBe(false);
    expect(
      CreateExpenseRequest.safeParse({ ...create, amount_home: '11.25' }).success,
    ).toBe(false);
  });

  it.each(['is_public', 'visibility', 'public', 'shared'])(
    'contract test 9: refuses a %s key on create and on patch (FR-027)',
    (key) => {
      expect(CreateExpenseRequest.safeParse({ ...create, [key]: true }).success).toBe(
        false,
      );
      expect(PatchExpenseRequest.safeParse({ amount: '1.00', [key]: true }).success).toBe(
        false,
      );
    },
  );

  it('money is a decimal string, never a float, and a refund is allowed', () => {
    expect(CreateExpenseRequest.safeParse({ ...create, amount: 12.5 }).success).toBe(
      false,
    );
    expect(CreateExpenseRequest.safeParse({ ...create, amount: '12.505' }).success).toBe(
      false,
    );
    expect(CreateExpenseRequest.safeParse({ ...create, amount: '-3.00' }).success).toBe(
      true,
    );
  });

  it('FR-022: the currency is not patchable — a different currency is a new expense', () => {
    expect(PatchExpenseRequest.safeParse({ currency: 'USD' }).success).toBe(false);
    expect(PatchExpenseRequest.safeParse({ fx_rate_to_home: '1.1' }).success).toBe(false);
    expect(PatchExpenseRequest.safeParse({ amount: '20.00' }).success).toBe(true);
    expect(PatchExpenseRequest.safeParse({}).success).toBe(false);
  });

  it('the list query filters by city, category, and an ordered date range', () => {
    expect(
      ListExpensesQuery.parse({ city_id: '100', from: '2026-05-01', to: '2026-05-31' }),
    ).toEqual({ city_id: 100, from: '2026-05-01', to: '2026-05-31' });
    expect(
      ListExpensesQuery.safeParse({ from: '2026-05-31', to: '2026-05-01' }).success,
    ).toBe(false);
  });

  it('the read shape reports the frozen conversion and the pending flag, never a tombstone', () => {
    const expense = {
      id: UUID,
      created_at: NOW,
      updated_at: NOW,
      trip_id: UUID,
      city_id: null,
      category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
      amount: '12.50',
      currency: 'EUR',
      spent_at: '2026-05-12',
      note: null,
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: true,
    };
    expect(Expense.safeParse(expense).success).toBe(true);
    expect(Expense.safeParse({ ...expense, deleted_at: null }).success).toBe(false);
    expect(Expense.safeParse({ ...expense, is_public: false }).success).toBe(false);
  });

  it('the summary totals in the home currency and discloses rates and pending rows', () => {
    const summary = {
      home_currency: 'CHF',
      total_home: '30.00',
      by_category: [
        {
          category_id: SYSTEM_EXPENSE_CATEGORIES[0].id,
          name: 'Food',
          total_home: '30.00',
          count: 2,
        },
      ],
      by_day: [{ date: '2026-05-12', total_home: '30.00', count: 2 }],
      rates_applied: [{ currency: 'EUR', rate: '0.940000', count: 1 }],
      rates_source: 'https://www.exchangerate-api.com',
      pending_conversion: {
        count: 1,
        by_currency: [{ currency: 'VND', total: '250000.00', count: 1 }],
      },
    };
    expect(ExpenseSummary.safeParse(summary).success).toBe(true);
    expect(ExpenseSummary.safeParse({ ...summary, total_home: 30 }).success).toBe(false);
  });
});

describe('fx rates (research D-28)', () => {
  it('is a USD-based snapshot of rate strings with a date and an attribution', () => {
    const ok = {
      base: 'USD',
      as_of: '2026-09-24',
      source: 'https://www.exchangerate-api.com',
      rates: { EUR: '0.877372', JPY: '158.127269', USD: '1' },
    };
    expect(FxRatesResponse.safeParse(ok).success).toBe(true);
    expect(FxRatesResponse.safeParse({ ...ok, base: 'EUR' }).success).toBe(false);
    expect(FxRatesResponse.safeParse({ ...ok, rates: { EUR: 0.877 } }).success).toBe(
      false,
    );
    expect(FxRatesResponse.safeParse({ ...ok, rates: { eur: '0.877' } }).success).toBe(
      false,
    );
  });
});
