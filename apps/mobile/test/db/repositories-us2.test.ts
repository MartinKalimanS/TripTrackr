/**
 * User Story 2's local repositories — notes, expenses, categories, the FX
 * snapshot — against a real SQLite database with the generated migrations
 * applied (Constitution III; tasks.md T206).
 *
 * What these prove for the sync engine and the traveller alike: every write is
 * dirty and stamped; deletes are tombstones the reads never return; FR-019 is
 * refused with the wire's own predicate; a move keeps the body and creation
 * date (FR-018); the rate is frozen at entry from the cached snapshot and
 * never recomputed (FR-021, FR-022); and the summary reconciles exactly
 * (SC-016) while reporting pending rows rather than dropping them (FR-026).
 */
import {
  ExpensePullRecord,
  NotePullRecord,
  SYSTEM_EXPENSE_CATEGORIES,
  type FxRatesResponse,
} from '@triptrackr/contracts';
import { randomUUID } from 'expo-crypto';

import {
  categoryOptions,
  expensesRepository,
  summariseExpenses,
} from '@/db/repositories/expenses';
import { fxRatesRepository } from '@/db/repositories/fx-rates';
import { geographyRepository } from '@/db/repositories/geography';
import { NoteAnchorError, notesRepository } from '@/db/repositories/notes';
import { tripsRepository } from '@/db/repositories/trips';
import { expenses, notes } from '@/db/schema';

import { createTestDatabase, type TestSqlite } from './sqlite-harness';

let sqlite: TestSqlite;

const italy = { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' };
const rome = {
  id: 100,
  country_id: 1,
  name: 'Roma',
  ascii_name: 'Roma',
  lat: 41.9,
  lng: 12.5,
  timezone: 'Europe/Rome',
  population: 2_800_000,
};

const SNAPSHOT: FxRatesResponse = {
  base: 'USD',
  as_of: '2026-05-01',
  source: 'https://www.exchangerate-api.com',
  rates: { USD: '1.000000', EUR: '0.900000', CHF: '0.800000' },
};

const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
const TRANSPORT = SYSTEM_EXPENSE_CATEGORIES[2].id;

beforeEach(async () => {
  sqlite = await createTestDatabase();
  geographyRepository.cacheCountries(sqlite.db, [italy]);
  geographyRepository.cacheCities(sqlite.db, [rome]);
});

afterEach(() => {
  sqlite.close();
});

function newTrip(homeCurrency = 'CHF') {
  return tripsRepository.create(sqlite.db, {
    id: randomUUID(),
    title: 'Swiss spring',
    home_currency: homeCurrency,
  });
}

describe('notesRepository', () => {
  test('create writes local-first, private by default, and the row satisfies the wire record', () => {
    const trip = newTrip();
    const note = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: 'Cheese',
      body: 'Try the raclette.',
    });

    expect(note).toMatchObject({
      is_public: false,
      is_dirty: true,
      synced_at: null,
      deleted_at: null,
    });
    expect(note.created_at).toBe(note.updated_at);
    const { is_dirty: _dirty, synced_at: _synced, ...wire } = note;
    expect(NotePullRecord.safeParse(wire).success).toBe(true);
  });

  test('refuses a note with no anchor, with the wire’s own predicate (FR-019)', () => {
    const trip = newTrip();
    expect(() =>
      notesRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: trip.id,
        country_id: null,
        city_id: null,
        title: null,
        body: 'floating',
      }),
    ).toThrow(NoteAnchorError);
    expect(sqlite.db.select().from(notes).all()).toEqual([]);
  });

  test('forTripQuery lists newest first with cached place names and filters by anchor', () => {
    const trip = newTrip();
    const country = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'country-level',
    });
    const city = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: 100,
      title: null,
      body: 'city-level',
    });

    const all = notesRepository.forTripQuery(sqlite.db, trip.id).all();
    expect(all.map((row) => row.id)).toEqual(
      expect.arrayContaining([country.id, city.id]),
    );
    expect(all.find((row) => row.id === city.id)).toMatchObject({
      city_name: 'Roma',
      country_name: 'Italy',
      // The flag's code travels with the place (F9: the card's foot row).
      country_iso: 'IT',
    });

    const byCity = notesRepository
      .forTripQuery(sqlite.db, trip.id, { city_id: 100 })
      .all();
    expect(byCity.map((row) => row.id)).toEqual([city.id]);
    const byCountry = notesRepository
      .forTripQuery(sqlite.db, trip.id, { country_id: 1 })
      .all();
    expect(byCountry).toHaveLength(2);
  });

  test('update moves a note between levels keeping body and created_at, and re-dirties it (FR-018)', () => {
    const trip = newTrip();
    const note = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: 'Move me',
      body: 'Written at country level.',
    });
    sqlite.native.prepare('UPDATE notes SET is_dirty = 0').run();

    const moved = notesRepository.update(sqlite.db, note.id, { city_id: 100 });

    expect(moved).toMatchObject({
      id: note.id,
      country_id: 1,
      city_id: 100,
      body: 'Written at country level.',
      created_at: note.created_at,
      is_dirty: true,
    });
    expect(moved.updated_at >= note.updated_at).toBe(true);
  });

  test('update refuses a move that would leave the note with no anchor, and writes nothing', () => {
    const trip = newTrip();
    const note = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'x',
    });

    expect(() =>
      notesRepository.update(sqlite.db, note.id, { country_id: null }),
    ).toThrow(NoteAnchorError);
    expect(notesRepository.byId(sqlite.db, note.id)?.country_id).toBe(1);
    expect(() =>
      notesRepository.update(sqlite.db, randomUUID(), { body: 'ghost' }),
    ).toThrow(/not found/i);
  });

  test('remove is a tombstone: the row stays for the sync engine, dirty, and leaves reads', () => {
    const trip = newTrip();
    const note = notesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: trip.id,
      country_id: 1,
      city_id: null,
      title: null,
      body: 'doomed',
    });

    notesRepository.remove(sqlite.db, note.id);

    expect(notesRepository.forTripQuery(sqlite.db, trip.id).all()).toEqual([]);
    expect(notesRepository.byId(sqlite.db, note.id)).toBeNull();
    const [raw] = sqlite.db.select().from(notes).all();
    expect(raw).toMatchObject({
      id: note.id,
      is_dirty: true,
      deleted_at: expect.any(String),
    });
  });
});

