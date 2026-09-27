/**
 * `trip/[id]` (T068), `modal/add-trip` (T066), and `+not-found`.
 *
 * The live-query hooks and actions are mocked (their own suite runs them
 * against a real database). Pinned here: every state is designed (FR-027),
 * the derived status is shown as text + icon (FR-013), every stop action
 * reaches the right repository call with the right arguments (FR-012), and a
 * failed local write is reported and shown rather than swallowed.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import NotFoundScreen from '@/app/+not-found';
import AddTripScreen from '@/app/modal/add-trip';
import TripScreen from '@/app/trip/[id]/index';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { useSessionStore } from '@/features/auth/session-store';
import { Sentry } from '@/lib/sentry';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => {
  const { Pressable, Text } = require('react-native');
  return {
    useRouter: () => ({
      push: jest.fn(),
      back: mockBack,
      replace: mockReplace,
      canGoBack: () => true,
    }),
    useLocalSearchParams: () => mockParams,
    // A Link is a Pressable that navigates; recording the href is what matters.
    Link: ({
      href,
      children,
      ...rest
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => (
      <Pressable testID={`link:${href}`} {...rest}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Pressable>
    ),
  };
});

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

// The city picker talks to the geography hooks; here it is a stand-in that
// offers one city so the stop editor can be driven end to end.
jest.mock('@/components/trip/city-picker', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CityPicker: ({
      onSelect,
    }: {
      onSelect: (city: Record<string, unknown>, country: Record<string, unknown>) => void;
    }) => (
      <Pressable
        testID="pick-florence"
        onPress={() =>
          onSelect(
            {
              id: 101,
              country_id: 1,
              name: 'Firenze',
              ascii_name: 'Firenze',
              lat: 43.8,
              lng: 11.3,
              timezone: 'Europe/Rome',
              population: 380_000,
            },
            { id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' },
          )
        }>
        <Text>Pick Florence</Text>
      </Pressable>
    ),
  };
});

const mockTrip: { data: TripRow | null; loading: boolean; error: Error | null } = {
  data: null,
  loading: false,
  error: null,
};
const mockStops: { data: StopWithPlace[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};
const mockActions = {
  createTrip: jest.fn(),
  removeTrip: jest.fn(),
  addStop: jest.fn(),
  updateStopDates: jest.fn(),
  moveStop: jest.fn(),
  reorderStops: jest.fn(),
  removeStop: jest.fn(),
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrip: () => mockTrip,
  useTripStops: () => mockStops,
  useTripActions: () => mockActions,
}));

const trip: TripRow = {
  id: 'trip-42',
  title: 'Italy, spring 2026',
  home_currency: 'EUR',
  is_public: false,
  cover_photo_id: null,
  status: 'planning',
  created_at: '2026-04-01T10:00:00.000Z',
  updated_at: '2026-04-01T10:00:00.000Z',
  deleted_at: null,
  is_dirty: true,
  synced_at: null,
};

function stop(overrides: Partial<StopWithPlace>): StopWithPlace {
  return {
    id: 'stop-rome',
    trip_id: 'trip-42',
    city_id: 100,
    sort_order: 0,
    arrive_date: '2026-05-10',
    depart_date: '2026-05-12',
    created_at: '2026-04-01T10:00:00.000Z',
    updated_at: '2026-04-01T10:00:00.000Z',
    deleted_at: null,
    is_dirty: false,
    synced_at: '2026-04-01T10:00:00.000Z',
    city_name: 'Roma',
    country_id: 1,
    country_name: 'Italy',
    lat: 41.9,
    lng: 12.5,
    ...overrides,
  };
}

const rome = stop({});

/** The local calendar day `offset` days from now, as the wire's IsoDate. */
function iso(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const florence = stop({
  id: 'stop-florence',
  city_id: 101,
  sort_order: 1,
  arrive_date: '2026-05-12',
  depart_date: '2026-05-15',
  city_name: 'Firenze',
  is_dirty: true,
  synced_at: null,
});

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'GBP',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

beforeEach(() => {
  mockParams = { id: 'trip-42' };
  mockTrip.data = trip;
  mockTrip.loading = false;
  mockTrip.error = null;
  mockStops.data = [];
  mockStops.loading = false;
  mockStops.error = null;
  for (const action of Object.values(mockActions)) action.mockReset();
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('<TripScreen> — trip/[id]', () => {
  test('shows the title, the derived status as text + icon, the currency, and a pending marker while dirty', async () => {
    // Dated in the future relative to the test run, so the derived status is Planning.
    mockStops.data = [
      stop({ arrive_date: iso(30), depart_date: iso(32) }),
      { ...florence, arrive_date: iso(32), depart_date: iso(35) },
    ];
    await render(<TripScreen />);

    expect(screen.getByTestId('trip-title')).toHaveTextContent('Italy, spring 2026');
    expect(screen.getByLabelText('Status: Planning')).toBeTruthy();
    expect(screen.getByText('EUR')).toBeTruthy();
    // The trip row and the Florence stop are dirty; Rome is synced.
    expect(screen.getAllByLabelText('Sync pending')).toHaveLength(2);
  });

  test('derives Active from the stops, not from the stored column (FR-013)', async () => {
    mockStops.data = [stop({ arrive_date: iso(-1), depart_date: iso(1) })];
    await render(<TripScreen />);
    expect(screen.getByLabelText('Status: Active')).toBeTruthy();
  });

  test('shows a designed loading state until the trip is read (FR-027)', async () => {
    mockTrip.data = null;
    mockTrip.loading = true;
    await render(<TripScreen />);
    expect(screen.getByLabelText('Loading trip')).toBeTruthy();
  });

  test('shows a designed empty state when the trip is not on this device', async () => {
    mockTrip.data = null;
    await render(<TripScreen />);
    expect(screen.getByText('This trip isn’t on this device')).toBeTruthy();
    expect(screen.queryByTestId('trip-add-stop')).toBeNull();
  });

  test('lists stops in order with place, country, and dates', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);

    expect(screen.getByText('Roma')).toBeTruthy();
    expect(screen.getByText('Firenze')).toBeTruthy();
    expect(screen.getByTestId('stop-dates-stop-rome')).toHaveTextContent(/10.*12/);
    expect(screen.getByText('Stop 1')).toBeTruthy();
    expect(screen.getByText('Stop 2')).toBeTruthy();
  });

  test('a stop whose city is not cached still has a name', async () => {
    mockStops.data = [stop({ city_name: null, country_name: null, city_id: 777 })];
    await render(<TripScreen />);
    expect(screen.getByText('City #777')).toBeTruthy();
  });

  test('handles an array param without crashing — expo-router can hand back one', async () => {
    mockParams = { id: ['trip-42', 'other'] };
    await render(<TripScreen />);
    expect(screen.getByTestId('trip-title')).toBeTruthy();
  });

  test('offers a way back to the tabs', async () => {
    await render(<TripScreen />);
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalled();
  });

  test('move up / move down call the repository and are disabled at the ends (FR-012)', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);

    expect(
      screen.getByTestId('stop-move-up-stop-rome').props.accessibilityState,
    ).toMatchObject({
      disabled: true,
    });
    expect(
      screen.getByTestId('stop-move-down-stop-florence').props.accessibilityState,
    ).toMatchObject({ disabled: true });

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(mockActions.moveStop).toHaveBeenCalledWith('stop-rome', 'down');

    await fireEvent.press(screen.getByTestId('stop-move-up-stop-florence'));
    expect(mockActions.moveStop).toHaveBeenCalledWith('stop-florence', 'up');
  });

  test('Acceptance Scenario 1.6: dropping a dragged stop writes the whole new order once (T071b)', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);

    // Two stops: each row carries the drag handle the sortable list supplies.
    expect(screen.getAllByTestId('sortable-handle')).toHaveLength(2);
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(2);

    // The library delivers the drop as the data array in its new order.
    const { __dropAt } = jest.requireMock('react-native-sortables') as {
      __dropAt: (data: unknown[]) => void;
    };
    await act(async () => __dropAt([florence, rome]));

    expect(mockActions.reorderStops).toHaveBeenCalledWith('trip-42', [
      'stop-florence',
      'stop-rome',
    ]);
    expect(mockActions.moveStop).not.toHaveBeenCalled();
  });

  test('a single stop shows no drag handle — there is nothing to reorder', async () => {
    mockStops.data = [rome];
    await render(<TripScreen />);
    expect(screen.queryByTestId('sortable-handle')).toBeNull();
  });

  test('exposes the stop actions as accessibility actions on the row', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);
    const row = screen.getByTestId('stop-row-stop-florence');

    expect(row.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual([
      'moveUp',
      'moveDown',
      'edit',
      'delete',
    ]);

    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    expect(mockActions.moveStop).toHaveBeenCalledWith('stop-florence', 'up');

    // Last row: "move down" is a no-op rather than a call the repository must reject.
    await fireEvent(row, 'accessibilityAction', {
      nativeEvent: { actionName: 'moveDown' },
    });
    expect(mockActions.moveStop).toHaveBeenCalledTimes(1);
  });

  test('remove asks for confirmation, then tombstones through the repository', async () => {
    mockStops.data = [rome];
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-remove-stop-rome'));

    expect(alert).toHaveBeenCalledWith(
      'Remove Roma?',
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ text: 'Remove' })]),
    );
    const buttons = alert.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());
    expect(mockActions.removeStop).toHaveBeenCalledWith('stop-rome');
    alert.mockRestore();
  });

  test('"Add stop" opens the editor with arrival pre-suggested from the last departure (FR-015), and saves through the repository', async () => {
    mockStops.data = [rome];
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    expect(screen.getByTestId('stop-editor')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('pick-florence'));
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Firenze');
    // Rome departs 12 May → Florence arrives 12 May.
    expect(
      screen.getByTestId('stop-editor-arrive').props.accessibilityValue.text,
    ).toMatch(/12/);

    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(mockActions.addStop).toHaveBeenCalledWith({
      trip_id: 'trip-42',
      city_id: 101,
      arrive_date: '2026-05-12',
      depart_date: '2026-05-13',
    });
    expect(screen.queryByTestId('stop-editor')).toBeNull();
  });

  test('"Dates" opens the editor for an existing stop and saves the new pair', async () => {
    mockStops.data = [rome];
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-edit-stop-rome'));
    expect(screen.getByTestId('stop-editor-place')).toHaveTextContent('Roma');

    // Drive the iOS inline picker: open it, then pick a day.
    await fireEvent.press(screen.getByTestId('stop-editor-depart'));
    const picker = screen.getByTestId('stop-editor-depart-picker');
    await act(async () => picker.props.onValueChange({}, new Date(2026, 4, 14)));

    await fireEvent.press(screen.getByTestId('stop-editor-save'));

    expect(mockActions.updateStopDates).toHaveBeenCalledWith('stop-rome', {
      city_id: 100,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-14',
    });
  });

  test('cancelling the editor writes nothing', async () => {
    await render(<TripScreen />);
    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    await fireEvent.press(screen.getByTestId('stop-editor-cancel'));

    expect(screen.queryByTestId('stop-editor')).toBeNull();
    expect(mockActions.addStop).not.toHaveBeenCalled();
  });

  test('a failed local write is reported to Sentry AND shown to the traveller', async () => {
    mockStops.data = [rome, florence];
    mockActions.moveStop.mockImplementation(() => {
      throw new Error('database is locked');
    });
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByTestId('trip-write-error')).toHaveTextContent(
      /could not be saved/,
    );
  });

  test('shows a designed empty state for a trip with no stops yet', async () => {
    await render(<TripScreen />);
    expect(screen.getByText('No stops yet')).toBeTruthy();
  });

  test('shows a designed error state when the stops query fails', async () => {
    mockStops.error = new Error('locked');
    await render(<TripScreen />);
    expect(screen.getByText('Couldn’t read the stops')).toBeTruthy();
  });
});

