/**
 * T560 - the reading order of the notes and the spending of a trip (feature 005; FR-070, FR-075,
 * FR-076, FR-077, SC-015; UI-SPEC section 9.2): Back and the header's controls, the heading and
 * its line, the filters (radios that say which is selected), the days as headings over their
 * cards, the floating "New note" or "Add expense" last; the spending summary's figures each ONE
 * stop in words, the charts ONE image each (their bars are hidden), each expense one button that
 * reads category, amounts, date and note. The mocked world is `us2-screens.test.tsx`'s.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { render } from '@testing-library/react-native';

import ExpensesScreen from '@/app/trip/[id]/expenses';
import NotesScreen from '@/app/trip/[id]/notes';
import type { CategoryOption } from '@/db/repositories/expenses';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { ExpenseRow, TripRow } from '@/db/schema';

import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';

const mockBack = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42', tripId: 'trip-42' };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
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
const florence: StopWithPlace = {
  ...rome,
  id: 'stop-florence',
  city_id: 101,
  city_name: 'Firenze',
  arrive_date: '2026-05-12',
  depart_date: '2026-05-15',
};

const mockTrip = {
  data: trip as TripRow | null,
  loading: false,
  error: null as Error | null,
};
const mockStops = {
  data: [rome, florence] as StopWithPlace[],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
}));

// --- notes -----------------------------------------------------------------

const mockNotes = {
  data: [] as NoteWithPlace[],
  loading: false,
  error: null as Error | null,
};
const mockNoteActions = {
  createNote: jest.fn(),
  updateNote: jest.fn(),
  removeNote: jest.fn(),
};
const mockUseNotes = jest.fn((_tripId: string, _filter: unknown) => mockNotes);

jest.mock('@/features/notes/use-notes', () => ({
  useNotes: (tripId: string, filter: unknown) => mockUseNotes(tripId, filter),
  useNoteActions: () => mockNoteActions,
}));

const note = (overrides: Partial<NoteWithPlace>): NoteWithPlace => ({
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

// --- expenses --------------------------------------------------------------

const FOOD = SYSTEM_EXPENSE_CATEGORIES[0].id;
const COFFEE = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';
const categories: CategoryOption[] = SYSTEM_EXPENSE_CATEGORIES.map((c) => ({
  ...c,
  system: true,
}));

const expense = (overrides: Partial<ExpenseRow>): ExpenseRow => ({
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

const mockExpenses = {
  data: [] as ExpenseRow[],
  loading: false,
  error: null as Error | null,
};
const mockCategories = { data: categories, loading: false, error: null };
const mockSummary = {
  data: {
    home_currency: 'CHF',
    total_home: '18.00',
    by_category: [{ category_id: FOOD, name: 'Food', total_home: '18.00', count: 2 }],
    by_day: [{ date: '2026-05-11', total_home: '18.00', count: 2 }],
    rates_applied: [{ currency: 'EUR', rate: '0.888889', count: 1 }],
    rates_source: 'https://www.exchangerate-api.com',
    pending_conversion: {
      count: 1,
      by_currency: [{ currency: 'XTS', total: '5.00', count: 1 }],
    },
  },
  loading: false,
  error: null,
};
const mockUseSpendingSummary = jest.fn(
  (_expenses: unknown, _home: string) => mockSummary,
);
const mockExpenseActions = {
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
  removeExpense: jest.fn(),
  createCategory: jest.fn(() => ({ id: COFFEE, name: 'Coffee' })),
};

const mockFxSnapshot: {
  current: null | { asOf: string; rates: Record<string, string> };
} = { current: null };

jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => mockExpenses,
  useExpenseCategories: () => mockCategories,
  useSpendingSummary: (expenses: unknown, home: string) =>
    mockUseSpendingSummary(expenses, home),
  useFxSnapshotInfo: () => ({
    asOf: '2026-05-01',
    source: 'https://www.exchangerate-api.com',
  }),
  useExpenseActions: () => mockExpenseActions,
  useFxSnapshot: () => mockFxSnapshot.current,
}));

jest.mock('@/features/expenses/use-fx-rates', () => ({ useFxRates: jest.fn() }));

beforeEach(() => {
  mockParams = { id: 'trip-42', tripId: 'trip-42' };
  mockTrip.data = trip;
  mockTrip.loading = false;
  mockNotes.data = [];
  mockNotes.loading = false;
  mockNotes.error = null;
  mockExpenses.data = [];
  mockExpenses.loading = false;
  mockExpenses.error = null;
  mockNoteActions.updateNote.mockReset();
  mockNoteActions.createNote.mockReset();
  mockExpenseActions.createExpense.mockReset();
});

describe('Notes reading order', () => {
  test('Back, search, the heading, the filters, the days over their cards, then New note', async () => {
    mockNotes.data = [note({}), note({ id: 'note-2', title: 'Wine', city_id: 100 })];
    await render(<NotesScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Back',
      'coming-soon-notes-search',
      'notes-header-title',
      'notes-subtitle',
      'notes-filter-all',
      'notes-filter-country:1',
      'notes-filter-city:100',
      'notes-filter-city:101',
      'note-day-heading-2026-05-10',
      'note-card-note-1',
      'note-card-note-2',
      'notes-add',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('the filters are radios that say which one is selected, and a day is a heading', async () => {
    mockNotes.data = [note({})];
    await render(<NotesScreen />);
    const nodes = accessibleNodes();
    const filters = nodes.filter((node) => node.id?.startsWith('notes-filter-'));
    expect(filters.map((node) => [node.role, node.state])).toEqual([
      ['radio', ['checked', 'selected']],
      ['radio', []],
      ['radio', []],
      ['radio', []],
    ]);
    expect(nodes.find((node) => node.id?.startsWith('note-day-heading'))?.role).toBe(
      'header',
    );
  });

  test('a note is one stop with the actions a reader offers on it', async () => {
    mockNotes.data = [note({})];
    await render(<NotesScreen />);
    const card = accessibleNodes().find((node) => node.id === 'note-card-note-1');
    expect(card?.name).toMatch(/^Cheese, filed under Italy/);
    expect(card?.actions.length).toBeGreaterThan(0);
  });

  test('no notes: the words and the one way to write the first', async () => {
    await render(<NotesScreen />);
    expectReadingOrder(accessibleNodes(), ['No notes yet', 'notes-empty-add']);
  });
});

describe('Spending reading order', () => {
  const two = () => [
    expense({}),
    expense({ id: 'exp-2', note: 'Dinner', amount: '20.00', spent_at: '2026-05-12' }),
  ];

  test('Back, privacy, the heading, the summary, the charts, the days over their expenses, then Add expense', async () => {
    mockExpenses.data = two();
    await render(<ExpensesScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'Back',
      'privacy-chip',
      'expenses-title',
      'expenses-subtitle',
      'expenses-toggle-summary',
      'summary-total',
      'summary-average',
      'coming-soon-budget',
      'category-bar',
      'expense-row-exp-1',
      'expense-row-exp-2',
      'expenses-add',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('privacy is said in words, and the summary says whether it is open', async () => {
    mockExpenses.data = two();
    await render(<ExpensesScreen />);
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.id === 'privacy-chip')?.name).toBe(
      'Only you can see this',
    );
    expect(nodes.find((node) => node.id === 'expenses-toggle-summary')).toMatchObject({
      name: 'Hide summary',
      role: 'button',
      state: ['expanded'],
    });
  });

  test('the charts are ONE image each and the total is read with its currency', async () => {
    mockExpenses.data = two();
    await render(<ExpensesScreen />);
    const nodes = accessibleNodes();
    expect(nodes.filter((node) => node.role === 'image')).toHaveLength(2);
    expect(nodes.find((node) => node.id === 'summary-total')?.name).toBe(
      'Spent in total, CHF 18.00',
    );
    expect(nodes.filter((node) => node.id?.startsWith('day-bar'))).toEqual([]);
  });

  test('an expense reads its category, amounts, date and note, as ONE button', async () => {
    mockExpenses.data = two();
    await render(<ExpensesScreen />);
    const row = accessibleNodes().find((node) => node.id === 'expense-row-exp-1');
    expect(row).toMatchObject({ role: 'button' });
    expect(row?.name).toMatch(/^Food, .*9.00, CHF 8.00, .*Lunch$/);
  });

  test('no expenses: the words and the one way to add the first', async () => {
    await render(<ExpensesScreen />);
    const nodes = accessibleNodes();
    expect(
      nodes.some(
        (node) => node.id === 'expenses-add' || node.id === 'expenses-empty-add',
      ),
    ).toBe(true);
    expect(unnamed(nodes)).toEqual([]);
  });
});