describe('fxRatesRepository', () => {
  test('replaceSnapshot stores every rate and snapshot() reads it back; a second snapshot replaces it', () => {
    expect(fxRatesRepository.snapshot(sqlite.db)).toBeNull();

    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    expect(fxRatesRepository.snapshot(sqlite.db)).toEqual({
      asOf: '2026-05-01',
      source: SNAPSHOT.source,
      rates: SNAPSHOT.rates,
    });

    fxRatesRepository.replaceSnapshot(sqlite.db, {
      ...SNAPSHOT,
      as_of: '2026-05-02',
      rates: { USD: '1.000000', JPY: '150.000000' },
    });
    expect(fxRatesRepository.snapshot(sqlite.db)).toEqual({
      asOf: '2026-05-02',
      source: SNAPSHOT.source,
      rates: { USD: '1.000000', JPY: '150.000000' },
    });
  });

  test('convert derives the cross rate through USD, is 1 for the home currency, and null when unknown', () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);

    expect(fxRatesRepository.convert(sqlite.db, '9.00', 'EUR', 'CHF')).toEqual({
      fx_rate_to_home: '0.888889',
      amount_home: '8.00',
    });
    expect(fxRatesRepository.convert(sqlite.db, '12.30', 'CHF', 'CHF')).toEqual({
      fx_rate_to_home: '1.000000',
      amount_home: '12.30',
    });
    expect(fxRatesRepository.convert(sqlite.db, '100.00', 'XTS', 'CHF')).toBeNull();
  });
});

