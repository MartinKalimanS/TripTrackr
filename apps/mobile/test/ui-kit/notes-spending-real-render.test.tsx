/**
 * 004 T440, T441 - the Notes and Spending screens over the REAL `heroui-native` under Jest
 * (research D4-13).
 *
 * `test/app/us2-screens.test.tsx` renders the screens over the stand-in. This file puts the
 * kit's own Card, ListGroup, Button, Chip and Skeleton underneath them, so what the screens
 * rely on is checked against the real components: nothing throws (a card or a group inside
 * another raised surface is a development error; a kit component needs only the provider),
 * the ids and names land on the nodes a test or a Maestro flow finds them by, and our classes
 * reach the cards. How a class LOOKS (the dashed edge, the group's corners, the separators)
 * is Uniwind's, on a device.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import ExpensesScreen from '@/app/trip/[id]/expenses';
import NotesScreen from '@/app/trip/[id]/notes';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { ExpenseRow, TripRow } from '@/db/schema';

import { classesOf } from '../helpers/host-nodes';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({ id: 'trip-42' }),
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockTrip: TripRow = {
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

const stop = (id: string, city: string, cityId: number): StopWithPlace => ({
  id,
  trip_id: 'trip-42',
  city_id: cityId,
  sort_order: cityId,
  arrive_date: '2026-05-10',
  depart_date: '2026-05-12',
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
  city_name: city,
  country_id: 1,
  country_name: 'Italy',
  lat: 41.9,
  lng: 12.5,
});

const mockStops = { data: [stop('s1', 'Roma', 100), stop('s2', 'Firenze', 101)] };
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => ({ data: mockTrip, loading: false, error: null }),
  useTripStops: () => ({ ...mockStops, loading: false, error: null }),
}));

const note = (overrides: Partial<NoteWithPlace>): NoteWithPlace => ({
  id: 'n1',
  trip_id: 'trip-42',
  country_id: 1,
  city_id: 100,
  title: 'Cheese',
  body: 'Try the raclette.',
  is_public: false,
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
  country_name: 'Italy',
  city_name: 'Roma',
  ...overrides,
});

const mockNotes: { data: NoteWithPlace[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
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
const expense = (overrides: Partial<ExpenseRow>): ExpenseRow => ({
  id: 'e1',
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

const mockExpenses: { data: ExpenseRow[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
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
const mockCategories = {
  data: SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
  loading: false,
  error: null,
};
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => mockExpenses,
  useExpenseCategories: () => mockCategories,
  useSpendingSummary: () => mockSummary,
  useFxSnapshotInfo: () => ({ asOf: '2026-05-01', source: null }),
  useExpenseActions: () => ({ removeExpense: jest.fn() }),
}));
jest.mock('@/features/expenses/use-fx-rates', () => ({ useFxRates: jest.fn() }));

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// screens: only that message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
const consoleError = console.error.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

const inKit = (screenElement: React.ReactElement) =>
  render(<HeroUINativeProvider config={CONFIG}>{screenElement}</HeroUINativeProvider>);

beforeEach(() => {
  mockNotes.data = [note({}), note({ id: 'n2', city_id: null, is_dirty: false })];
  mockNotes.loading = false;
  mockNotes.error = null;
  mockExpenses.data = [
    expense({}),
    expense({
      id: 'e2',
      currency: 'CHF',
      amount: '3.00',
      amount_home: '3.00',
      is_dirty: false,
    }),
    expense({ id: 'e3', spent_at: '2026-05-10', is_dirty: false }),
  ];
  mockExpenses.loading = false;
  mockExpenses.error = null;
});

describe('the notes screen over the real kit', () => {
  test('renders the filters, the primary action and a card per note without error', async () => {
    await inKit(<NotesScreen />);

    expect(screen.getByTestId('notes-screen')).toBeTruthy();
    expect(screen.getByTestId('notes-filter-all').props.accessibilityRole).toBe('radio');
    expect(screen.getByTestId('notes-add').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('note-card-n1')).toBeTruthy();
    expect(screen.getByTestId('note-card-n2')).toBeTruthy();
  });

  test('a note only on this device says so in words and a glyph on the real card; neither card has a dashed edge', async () => {
    await inKit(<NotesScreen />);

    expect(classesOf(screen.getByTestId('note-surface-n1'))).toEqual(
      expect.arrayContaining(['bg-surface-secondary', 'border-separator']),
    );
    expect(classesOf(screen.getByTestId('note-surface-n1'))).not.toContain(
      'border-dashed',
    );
    expect(classesOf(screen.getByTestId('note-surface-n2'))).not.toContain(
      'border-dashed',
    );
    expect(screen.getByText('On this device')).toBeTruthy();
  });

  test('Edit and Delete are buttons the kit names and presses', async () => {
    await inKit(<NotesScreen />);

    for (const [id, name] of [
      ['note-edit-n1', 'Edit Cheese'],
      ['note-remove-n1', 'Delete Cheese'],
    ]) {
      const control = screen.getByTestId(id);
      expect(control.props.accessibilityRole).toBe('button');
      expect(control.props.accessibilityLabel).toBe(name);
    }
    await fireEvent.press(screen.getByTestId('note-edit-n1'));
    expect(screen.getByTestId('note-editor')).toBeTruthy();
  });

  test('while the notes load the kit draws one named placeholder region instead of a list', async () => {
    mockNotes.data = [];
    mockNotes.loading = true;
    await inKit(<NotesScreen />);

    expect(screen.getByLabelText('Loading notes').props.accessibilityRole).toBe(
      'progressbar',
    );
    expect(screen.queryByTestId('note-card-n1')).toBeNull();
  });

  test('the empty state offers "New note" as a secondary button the kit names and presses', async () => {
    mockNotes.data = [];
    await inKit(<NotesScreen />);

    const action = screen.getByTestId('notes-empty-add');
    expect(action.props.accessibilityRole).toBe('button');
    expect(action.props.accessibilityLabel).toBe('New note');
    await fireEvent.press(action);
    expect(screen.getByTestId('note-editor')).toBeTruthy();
  });
});

describe('the spending screen over the real kit', () => {
  test('renders the summary and a group per day without error', async () => {
    await inKit(<ExpensesScreen />);

    expect(screen.getByTestId('expenses-screen')).toBeTruthy();
    expect(screen.getByTestId('spending-summary')).toBeTruthy();
    expect(screen.getByTestId('summary-total')).toBeTruthy();
    expect(screen.getByTestId('expense-day-2026-05-11')).toBeTruthy();
    expect(screen.getByTestId('expense-day-2026-05-10')).toBeTruthy();
  });

  test('each day holds its rows, with a hairline between a pair', async () => {
    await inKit(<ExpensesScreen />);

    const day = within(screen.getByTestId('expense-day-2026-05-11'));
    expect(day.getByTestId('expense-row-e1')).toBeTruthy();
    expect(day.getByTestId('expense-row-e2')).toBeTruthy();
    expect(screen.getByTestId('expense-day-2026-05-11-separator-1')).toBeTruthy();
    expect(
      within(screen.getByTestId('expense-day-2026-05-10')).getByTestId('expense-row-e3'),
    ).toBeTruthy();
  });

  test('a row is one element with its delete action, and Delete (shown by a tap on the row) is a button the kit names', async () => {
    await inKit(<ExpensesScreen />);

    expect(screen.getByTestId('expense-row-e1').props.accessible).toBe(true);
    await fireEvent.press(screen.getByTestId('expense-row-e1'));
    const remove = screen.getByTestId('expense-remove-e1');
    expect(remove.props.accessibilityRole).toBe('button');
    expect(remove.props.accessibilityLabel).toContain('Delete Food expense of');
  });

  test('the summary toggle is a control the platform announces as expanded, then collapsed', async () => {
    await inKit(<ExpensesScreen />);

    expect(
      screen.getByTestId('expenses-toggle-summary').props.accessibilityState,
    ).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByTestId('expenses-toggle-summary'));
    expect(
      screen.getByTestId('expenses-toggle-summary').props.accessibilityState,
    ).toMatchObject({ expanded: false });
    expect(screen.queryByTestId('spending-summary')).toBeNull();
  });

  test('while the expenses load the kit draws one named placeholder region instead of a list', async () => {
    mockExpenses.data = [];
    mockExpenses.loading = true;
    await inKit(<ExpensesScreen />);

    expect(screen.getByLabelText('Loading expenses').props.accessibilityRole).toBe(
      'progressbar',
    );
    expect(screen.queryByTestId('expense-day-2026-05-11')).toBeNull();
  });

  test('the empty state offers "Add expense" as a secondary button that opens the sheet', async () => {
    mockExpenses.data = [];
    await inKit(<ExpensesScreen />);

    await fireEvent.press(screen.getByTestId('expenses-empty-add'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modal/add-expense',
      params: { tripId: 'trip-42' },
    });
  });
});
