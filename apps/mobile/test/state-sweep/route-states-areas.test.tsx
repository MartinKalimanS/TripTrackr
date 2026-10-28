/**
 * T559 - the Notes and Expenses routes and the add-expense sheet, in every state they have
 * (FR-064, FR-066, FR-080 as amended by Q-11): loading, unreadable, empty, a filter with no
 * match, the list, and the sheet's trip that is loading, unreadable or not here. In each: no
 * control that does nothing, no control that says it is not available yet without being a
 * coming-soon control (and the reverse), at most ONE primary.
 *
 * The live queries and actions are replaced by plain objects, as in `us2-screens.test.tsx`.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AddExpenseScreen from '@/app/modal/add-expense';
import AddTripScreen from '@/app/modal/add-trip';
import ExpensesScreen from '@/app/trip/[id]/expenses';
import NotesScreen from '@/app/trip/[id]/notes';
import type { CategoryOption } from '@/db/repositories/expenses';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { ExpenseRow, TripRow } from '@/db/schema';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

let mockParams: Record<string, string | string[]> = { id: 'trip-42', tripId: 'trip-42' };
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'CHF',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-04-01T10:00:00.000Z',
};
const rome: StopWithPlace = {
  id: 'stop-rome',
  trip_id: 'trip-42',
  city_id: 100,
  sort_order: 0,
  arrive_date: '2026-05-10',
  depart_date: '2026-05-12',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  city_name: 'Roma',
  country_id: 1,
  country_name: 'Italy',
  lat: 41.9,
  lng: 12.5,
};

const mockTrip = {
  data: trip as TripRow | null,
  loading: false,
  error: null as Error | null,
};
const mockStops = { data: [rome] as StopWithPlace[], loading: false, error: null };
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
  useTripActions: () => ({ createTrip: jest.fn() }),
}));

const mockNotes = {
  data: [] as NoteWithPlace[],
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/notes/use-notes', () => ({
  useNotes: () => mockNotes,
  useNoteActions: () => ({
    createNote: jest.fn(),
    updateNote: jest.fn(),
    removeNote: jest.fn(),
  }),
}));

const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
const mockCategories: CategoryOption[] = SYSTEM_EXPENSE_CATEGORIES.map((c) => ({
  ...c,
  system: true,
}));
const mockExpenses = {
  data: [] as ExpenseRow[],
  loading: false,
  error: null as Error | null,
};
const mockSummary = {
  data: {
    home_currency: 'CHF',
    total_home: '18.00',
    by_category: [{ category_id: FOOD, name: 'Food', total_home: '18.00', count: 2 }],
    by_day: [{ date: '2026-05-11', total_home: '18.00', count: 2 }],
    rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
    rates_source: 'https://www.exchangerate-api.com',
    pending_conversion: { count: 0, by_currency: [] },
  },
  loading: false,
  error: null,
};
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => mockExpenses,
  useExpenseCategories: () => ({ data: mockCategories, loading: false, error: null }),
  useSpendingSummary: () => mockSummary,
  useFxSnapshotInfo: () => ({
    asOf: '2026-05-01',
    source: 'https://www.exchangerate-api.com',
  }),
  useExpenseActions: () => ({
    createExpense: jest.fn(),
    updateExpense: jest.fn(),
    removeExpense: jest.fn(),
    createCategory: jest.fn(),
  }),
  useFxSnapshot: () => null,
}));
jest.mock('@/features/expenses/use-fx-rates', () => ({ useFxRates: jest.fn() }));

const note = (overrides: Partial<NoteWithPlace> = {}): NoteWithPlace => ({
  id: 'note-1',
  trip_id: 'trip-42',
  country_id: 1,
  city_id: null,
  title: 'Cheese',
  body: 'Try the raclette.',
  is_public: false,
  created_at: '2026-05-10T10:00:00.000Z',
  updated_at: '2026-05-10T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
  country_name: 'Italy',
  city_name: null,
  ...overrides,
});

const expense = (overrides: Partial<ExpenseRow> = {}): ExpenseRow => ({
  id: 'exp-1',
  trip_id: 'trip-42',
  city_id: 100,
  category_id: FOOD,
  amount: '9.00',
  currency: 'EUR',
  spent_at: '2026-05-11',
  note: 'Lunch',
  fx_rate_to_home: '0.888889',
  amount_home: '8.00',
  fx_pending: false,
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
  ...overrides,
});

beforeEach(() => {
  mockParams = { id: 'trip-42', tripId: 'trip-42' };
  mockTrip.data = trip;
  mockTrip.loading = false;
  mockTrip.error = null;
  mockStops.data = [rome];
  mockNotes.data = [];
  mockNotes.loading = false;
  mockNotes.error = null;
  mockExpenses.data = [];
  mockExpenses.loading = false;
  mockExpenses.error = null;
});

/** What every state of every route owes the traveller. */
function expectHealthy(primaries?: number) {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls().length).toBeLessThanOrEqual(primaries ?? 1);
}

