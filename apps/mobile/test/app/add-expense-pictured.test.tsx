/**
 * F6 - Add expense as pictured (`add-expense.png`, `-dark`, `-long`, `-scale1.5`; UI-SPEC 9.1):
 * the amount first (display ~56, tabular, decimal keypad) with its symbol and, when the
 * cached rates can back it, "≈ $26.63 at today's rate"; the category and currency chip rows;
 * "Add note, date or place" collapsed with a summary; "Only you" in the header; Save above
 * the keypad. The app's words win over the picture's (the title stays "New expense").
 *
 * The behaviour tests (wire shape, refusals, haptics) are `us2-screens.test.tsx`; this suite
 * pins what the pictures add.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { StyleSheet } from 'react-native';

import AddExpenseScreen from '@/app/modal/add-expense';
import type { CategoryOption } from '@/db/repositories/expenses';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { todayIso } from '@/features/trips/stop-dates';

import { glyphNamesIn } from '../helpers/icons';
import {
  PHONE_360X640,
  expectActionAboveKeyboard,
  resetKeyboard,
  setWindow,
  showKeyboard,
} from '../helpers/keyboard';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
  useLocalSearchParams: () => ({ tripId: 'trip-42' }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Portugal Road Trip',
  home_currency: 'USD',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: false,
  synced_at: '2026-04-01T10:00:00.000Z',
};

function stopAt(day: string): StopWithPlace {
  return {
    id: 'stop-lisbon',
    trip_id: 'trip-42',
    city_id: 7,
    sort_order: 0,
    arrive_date: day,
    depart_date: day,
    created_at: 'x',
    updated_at: 'x',
    deleted_at: null,
    is_dirty: false,
    synced_at: 'x',
    city_name: 'Lisbon',
    country_id: 1,
    country_name: 'Portugal',
    lat: 38.7,
    lng: -9.1,
  };
}

const mockTrip = { data: trip as TripRow | null, loading: false, error: null };
const mockStops = { data: [stopAt(todayIso())], loading: false, error: null };

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
}));

const mockCategories: CategoryOption[] = SYSTEM_EXPENSE_CATEGORIES.map((c) => ({
  ...c,
  system: true,
}));
const mockActions = {
  createExpense: jest.fn(),
  createCategory: jest.fn(() => ({ id: 'custom-1', name: 'Coffee' })),
};
const mockFx: { current: null | { asOf: string; rates: Record<string, string> } } = {
  current: null,
};

jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenseCategories: () => ({ data: mockCategories, loading: false, error: null }),
  useExpenseActions: () => mockActions,
  useFxSnapshot: () => mockFx.current,
}));

const hidden = { includeHiddenElements: true };
const flat = (node: { props: { style?: unknown } }) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

beforeEach(() => {
  setWindow({ width: 390, height: 844 });
  mockFx.current = null;
  mockActions.createExpense.mockReset();
  mockBack.mockClear();
});
afterEach(() => resetKeyboard());

describe('<AddExpenseScreen> as pictured (F6)', () => {
  test('the amount is the first control: the figure before the category and the currency rows', async () => {
    await render(<AddExpenseScreen />);

    const tree = JSON.stringify(screen.toJSON());
    const amount = tree.indexOf('add-expense-amount');
    expect(amount).toBeGreaterThan(-1);
    expect(amount).toBeLessThan(tree.indexOf('"Category"'));
    expect(tree.indexOf('"Category"')).toBeLessThan(tree.indexOf('"Currency"'));
    const input = screen.getByTestId('add-expense-amount');
    expect(flat(input)).toMatchObject({ fontSize: 56, lineHeight: 60 });
    expect(input.props.keyboardType).toBe('decimal-pad');
    expect(input.props.autoFocus).toBe(true);
  });

  test('the header carries Cancel, the title in the app\'s words, and "Only you"', async () => {
    await render(<AddExpenseScreen />);

    const header = within(screen.getByTestId('add-expense-screen-header'));
    expect(header.getByTestId('add-expense-cancel')).toBeTruthy();
    expect(header.getByText('New expense')).toBeTruthy();
    expect(header.getByTestId('privacy-chip')).toBeTruthy();
    expect(header.getByText('Only you')).toBeTruthy();
  });

  test('from text scale 1.5 the "Only you" chip leaves the header (the prototype drops it)', async () => {
    setWindow({ width: 390, height: 844, fontScale: 1.5 });
    await render(<AddExpenseScreen />);
    expect(screen.queryByTestId('privacy-chip')).toBeNull();
    expect(screen.getByText('New expense')).toBeTruthy();
  });

  test('the currency row is named "Currency", ends in the dashed "Other" with a plus, and the symbol shows', async () => {
    await render(<AddExpenseScreen />);

    expect(screen.getByLabelText('Currency').props.accessibilityRole).toBe('radiogroup');
    expect(screen.queryByText('Home currency')).toBeNull();
    const other = screen.getByTestId('currency-other-toggle');
    expect(flat(other).borderStyle).toBe('dashed');
    expect(screen.getByText(/^(US)?[$]$/, hidden)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    expect(screen.getByText('€', hidden)).toBeTruthy();
  });

  test('every category chip wears its glyph, and the selected one the check', async () => {
    await render(<AddExpenseScreen />);

    const food = screen.getByTestId(`category-${SYSTEM_EXPENSE_CATEGORIES[0].id}`);
    expect(glyphNamesIn(food)).toEqual(['check']);
    const transport = screen.getByTestId(`category-${SYSTEM_EXPENSE_CATEGORIES[2].id}`);
    expect(glyphNamesIn(transport)).toEqual(['tram']);
    expect(screen.getByText('Transport')).toBeTruthy();
  });

  test('the new-category field is behind a dashed "New" chip that ends the row', async () => {
    await render(<AddExpenseScreen />);

    expect(screen.queryByTestId('category-new-name')).toBeNull();
    const group = screen.getByLabelText('Category');
    const radios = within(group).getAllByRole('radio');
    expect(radios.at(-1)?.props.testID).toBe('category-new-toggle');
    expect(radios.at(-1)?.props.accessibilityLabel).toBe('New category');

    await fireEvent.press(screen.getByTestId('category-new-toggle'));
    expect(screen.getByTestId('category-new-name')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('category-new-toggle'));
    expect(screen.queryByTestId('category-new-name')).toBeNull();
  });
});

describe('<AddExpenseScreen> - "Add note, date or place" (F6)', () => {
  test('is collapsed at first: the day, city and note are not drawn, the summary says what is set', async () => {
    await render(<AddExpenseScreen />);

    const row = screen.getByTestId('add-expense-more');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Add note, date or place');
    expect(row.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByTestId('add-expense-date')).toBeNull();
    expect(screen.queryByTestId('add-expense-note')).toBeNull();
    expect(screen.getByTestId('add-expense-more-summary').props.children).toMatch(
      /^Today, .+ · Lisbon$/,
    );
  });

  test('opens on a tap with the same fields and ids as before, and closes again', async () => {
    await render(<AddExpenseScreen />);

    await fireEvent.press(screen.getByTestId('add-expense-more'));
    expect(screen.getByTestId('add-expense-more').props.accessibilityState).toMatchObject(
      {
        expanded: true,
      },
    );
    for (const id of ['add-expense-date', 'add-expense-note', 'add-expense-city-7']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(glyphNamesIn(screen.getByTestId('add-expense-more'))).toEqual([
      'pencil',
      'chevron-up',
    ]);

    await fireEvent.press(screen.getByTestId('add-expense-more'));
    expect(screen.queryByTestId('add-expense-note')).toBeNull();
    expect(glyphNamesIn(screen.getByTestId('add-expense-more'))).toEqual([
      'pencil',
      'chevron-down',
    ]);
  });

  test('closing it hides nothing: a typed note still saves and the summary says so', async () => {
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getByTestId('add-expense-more'));
    await fireEvent.changeText(screen.getByTestId('add-expense-note'), 'Pastel de nata');
    await fireEvent.press(screen.getByTestId('add-expense-more'));

    expect(screen.getByTestId('add-expense-more-summary').props.children).toMatch(
      /· Lisbon · Note$/,
    );
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '2,50');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });
    await waitFor(() =>
      expect(mockActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '2.50', note: 'Pastel de nata', city_id: 7 }),
      ),
    );
  });

  test('opens by itself when the note has a refusal to show, so an error is never hidden', async () => {
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getByTestId('add-expense-more'));
    await fireEvent.changeText(screen.getByTestId('add-expense-note'), 'x'.repeat(501));
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '4');
    await fireEvent.press(screen.getByTestId('add-expense-more'));
    expect(screen.queryByTestId('add-expense-note')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(screen.getByTestId('add-expense-note-error')).toHaveTextContent(
        'Keep the note under 500 characters.',
      ),
    );
    expect(mockActions.createExpense).not.toHaveBeenCalled();
  });
});

describe('<AddExpenseScreen> - the rate line (F6; SC-016, Q-11)', () => {
  const snapshot = (asOf: string) => ({
    asOf,
    rates: { EUR: '0.92', GBP: '0.79' },
  });

  test('is not drawn without a snapshot', async () => {
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '24.50');
    expect(screen.queryByTestId('add-expense-rate')).toBeNull();
  });

  test('says "≈ $26.63 at today\'s rate" from the cached snapshot, in decimal arithmetic', async () => {
    mockFx.current = snapshot(todayIso());
    await render(<AddExpenseScreen />);

    expect(screen.queryByTestId('add-expense-rate')).toBeNull();
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '24,50');

    expect(screen.getByTestId('add-expense-rate')).toHaveTextContent(
      /^≈ (US)?[$]26[.]63 at today's rate$/,
    );
  });

  test('names the snapshot day when it is older, and goes when the amount is not one', async () => {
    mockFx.current = snapshot('2020-01-02');
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '10');
    expect(screen.getByTestId('add-expense-rate')).toHaveTextContent(
      /^≈ (US)?[$]10[.]87 at the rate of 2020-01-02$/,
    );

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), 'ten');
    expect(screen.queryByTestId('add-expense-rate')).toBeNull();
  });

  test('is only a preview: what is saved is still the typed amount in the chosen currency', async () => {
    mockFx.current = snapshot(todayIso());
    await render(<AddExpenseScreen />);
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '24.50');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(mockActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '24.50',
          currency: 'EUR',
          home_currency: 'USD',
        }),
      ),
    );
  });
});

describe('<AddExpenseScreen> - Save above the keypad (C4-10 rule 8, F6)', () => {
  beforeEach(() => setWindow(PHONE_360X640));

  test('with the keypad up Save is in the footer, outside the scrolling body, and Cancel in the header', async () => {
    await render(<AddExpenseScreen />);
    await showKeyboard();

    expectActionAboveKeyboard('add-expense-screen', 'add-expense-save');
    expect(
      within(screen.getByTestId('add-expense-screen-header')).getByTestId(
        'add-expense-cancel',
      ),
    ).toBeTruthy();
  });

  test('typing the amount and tapping Save with the keypad up files it, as the Maestro flow does', async () => {
    await render(<AddExpenseScreen />);
    await showKeyboard();

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '5.50');
    await fireEvent.press(
      screen.getByTestId(`category-${SYSTEM_EXPENSE_CATEGORIES[2].id}`),
    );
    expectActionAboveKeyboard('add-expense-screen', 'add-expense-save');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(mockActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: '5.50',
          category_id: SYSTEM_EXPENSE_CATEGORIES[2].id,
        }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('the sheet is capped above the keypad so the primary is never under it', async () => {
    await render(<AddExpenseScreen />);
    await showKeyboard();
    expect(
      flat(screen.getByTestId('add-expense-screen')).maxHeight as number,
    ).toBeLessThanOrEqual(640 - 300);
  });
});

describe('<AddExpenseScreen> - source rules (F6)', () => {
  test('uses decimal strings only: no float parse on an amount, no colour literal, no kit', () => {
    for (const file of [
      '@/app/modal/add-expense',
      '@/components/ui/amount-input',
      '@/components/trip/expense-extras',
      '@/features/expenses/amount-preview',
    ]) {
      const source = readFileSync(require.resolve(file), 'utf8');
      expect(source).not.toMatch(/parseFloat|Number\(amount|Number\(parsed/);
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
    }
  });

  test('the glyph helper sees the lock in the privacy chip', async () => {
    await render(<AddExpenseScreen />);
    expect(glyphNamesIn(screen.getByTestId('privacy-chip', hidden))).toEqual(['lock']);
  });
});
