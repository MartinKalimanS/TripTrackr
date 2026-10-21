/**
 * 004 T436 - the add-expense sheet, `DateField` and `AnchorPicker` over the REAL
 * `heroui-native` under Jest (research D4-13).
 *
 * `test/app/us2-screens.test.tsx` and `test/components/{date-field,anchor-picker}.test.tsx`
 * render them over the stand-in. This file puts the kit's own TextField, Input, Chip, Button
 * and FieldError underneath, so what they rely on is checked against the real components:
 * nothing throws (the kit needs only its provider), the ids and names land on the nodes a
 * test or a Maestro flow finds them by, an amount typed with a comma still reaches the
 * repository as a decimal string, the day field's classes reach its pressable and the kit's
 * `FieldError` words appear under a field only while it is refused. How a class LOOKS (the
 * field fill, the boundary, the sheet) is Uniwind's, on a device.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';

import AddExpenseScreen from '@/app/modal/add-expense';
import { AnchorPicker } from '@/components/trip/anchor-picker';
import { DateField } from '@/components/trip/date-field';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import type { AnchorTarget } from '@/features/notes/use-move-note';
import { formatIsoDate } from '@/features/trips/stop-dates';

import { classesOf } from '../helpers/host-nodes';

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factories may reference them.
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ tripId: 'trip-42' }),
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
  created_at: 'x',
  updated_at: 'x',
  deleted_at: null,
  is_dirty: false,
  synced_at: 'x',
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

const mockTripState: { data: TripRow | null; loading: boolean; error: Error | null } = {
  data: mockTrip,
  loading: false,
  error: null,
};
jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTripState,
  useTripStops: () => ({
    data: [stop('s1', 'Roma', 100), stop('s2', 'Firenze', 101)],
    loading: false,
    error: null,
  }),
}));

const mockCreateExpense = jest.fn();
const mockCategories = {
  data: SYSTEM_EXPENSE_CATEGORIES.map((c) => ({ ...c, system: true })),
  loading: false,
  error: null,
};
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenseCategories: () => mockCategories,
  useExpenseActions: () => ({
    createExpense: mockCreateExpense,
    createCategory: jest.fn(() => ({ id: 'new-category', name: 'Coffee' })),
  }),
  useFxSnapshot: () => null,
}));

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

const inKit = (element: React.ReactElement) =>
  render(<HeroUINativeProvider config={CONFIG}>{element}</HeroUINativeProvider>);

beforeEach(() => {
  mockBack.mockClear();
  mockCreateExpense.mockReset();
  mockTripState.data = mockTrip;
  mockTripState.loading = false;
  mockTripState.error = null;
});

describe('the add-expense sheet over the real kit', () => {
  test('renders the title, every field, the chips and the footer without error', async () => {
    await inKit(<AddExpenseScreen />);

    expect(screen.getByTestId('add-expense-screen')).toBeTruthy();
    expect(screen.getByTestId('add-expense-amount').type).toBe('TextInput');
    await fireEvent.press(screen.getByTestId('add-expense-more'));
    expect(screen.getByTestId('add-expense-note').type).toBe('TextInput');
    expect(screen.getByTestId('add-expense-date').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('currency-CHF').props.accessibilityRole).toBe('radio');
    expect(screen.getByTestId('add-expense-city-100').props.accessibilityRole).toBe(
      'radio',
    );
    expect(screen.getByTestId('add-expense-save').props.accessibilityRole).toBe('button');
    expect(screen.getByTestId('add-expense-cancel').props.accessibilityRole).toBe(
      'button',
    );
  });

  test('a comma amount typed into the real input reaches the repository as a decimal string', async () => {
    await inKit(<AddExpenseScreen />);

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), '1.234,50');
    await fireEvent.press(screen.getByTestId('add-expense-more'));
    await fireEvent.press(screen.getByTestId('add-expense-city-101'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    await waitFor(() =>
      expect(mockCreateExpense).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1234.50', city_id: 101, currency: 'CHF' }),
      ),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('a refused amount appears as the pictured figure’s error words, and not before', async () => {
    await inKit(<AddExpenseScreen />);
    expect(screen.queryByTestId('add-expense-amount-error')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('add-expense-amount'), 'twelve');
    await act(async () => {
      fireEvent.press(screen.getByTestId('add-expense-save'));
    });

    const words = await screen.findByTestId('add-expense-amount-error');
    expect(words.props.accessibilityRole).toBe('alert');
    expect(screen.getByTestId('add-expense-amount').props['aria-invalid']).toBe(true);
  });

  test('with no trip the real kit draws the empty state and a Close that goes back', async () => {
    mockTripState.data = null;
    await inKit(<AddExpenseScreen />);

    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-expense-close'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe('DateField over the real kit', () => {
  test('the pressable keeps its identity and takes the field classes', async () => {
    const onChange = jest.fn();
    await inKit(
      <DateField
        testID="arrive"
        label="Arrival"
        value="2026-05-12"
        onChange={onChange}
      />,
    );

    const field = screen.getByTestId('arrive');
    expect(field.props.accessibilityRole).toBe('button');
    expect(field.props.accessibilityLabel).toBe('Arrival');
    expect(field.props.accessibilityValue).toEqual({ text: formatIsoDate('2026-05-12') });
    expect(classesOf(field)).toEqual(
      expect.arrayContaining(['bg-field', 'border', 'border-field-border']),
    );

    await fireEvent.press(field);
    expect(screen.getByTestId('arrive-picker')).toBeTruthy();
  });

  test('a refusal is words under the field and turns the boundary danger', async () => {
    await inKit(
      <DateField
        testID="depart"
        label="Departure"
        value="2026-05-10"
        onChange={jest.fn()}
        error="Departure can’t be before arrival."
      />,
    );

    expect(screen.getByTestId('depart-error').props.accessibilityRole).toBe('alert');
    expect(classesOf(screen.getByTestId('depart'))).toContain('border-danger');
  });
});

describe('AnchorPicker over the real kit', () => {
  const targets: AnchorTarget[] = [
    {
      level: 'trip',
      key: 'country:1',
      label: 'Whole trip (Italy)',
      country_id: 1,
      city_id: null,
    },
    { level: 'city', key: 'city:100', label: 'Roma, Italy', country_id: 1, city_id: 100 },
  ];

  test('the chips are radios the kit names, selects and presses', async () => {
    const onChange = jest.fn();
    await inKit(
      <AnchorPicker
        testID="note-editor-anchor"
        label="Filed under"
        targets={targets}
        value="country:1"
        onChange={onChange}
        error="Choose one."
      />,
    );

    const roma = screen.getByTestId('anchor-city:100');
    expect(roma.props.accessibilityRole).toBe('radio');
    expect(roma.props.accessibilityLabel).toBe('Roma, Italy');
    expect(screen.getByTestId('anchor-country:1').props.accessibilityState).toMatchObject(
      {
        selected: true,
        checked: true,
      },
    );
    await fireEvent.press(roma);
    expect(onChange).toHaveBeenCalledWith('city:100');
    expect(screen.getByTestId('note-editor-anchor-error').props.accessibilityRole).toBe(
      'alert',
    );
  });
});