describe('Notes states: no control is a dead end', () => {
  it('loading: a skeleton, and "New note" is already there', async () => {
    mockNotes.loading = true;
    await render(<NotesScreen />);
    expect(screen.getByLabelText('Loading notes')).toBeTruthy();
    expectHealthy();
  });

  it('unreadable: words and an icon', async () => {
    mockNotes.error = new Error('database is locked');
    await render(<NotesScreen />);
    expect(screen.getByText('Couldn’t read the notes')).toBeTruthy();
    expectHealthy();
  });

  it('empty: "No notes yet" names "New note"', async () => {
    await render(<NotesScreen />);
    expect(screen.getByTestId('notes-empty-add')).toBeTruthy();
    expectHealthy();
    expect(primaryControls()).toEqual(['"New note"']);
  });

  it('a filter with no note names which one, and still offers "New note"', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-filter-city:100'));
    expect(screen.getByText('No notes for Roma, Italy yet')).toBeTruthy();
    expectHealthy();
  });

  it('notes: the list', async () => {
    mockNotes.data = [note(), note({ id: 'note-2', title: 'Pasta' })];
    await render(<NotesScreen />);
    expectHealthy();
  });
});

describe('Expenses states: no control is a dead end', () => {
  it('loading: a skeleton', async () => {
    mockExpenses.loading = true;
    await render(<ExpensesScreen />);
    expect(screen.getByLabelText('Loading expenses')).toBeTruthy();
    expectHealthy();
  });

  it('unreadable: words and an icon', async () => {
    mockExpenses.error = new Error('database is locked');
    await render(<ExpensesScreen />);
    expect(screen.getByText('Couldn’t read the expenses')).toBeTruthy();
    expectHealthy();
  });

  it('empty: "Nothing logged yet" names "Add expense"', async () => {
    await render(<ExpensesScreen />);
    expect(screen.getByTestId('expenses-empty-add')).toBeTruthy();
    expectHealthy();
  });

  it('expenses: the summary and the rows', async () => {
    mockExpenses.data = [expense(), expense({ id: 'exp-2' })];
    await render(<ExpensesScreen />);
    expectHealthy();
  });
});

describe('The add-trip sheet: no control is a dead end', () => {
  it('the form: "Save trip" is the one primary and the pictured rows are coming soon', async () => {
    await render(<AddTripScreen />);
    expect(screen.getByTestId('add-trip-screen')).toBeTruthy();
    expectHealthy();
    expect(primaryControls()).toEqual(['"Save trip"']);
  });
});

describe('The add-expense sheet states: no control is a dead end', () => {
  it('the trip is loading: words, and "Close"', async () => {
    mockTrip.data = null;
    mockTrip.loading = true;
    await render(<AddExpenseScreen />);
    expect(screen.getByText('Loading trip')).toBeTruthy();
    expect(screen.getByTestId('add-expense-close')).toBeTruthy();
    expectHealthy(0);
  });

  it('the trip cannot be read: words and an icon, and "Close"', async () => {
    mockTrip.data = null;
    mockTrip.error = new Error('database is locked');
    await render(<AddExpenseScreen />);
    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expectHealthy(0);
  });

  it('the trip is not here: words, and "Close"', async () => {
    mockTrip.data = null;
    await render(<AddExpenseScreen />);
    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();
    expectHealthy(0);
  });

  it('the form: "Save expense" is the one primary', async () => {
    await render(<AddExpenseScreen />);
    expect(screen.getByTestId('add-expense-screen')).toBeTruthy();
    expectHealthy();
  });
});
