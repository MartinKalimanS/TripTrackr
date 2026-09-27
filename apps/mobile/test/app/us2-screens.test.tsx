/**
 * User Story 2 screens — `trip/[id]/notes` (T084, T085), `trip/[id]/expenses`
 * (T086, T087), `modal/add-expense` (T086) — with the live-query hooks and
 * actions mocked (their own suite runs them against a real database).
 *
 * Pinned here: every state is designed (loading, empty, error, content); the
 * note editor is a real `react-hook-form` over the wire schema, refusing an
 * empty body in words and submitting a moved anchor as an update (FR-018);
 * the expense sheet reads a comma amount, converts nothing itself, and hands
 * the repository exactly the wire's shape; the summary shows totals, rates
 * and pending rows (FR-025, FR-026); and a failed local write is shown, never
 * swallowed.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import AddExpenseScreen, { stopOn } from '@/app/modal/add-expense';
import ExpensesScreen from '@/app/trip/[id]/expenses';
import NotesScreen from '@/app/trip/[id]/notes';
import type { CategoryOption } from '@/db/repositories/expenses';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { ExpenseRow, TripRow } from '@/db/schema';

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
const mockExpenseActions = {
  createExpense: jest.fn(),
  updateExpense: jest.fn(),
  removeExpense: jest.fn(),
  createCategory: jest.fn(() => ({ id: COFFEE, name: 'Coffee' })),
};

jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenses: () => mockExpenses,
  useExpenseCategories: () => mockCategories,
  useSpendingSummary: () => mockSummary,
  useFxSnapshotInfo: () => ({
    asOf: '2026-05-01',
    source: 'https://www.exchangerate-api.com',
  }),
  useExpenseActions: () => mockExpenseActions,
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

describe('<NotesScreen> — trip/[id]/notes (T084, T085)', () => {
  test('shows the designed empty state and the anchor filters from the trip’s stops', async () => {
    await render(<NotesScreen />);

    expect(screen.getByTestId('notes-title')).toHaveTextContent(
      /Notes · Italy, spring 2026/,
    );
    expect(screen.getByText('No notes yet')).toBeTruthy();
    expect(screen.getByTestId('notes-filter-all')).toBeTruthy();
    expect(screen.getByTestId('notes-filter-country:1')).toBeTruthy();
    expect(screen.getByTestId('notes-filter-city:100')).toBeTruthy();
    expect(screen.getByTestId('notes-filter-city:101')).toBeTruthy();
  });

  test('a filter narrows the live query to that anchor', async () => {
    await render(<NotesScreen />);

    await fireEvent.press(screen.getByTestId('notes-filter-city:101'));
    expect(mockUseNotes).toHaveBeenLastCalledWith('trip-42', { city_id: 101 });

    await fireEvent.press(screen.getByTestId('notes-filter-country:1'));
    expect(mockUseNotes).toHaveBeenLastCalledWith('trip-42', { country_id: 1 });
    expect(screen.getByText('No notes for Whole trip (Italy) yet')).toBeTruthy();
  });

  test('a filter whose stop is removed falls back to "All", and says so', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-filter-city:101'));

    mockStops.data = [rome]; // Florence's stop is deleted while the screen is open
    try {
      await screen.rerender(<NotesScreen />);

      expect(screen.queryByTestId('notes-filter-city:101')).toBeNull();
      expect(
        screen.getByTestId('notes-filter-all').props.accessibilityState,
      ).toMatchObject({ selected: true });
      expect(mockUseNotes).toHaveBeenLastCalledWith('trip-42', {});
    } finally {
      mockStops.data = [rome, florence];
    }
  });

  test('renders notes with where they are filed, and edit / delete reach the repository', async () => {
    mockNotes.data = [
      note({}),
      note({
        id: 'note-2',
        city_id: 101,
        city_name: 'Firenze',
        title: null,
        body: 'Gelato.',
      }),
    ];
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await render(<NotesScreen />);

    expect(screen.getByTestId('note-anchor-note-1')).toHaveTextContent('Italy');
    expect(screen.getByTestId('note-anchor-note-2')).toHaveTextContent('Firenze, Italy');
    expect(screen.getByTestId('note-body-note-2')).toHaveTextContent('Gelato.');

    await fireEvent.press(screen.getByTestId('note-remove-note-2'));
    expect(mockNoteActions.removeNote).toHaveBeenCalledWith('note-2');
  });

  test('a new note is validated by the wire schema and written local-first (FR-019)', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-add'));
    expect(screen.getByTestId('note-editor')).toBeTruthy();

    // Empty body: refused in words, nothing written.
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() => expect(screen.getByText('Write something first.')).toBeTruthy());
    expect(mockNoteActions.createNote).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('note-editor-title'), ' Cheese ');
    await fireEvent.changeText(
      screen.getByTestId('note-editor-body'),
      'Try the raclette.',
    );
    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });

    await waitFor(() =>
      expect(mockNoteActions.createNote).toHaveBeenCalledWith({
        trip_id: 'trip-42',
        title: 'Cheese',
        body: 'Try the raclette.',
        country_id: 1,
        city_id: 100,
      }),
    );
  });

  test('Acceptance: moving a country-level note into a city is an update of the anchors only (FR-018)', async () => {
    mockNotes.data = [note({})];
    await render(<NotesScreen />);

    await fireEvent.press(screen.getByTestId('note-edit-note-1'));
    expect(screen.getByTestId('anchor-country:1').props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );

    await fireEvent.press(screen.getByTestId('anchor-city:100'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });

    await waitFor(() =>
      expect(mockNoteActions.updateNote).toHaveBeenCalledWith('note-1', {
        title: 'Cheese',
        body: 'Try the raclette.',
        country_id: 1,
        city_id: 100,
      }),
    );
  });

  test('a failed local write is reported and shown, never swallowed', async () => {
    mockNoteActions.createNote.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-add'));
    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'x');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });

    await waitFor(() => expect(screen.getByTestId('notes-write-error')).toBeTruthy());
  });

  test('a failed write keeps the editor open with the typed note and shows the error', async () => {
    mockNoteActions.createNote.mockImplementationOnce(() => {
      throw new Error('disk full');
    });
    await render(<NotesScreen />);
    await fireEvent.press(screen.getByTestId('notes-add'));
    await fireEvent.changeText(screen.getByTestId('note-editor-body'), 'Precious text');
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });

    await waitFor(() => expect(screen.getByTestId('note-editor-error')).toBeTruthy());
    expect(screen.getByTestId('note-editor')).toBeTruthy();
    expect(screen.getByTestId('note-editor-body').props.value).toBe('Precious text');

    // Retrying after the fault clears succeeds and closes the editor.
    await act(async () => {
      fireEvent.press(screen.getByTestId('note-editor-save'));
    });
    await waitFor(() => expect(screen.queryByTestId('note-editor')).toBeNull());
    expect(mockNoteActions.createNote).toHaveBeenCalledTimes(2);
  });

  test('the loading state is designed, not blank', async () => {
    mockNotes.loading = true;
    await render(<NotesScreen />);
    expect(screen.getByText('Loading notes')).toBeTruthy();
  });

  test('the error state is designed, not blank', async () => {
    mockNotes.error = new Error('boom');
    await render(<NotesScreen />);
    expect(screen.getByText('Couldn’t read the notes')).toBeTruthy();
  });
});

describe('<ExpensesScreen> — trip/[id]/expenses (T086, T087)', () => {
  test('shows the summary with totals, rates and pending rows, and the empty list', async () => {
    await render(<ExpensesScreen />);

    expect(screen.getByTestId('expenses-title')).toHaveTextContent(
      /Spending · Italy, spring 2026/,
    );
    expect(screen.getByTestId('summary-total')).toHaveTextContent(/18.00/);
    expect(screen.getByTestId(`summary-category-${FOOD}`)).toHaveTextContent(/Food/);
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(
      /1 EUR = 0\.888889 CHF/,
    );
    expect(screen.getByTestId('summary-rates')).toHaveTextContent(
      /exchangerate-api\.com/,
    );
    expect(screen.getByTestId('summary-pending')).toHaveTextContent(/XTS/);
    expect(screen.getByText('Nothing logged yet')).toBeTruthy();
  });

  test('the summary can be hidden, and "Add expense" opens the sheet for this trip', async () => {
    await render(<ExpensesScreen />);

    await fireEvent.press(screen.getByTestId('expenses-toggle-summary'));
    expect(screen.queryByTestId('spending-summary')).toBeNull();

    await fireEvent.press(screen.getByTestId('expenses-add'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modal/add-expense',
      params: { tripId: 'trip-42' },
    });
  });

  test('rows show the amount paid, the home amount or "awaiting a rate", and delete confirms', async () => {
    mockExpenses.data = [
      expense({}),
      expense({
        id: 'exp-2',
        currency: 'XTS',
        amount: '5.00',
        amount_home: null,
        fx_rate_to_home: null,
        fx_pending: true,
      }),
      expense({
        id: 'exp-3',
        currency: 'CHF',
        amount: '3.00',
        amount_home: '3.00',
        fx_rate_to_home: '1.000000',
      }),
    ];
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await render(<ExpensesScreen />);

    expect(screen.getByTestId('expense-paid-exp-1')).toHaveTextContent(/9\.00/);
    expect(screen.getByTestId('expense-home-exp-1')).toHaveTextContent(/8\.00/);
    expect(screen.getByTestId('expense-home-exp-2')).toHaveTextContent(/Awaiting a rate/);
    // Home-currency rows do not repeat themselves.
    expect(screen.queryByTestId('expense-home-exp-3')).toBeNull();

    await fireEvent.press(screen.getByTestId('expense-remove-exp-1'));
    expect(mockExpenseActions.removeExpense).toHaveBeenCalledWith('exp-1');
  });

  test('a failed delete is shown', async () => {
    mockExpenses.data = [expense({})];
    mockExpenseActions.removeExpense.mockImplementationOnce(() => {
      throw new Error('locked');
    });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    await render(<ExpensesScreen />);

    await fireEvent.press(screen.getByTestId('expense-remove-exp-1'));
    expect(screen.getByTestId('expenses-write-error')).toBeTruthy();
  });
});

describe('<AddExpenseScreen> — modal/add-expense (T086)', () => {
  test('defaults to the home currency, Food, and the stop of the day', async () => {
    await render(<AddExpenseScreen />);

    expect(screen.getByTestId('currency-CHF').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId(`category-${FOOD}`).props.accessibilityState).toMatchObject(
      {
        selected: true,
      },
    );
    expect(screen.getByTestId('add-expense-city-none')).toBeTruthy();
    expect(screen.getByTestId('add-expense-city-100')).toBeTruthy();
  });

  test('refuses a non-amount in words and writes nothing', async () => {
    await render(<AddExpenseScreen />);

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), 'twelve');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(screen.getByText('Enter an amount, like 12.50 or 12,50.')).toBeTruthy(),
    );
    expect(mockExpenseActions.createExpense).not.toHaveBeenCalled();
  });

  test('reads a comma amount, hands the repository the wire shape, and closes (Constitution II)', async () => {
    await render(<AddExpenseScreen />);

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '12,50');
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.press(screen.getByTestId('add-expense-city-101'));
    await fireEvent.changeText(screen.getByTestId('add-expense-note'), '  Lunch  ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(mockExpenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          trip_id: 'trip-42',
          home_currency: 'CHF',
          amount: '12.50',
          currency: 'EUR',
          category_id: FOOD,
          city_id: 101,
          note: 'Lunch',
        }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('the city pills are one radio group, and "No city" files the expense without one', async () => {
    await render(<AddExpenseScreen />);

    await fireEvent.press(screen.getByTestId('add-expense-city-101'));
    expect(
      screen.getByTestId('add-expense-city-101').props.accessibilityState,
    ).toMatchObject({ selected: true, checked: true });
    expect(screen.getByLabelText('Firenze')).toBe(
      screen.getByTestId('add-expense-city-101'),
    );

    await fireEvent.press(screen.getByTestId('add-expense-city-none'));
    expect(
      screen.getByTestId('add-expense-city-none').props.accessibilityState,
    ).toMatchObject({ selected: true, checked: true });
    expect(
      screen.getByTestId('add-expense-city-101').props.accessibilityState,
    ).toMatchObject({ selected: false, checked: false });

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '4');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });
    await waitFor(() =>
      expect(mockExpenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ city_id: null, amount: '4.00' }),
      ),
    );
  });

  test('a city the trip visits twice is offered once, and selecting it selects one pill', async () => {
    const romeAgain: StopWithPlace = {
      ...rome,
      id: 'stop-rome-again',
      sort_order: 2,
      arrive_date: '2026-05-15',
      depart_date: '2026-05-17',
    };
    mockStops.data = [rome, florence, romeAgain];
    try {
      await render(<AddExpenseScreen />);

      expect(screen.getAllByTestId('add-expense-city-100')).toHaveLength(1);
      expect(screen.getAllByLabelText('Roma')).toHaveLength(1);
      await fireEvent.press(screen.getByTestId('add-expense-city-100'));
      expect(
        screen.getByTestId('add-expense-city-100').props.accessibilityState,
      ).toMatchObject({ selected: true, checked: true });
    } finally {
      mockStops.data = [rome, florence];
    }
  });

  test('a new custom category is created on the spot and selected (FR-024)', async () => {
    await render(<AddExpenseScreen />);

    await fireEvent.changeText(screen.getByTestId('category-new-name'), 'Coffee');
    await fireEvent.press(screen.getByTestId('category-new-add'));

    expect(mockExpenseActions.createCategory).toHaveBeenCalledWith({ name: 'Coffee' });
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '3');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });
    await waitFor(() =>
      expect(mockExpenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: COFFEE, amount: '3.00' }),
      ),
    );
  });

  test('a failed local write is shown and the sheet stays open', async () => {
    mockExpenseActions.createExpense.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<AddExpenseScreen />);

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '1');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() => expect(screen.getByTestId('add-expense-error')).toBeTruthy());
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('a trip that is not on the device shows a designed state, and cancel goes back', async () => {
    mockTrip.data = null;
    await render(<AddExpenseScreen />);
    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();

    mockTrip.data = trip;
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getAllByTestId('add-expense-cancel')[0]!);
    expect(mockBack).toHaveBeenCalled();
  });

  test('stopOn picks the stop whose dates contain the day', () => {
    expect(stopOn([rome, florence], '2026-05-11')?.id).toBe('stop-rome');
    expect(stopOn([rome, florence], '2026-05-14')?.id).toBe('stop-florence');
    expect(stopOn([rome, florence], '2026-06-01')).toBeNull();
  });
});