describe('expensesRepository', () => {
  function addExpense(tripId: string, amount: string, currency: string, extra = {}) {
    return expensesRepository.create(sqlite.db, {
      id: randomUUID(),
      trip_id: tripId,
      home_currency: 'CHF',
      city_id: null,
      category_id: FOOD,
      amount,
      currency,
      spent_at: '2026-06-02',
      note: null,
      ...extra,
    });
  }

  test('create converts from the cached snapshot at entry and the row satisfies the wire record', () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    const trip = newTrip();

    const expense = addExpense(trip.id, '9.00', 'EUR');

    expect(expense).toMatchObject({
      amount: '9.00',
      currency: 'EUR',
      fx_rate_to_home: '0.888889',
      amount_home: '8.00',
      fx_pending: false,
      is_dirty: true,
      synced_at: null,
    });
    const { is_dirty: _dirty, synced_at: _synced, ...wire } = expense;
    expect(ExpensePullRecord.safeParse(wire).success).toBe(true);
  });

  test('create stores the expense pending, never refusing it, when no rate is cached (Constitution II)', () => {
    const trip = newTrip();

    const expense = addExpense(trip.id, '250000.00', 'XTS');

    expect(expense).toMatchObject({
      fx_rate_to_home: null,
      amount_home: null,
      fx_pending: true,
    });
  });

  test('update never recomputes the frozen rate; a new amount converts with it (FR-022)', () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    const trip = newTrip();
    const expense = addExpense(trip.id, '10.00', 'EUR');
    sqlite.native.prepare('UPDATE expenses SET is_dirty = 0').run();

    // The market moves; this row must not.
    fxRatesRepository.replaceSnapshot(sqlite.db, {
      ...SNAPSHOT,
      as_of: '2026-06-30',
      rates: { USD: '1.000000', EUR: '1.000000', CHF: '0.500000' },
    });

    const updated = expensesRepository.update(sqlite.db, expense.id, {
      amount: '20.00',
      category_id: TRANSPORT,
      note: 'Taxi, actually',
    });

    expect(updated).toMatchObject({
      amount: '20.00',
      fx_rate_to_home: '0.888889',
      amount_home: '17.78',
      category_id: TRANSPORT,
      note: 'Taxi, actually',
      is_dirty: true,
    });

    // A fresh expense sees the newer snapshot — the freeze is per row.
    expect(addExpense(trip.id, '10.00', 'EUR').fx_rate_to_home).toBe('0.500000');
  });

  test('update on a pending row keeps it pending until the server backfills it', () => {
    const trip = newTrip();
    const expense = addExpense(trip.id, '5.00', 'XTS');

    const updated = expensesRepository.update(sqlite.db, expense.id, { amount: '6.00' });

    expect(updated).toMatchObject({
      amount: '6.00',
      amount_home: null,
      fx_pending: true,
    });
    expect(() =>
      expensesRepository.update(sqlite.db, randomUUID(), { amount: '1.00' }),
    ).toThrow(/not found/i);
  });

  test('remove is a tombstone and forTripQuery lists live rows newest spend first', () => {
    const trip = newTrip();
    const first = addExpense(trip.id, '1.00', 'CHF', { spent_at: '2026-06-01' });
    const second = addExpense(trip.id, '2.00', 'CHF', { spent_at: '2026-06-03' });

    expect(
      expensesRepository
        .forTripQuery(sqlite.db, trip.id)
        .all()
        .map((r) => r.id),
    ).toEqual([second.id, first.id]);

    expensesRepository.remove(sqlite.db, first.id);

    expect(
      expensesRepository
        .forTripQuery(sqlite.db, trip.id)
        .all()
        .map((r) => r.id),
    ).toEqual([second.id]);
    const raw = sqlite.db
      .select()
      .from(expenses)
      .all()
      .find((r) => r.id === first.id);
    expect(raw).toMatchObject({ is_dirty: true, deleted_at: expect.any(String) });
  });

  test('createCategory is user-scoped, dirty, and hands back the existing row for the same name', () => {
    const coffee = expensesRepository.createCategory(sqlite.db, {
      id: randomUUID(),
      name: ' Coffee ',
    });
    const again = expensesRepository.createCategory(sqlite.db, {
      id: randomUUID(),
      name: 'coffee',
    });

    expect(coffee).toMatchObject({ name: 'Coffee', icon: null, is_dirty: true });
    expect(again.id).toBe(coffee.id);
    expect(expensesRepository.customCategoriesQuery(sqlite.db).all()).toHaveLength(1);

    const options = categoryOptions(
      expensesRepository.customCategoriesQuery(sqlite.db).all(),
    );
    expect(options.slice(0, 6).map((o) => [o.name, o.system])).toEqual(
      SYSTEM_EXPENSE_CATEGORIES.map((c) => [c.name, true]),
    );
    expect(options[6]).toMatchObject({ id: coffee.id, name: 'Coffee', system: false });
  });
});

describe('summariseExpenses (pure; FR-025, FR-026, SC-016)', () => {
  const options = categoryOptions([]);

  test('totals by category and by day exactly, discloses rates, and reports pending rows', () => {
    fxRatesRepository.replaceSnapshot(sqlite.db, SNAPSHOT);
    const trip = newTrip();
    const make = (amount: string, currency: string, category: string, day: string) =>
      expensesRepository.create(sqlite.db, {
        id: randomUUID(),
        trip_id: trip.id,
        home_currency: 'CHF',
        city_id: null,
        category_id: category,
        amount,
        currency,
        spent_at: day,
        note: null,
      });
    make('10.00', 'CHF', FOOD, '2026-06-02');
    make('5.50', 'CHF', TRANSPORT, '2026-06-02');
    make('9.00', 'EUR', FOOD, '2026-06-03');
    make('250000.00', 'XTS', FOOD, '2026-06-03');

    const summary = summariseExpenses(
      expensesRepository.forTripQuery(sqlite.db, trip.id).all(),
      'CHF',
      options,
      SNAPSHOT.source,
    );

    expect(summary).toEqual({
      home_currency: 'CHF',
      total_home: '23.50',
      by_category: [
        { category_id: FOOD, name: 'Food', total_home: '18.00', count: 2 },
        { category_id: TRANSPORT, name: 'Transport', total_home: '5.50', count: 1 },
      ],
      by_day: [
        { date: '2026-06-02', total_home: '15.50', count: 2 },
        { date: '2026-06-03', total_home: '8.00', count: 1 },
      ],
      rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
      rates_source: SNAPSHOT.source,
      pending_conversion: {
        count: 1,
        by_currency: [{ currency: 'XTS', total: '250000.00', count: 1 }],
      },
    });
  });

  test('is empty, not an error, with no rows — and discloses no rate for a single-currency trip', () => {
    expect(summariseExpenses([], 'CHF', options, null)).toEqual({
      home_currency: 'CHF',
      total_home: '0.00',
      by_category: [],
      by_day: [],
      rates_applied: [],
      rates_source: null,
      pending_conversion: { count: 0, by_currency: [] },
    });
  });
});
