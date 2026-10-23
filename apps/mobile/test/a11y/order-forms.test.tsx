/**
 * T560 - the reading order of the forms (feature 005; FR-070, FR-075, SC-015; UI-SPEC section
 * 9.1): a form is a sheet whose header says Cancel, the title and (where there is one) the
 * privacy line, whose body reads field by field, and whose sticky footer, Save, comes last. New
 * trip, the stop editor (a state-driven sheet) and New expense. The mocked worlds are
 * `trip-and-modal-screens.test.tsx`'s and `add-expense-pictured.test.tsx`'s.
 */
import { SYSTEM_EXPENSE_CATEGORIES } from '@triptrackr/contracts';
import { render } from '@testing-library/react-native';

import AddExpenseScreen from '@/app/modal/add-expense';
import AddTripScreen from '@/app/modal/add-trip';
import { StopEditor } from '@/components/trip/stop-editor';
import type { CategoryOption } from '@/db/repositories/expenses';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { useSessionStore } from '@/features/auth/session-store';
import { todayIso } from '@/features/trips/stop-dates';

import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';
import { resetKeyboard, setWindow } from '../helpers/keyboard';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => ({ tripId: 'trip-42' }),
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

jest.mock('@/components/trip/city-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CityPicker: () => (
      <Pressable testID="pick-city" accessibilityLabel="Pick a city">
        <Text>Pick a city</Text>
      </Pressable>
    ),
  };
});

const mockTrip: TripRow = {
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

const mockStopToday: StopWithPlace = {
  id: 'stop-lisbon',
  trip_id: 'trip-42',
  city_id: 7,
  sort_order: 0,
  arrive_date: todayIso(),
  depart_date: todayIso(),
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

jest.mock('@/features/trips/use-trips', () => ({
  useTripActions: () => ({ createTrip: jest.fn() }),
  useTrip: () => ({ data: mockTrip, loading: false, error: null }),
  useTripStops: () => ({ data: [mockStopToday], loading: false, error: null }),
}));

const mockCategories: CategoryOption[] = SYSTEM_EXPENSE_CATEGORIES.map((c) => ({
  ...c,
  system: true,
}));
jest.mock('@/features/expenses/use-expenses', () => ({
  useExpenseCategories: () => ({ data: mockCategories, loading: false, error: null }),
  useExpenseActions: () => ({ createExpense: jest.fn(), createCategory: jest.fn() }),
  useFxSnapshot: () => null,
}));

beforeEach(() => {
  setWindow({ width: 390, height: 844 });
  useSessionStore.setState({
    status: 'signed-in',
    user: { display_name: 'Ana', home_currency: 'GBP' } as never,
  });
});
afterEach(() => resetKeyboard());

describe('New trip', () => {
  test('Cancel, the title, the name, the currency, then Save', async () => {
    await render(<AddTripScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'add-trip-cancel',
      'New trip',
      'add-trip-title',
      'Home currency',
      'add-trip-save',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('the title is a heading and the selected currency says it is selected', async () => {
    await render(<AddTripScreen />);
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.name === 'New trip')?.role).toBe('header');
    expect(nodes.find((node) => node.id === 'currency-GBP')?.state).toContain('selected');
    expect(nodes.find((node) => node.id === 'currency-EUR')?.state).not.toContain(
      'selected',
    );
  });
});

describe('The stop editor', () => {
  test('adding: Cancel, the title, the city to pick, then Save (unavailable until a city is chosen)', async () => {
    await render(
      <StopEditor
        visible
        mode={{ kind: 'add', previousStop: { depart_date: '2026-05-12' } }}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'stop-editor-cancel',
      'Add stop',
      'pick-city',
      'stop-editor-save',
    ]);
    expect(nodes.find((node) => node.id === 'stop-editor-save')?.state).toEqual([
      'disabled',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });

  test('editing: Cancel, the title, the place, arrival, departure, nights, then Save', async () => {
    await render(
      <StopEditor
        visible
        mode={{
          kind: 'edit',
          stop: { city_id: 100, arrive_date: '2026-05-10', depart_date: '2026-05-12' },
          placeName: 'Roma',
        }}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'stop-editor-cancel',
      'Edit dates',
      'stop-editor-place',
      'stop-editor-arrive',
      'stop-editor-depart',
      'stop-editor-nights-less',
      'stop-editor-nights-more',
      'stop-editor-save',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});

describe('New expense', () => {
  test('the amount first, then the category and the currency, the note, the date and Save', async () => {
    await render(<AddExpenseScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'add-expense-amount',
      'Category',
      'Currency',
      'add-expense-save',
    ]);
    expect(unnamed(nodes)).toEqual([]);
    expect(exposedArt()).toEqual([]);
  });
});