describe('<AddTripScreen> — modal/add-trip (T066)', () => {
  test('defaults the home currency to the traveller’s own', async () => {
    await render(<AddTripScreen />);
    expect(screen.getByTestId('currency-GBP').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  test('refuses an empty title in words and writes nothing', async () => {
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByText('Give your trip a name.')).toBeTruthy();
    expect(mockActions.createTrip).not.toHaveBeenCalled();
  });

  test('refuses a malformed currency code in words', async () => {
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.changeText(screen.getByLabelText('Other currency code'), 'eu');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(screen.getByText('Use a 3-letter currency code, like EUR.')).toBeTruthy();
    expect(mockActions.createTrip).not.toHaveBeenCalled();
  });

  test('writes the trip locally first and opens it (Acceptance Scenario 1.3)', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'new-trip' });
    await render(<AddTripScreen />);
    await fireEvent.changeText(
      screen.getByLabelText('Trip name'),
      '  Italy, spring 2026 ',
    );
    await fireEvent.press(screen.getByTestId('currency-EUR'));
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(mockActions.createTrip).toHaveBeenCalledWith({
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
    });
    expect(mockReplace).toHaveBeenCalledWith('/trip/new-trip');
  });

  test('accepts a free-text code, upper-cased', async () => {
    mockActions.createTrip.mockReturnValue({ ...trip, id: 'thai' });
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Thailand');
    await fireEvent.changeText(screen.getByLabelText('Other currency code'), 'thb');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(mockActions.createTrip).toHaveBeenCalledWith({
      title: 'Thailand',
      home_currency: 'THB',
    });
  });

  test('a failed local write is reported and shown, and the sheet stays open', async () => {
    mockActions.createTrip.mockImplementation(() => {
      throw new Error('disk full');
    });
    await render(<AddTripScreen />);
    await fireEvent.changeText(screen.getByLabelText('Trip name'), 'Italy');
    await fireEvent.press(screen.getByTestId('add-trip-save'));

    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByTestId('add-trip-error')).toHaveTextContent(/could not be saved/);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test('performs no network call — the trip is local-first (Constitution II)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/modal/add-trip'), 'utf8') as string;
    expect(source).not.toMatch(/apiFetch|fetch\(|useMutation|api-client/);
  });

  test('offers a way to dismiss the modal', async () => {
    await render(<AddTripScreen />);
    await fireEvent.press(screen.getByLabelText('Cancel'));
    expect(mockBack).toHaveBeenCalled();
  });
});

describe('<NotFoundScreen> — +not-found', () => {
  test('is a designed state, not a bare default (FR-027)', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByText('This page does not exist')).toBeTruthy();
  });

  test('links back to the root', async () => {
    await render(<NotFoundScreen />);
    expect(screen.getByTestId('link:/')).toBeTruthy();
    expect(screen.getByText('Back to your globe')).toBeTruthy();
  });
});
