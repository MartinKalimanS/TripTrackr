/**
 * `trip/[id]` (T068), `modal/add-trip` (T066), and `+not-found`.
 *
 * The live-query hooks and actions are mocked (their own suite runs them
 * against a real database). Pinned here: every state is designed (FR-027),
 * the derived status is shown as text + icon (FR-013), every stop action
 * reaches the right repository call with the right arguments (FR-012), and a
 * failed local write is reported and shown rather than swallowed.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import NotFoundScreen from '@/app/+not-found';
import AddTripScreen from '@/app/modal/add-trip';
import TripScreen from '@/app/trip/[id]/index';
import { SCREEN_GUTTER } from '@/components/ui/screen';
import type { StopWithPlace } from '@/db/repositories/stops';
import type { TripRow } from '@/db/schema';
import { useSessionStore } from '@/features/auth/session-store';
import { Sentry } from '@/lib/sentry';

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string | string[]> = { id: 'trip-42' };

jest.mock('expo-router', () => {
  const { Pressable, Text } = require('react-native');
  return {
    useRouter: () => ({
      push: mockPush,
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

/** Icons are decorative, so a query for one has to look at hidden elements too. */
const hidden = { includeHiddenElements: true };

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
    expect(screen.queryByTestId('trip-title')).toBeNull();
    expect(screen.queryByTestId('trip-links')).toBeNull();
  });

  test('says in words that the trip could not be read, rather than that it is missing (FR-035)', async () => {
    mockTrip.data = null;
    mockTrip.error = new Error('locked');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(screen.queryByText('This trip isn’t on this device')).toBeNull();
    expect(screen.queryByTestId('trip-add-stop')).toBeNull();
  });

  // A live read that fails leaves its first-result timestamp unset, so a hook that only
  // looked at that reported `loading` together with the error. The screen must not let the
  // spinner hide the words, whichever way a hook reports the pair.
  test('shows the error, not the spinner, when a failed read still says loading', async () => {
    mockTrip.data = null;
    mockTrip.loading = true;
    mockTrip.error = new Error('no such table');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read this trip')).toBeTruthy();
    expect(screen.queryByLabelText('Loading trip')).toBeNull();
  });

  test('shows the stops error, not the placeholders, when a failed read still says loading', async () => {
    mockStops.loading = true;
    mockStops.error = new Error('no such table');
    await render(<TripScreen />);

    expect(screen.getByText('Couldn’t read the stops')).toBeTruthy();
    expect(screen.queryByLabelText('Loading stops')).toBeNull();
    expect(screen.queryByTestId('trip-stops')).toBeNull();
  });

  test('never shows its empty state while the first read is still resolving (C4-10 rule 2)', async () => {
    mockTrip.data = null;
    mockTrip.loading = true;
    await render(<TripScreen />);
    expect(screen.queryByText('This trip isn’t on this device')).toBeNull();
    expect(screen.queryByTestId('trip-header-row')).toBeNull();
  });

  test('shows placeholders shaped like the stops while they load, named for assistive technology (FR-021)', async () => {
    mockStops.loading = true;
    await render(<TripScreen />);

    const region = screen.getByLabelText('Loading stops');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByText('No stops yet')).toBeNull();
    // The rest of the screen is already there while the stops load.
    expect(screen.getByTestId('trip-title')).toBeTruthy();
    expect(screen.getByTestId('trip-add-stop')).toBeTruthy();
  });

  test('lists stops in order with place, country, and dates', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);

    expect(screen.getByText('Roma')).toBeTruthy();
    expect(screen.getByText('Firenze')).toBeTruthy();
    expect(screen.getByTestId('stop-dates-stop-rome')).toHaveTextContent(/10.*12/);
    // The timeline numbers each stop by its place in the order; the row's own name
    // (`Stop 1: Roma, Italy. ...`) is what screen readers and the Maestro flows use.
    expect(screen.getByTestId('stop-number-stop-rome')).toHaveTextContent('1');
    expect(screen.getByTestId('stop-number-stop-florence')).toHaveTextContent('2');
    expect(screen.getByTestId('stop-row-stop-rome').props.accessibilityLabel).toMatch(
      /^Stop 1: Roma, Italy\./,
    );
    expect(screen.getByTestId('stop-row-stop-florence').props.accessibilityLabel).toMatch(
      /^Stop 2: Firenze, Italy\./,
    );
  });

  test('draws the stops in the order the repository returns them, inside the stops list', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);

    const rows = within(screen.getByTestId('trip-stops')).getAllByTestId(/^stop-row-/);
    expect(rows.map((row) => row.props.testID)).toEqual([
      'stop-row-stop-rome',
      'stop-row-stop-florence',
    ]);
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

  test('draws no Back of its own: the native header carries it (trip-layout.test.tsx)', async () => {
    await render(<TripScreen />);
    expect(screen.queryByLabelText('Back')).toBeNull();
    expect(screen.queryByText('Back')).toBeNull();
  });

  test('is a hero: the title is a large title announced as a heading, in the exact words of the trip', async () => {
    await render(<TripScreen />);

    const title = screen.getByTestId('trip-title');
    expect(title).toHaveTextContent('Italy, spring 2026');
    expect(title.props.accessibilityRole).toBe('header');
    expect(title.props.className).toContain('text-[32px]');
  });

  test('puts the status, the currency and the sync marker on one row beneath the title (004 FR-007; 003 FR-018 as superseded)', async () => {
    await render(<TripScreen />);

    const row = within(screen.getByTestId('trip-header-row'));
    expect(row.getByTestId('status-pill-planning')).toBeTruthy();
    expect(row.getByLabelText('Status: Planning')).toBeTruthy();
    expect(row.getByText('EUR')).toBeTruthy();
    // The fixture trip is dirty: the pending marker sits in the same row.
    expect(row.getByLabelText('Sync pending')).toBeTruthy();
    expect(row.queryByTestId('trip-title')).toBeNull();
    expect(row.queryByLabelText('Back')).toBeNull();
  });

  test('shows no sync marker beside a trip that is already on the server', async () => {
    mockTrip.data = { ...trip, is_dirty: false };
    await render(<TripScreen />);
    expect(
      within(screen.getByTestId('trip-header-row')).queryByLabelText('Sync pending'),
    ).toBeNull();
  });

  test('reads top to bottom: title, status row, areas, stops header, stops', async () => {
    mockStops.data = [rome];
    await render(<TripScreen />);

    const order = screen
      .getAllByTestId(/^trip-(title|header-row|links|add-stop|stops)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual([
      'trip-title',
      'trip-header-row',
      'trip-links',
      'trip-add-stop',
      'trip-stops',
    ]);
  });

  test('keeps the five areas in one row that scrolls sideways instead of wrapping (feature 003 FR-018)', async () => {
    await render(<TripScreen />);

    const row = screen.getByTestId('trip-links');
    expect(row.props.horizontal).toBe(true);
    expect(row.props.showsHorizontalScrollIndicator).toBe(false);
    const segments = ['notes', 'expenses', 'photos', 'documents', 'offline-maps'];
    for (const segment of segments) {
      expect(within(row).getByTestId(`trip-open-${segment}`)).toBeTruthy();
    }
    expect(within(row).getAllByRole('button')).toHaveLength(segments.length);
  });

  test('bleeds to the screen edges by exactly the screen’s own side padding, which it reads from the Screen adapter', async () => {
    await render(<TripScreen />);

    const row = screen.getByTestId('trip-links');
    expect(StyleSheet.flatten(row.props.style).marginHorizontal).toBe(-SCREEN_GUTTER);
    expect(StyleSheet.flatten(row.props.contentContainerStyle).paddingHorizontal).toBe(
      SCREEN_GUTTER,
    );
    // Not a second copy of the number.
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    const source = readFileSync(require.resolve('@/app/trip/[id]/index'), 'utf8');
    expect(source).toMatch(/SCREEN_GUTTER/);
    expect(source).not.toMatch(/Spacing\.four/);
  });

  test('each area is an icon and a label in a chip, and the words are never capped, so the row stays reachable at the largest text size (FR-029)', async () => {
    await render(<TripScreen />);

    const row = screen.getByTestId('trip-links');
    for (const segment of ['notes', 'expenses', 'photos', 'documents', 'offline-maps']) {
      const link = within(row).getByTestId(`trip-open-${segment}`);
      expect(link.props.accessibilityRole).toBe('button');
      expect(within(link).getByTestId(`trip-open-${segment}-icon`, hidden)).toBeTruthy();
    }
    for (const label of within(row).getAllByText(
      /Notes|Spending|Photos|Documents|Offline maps/,
    )) {
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.maxFontSizeMultiplier).toBeUndefined();
    }
  });

  test.each([
    ['notes', 'Notes', 'Notes for this trip'],
    ['expenses', 'Spending', 'Spending for this trip'],
    ['photos', 'Photos', 'Photos for this trip'],
    ['documents', 'Documents', 'Travel documents for this trip'],
    ['offline-maps', 'Offline maps', 'Offline maps for this trip'],
  ])(
    '"%s" opens the trip’s own screen for it (US2, US4, US5)',
    async (segment, text, label) => {
      mockStops.data = [rome];
      await render(<TripScreen />);

      const link = screen.getByTestId(`trip-open-${segment}`);
      expect(link.props.accessibilityLabel).toBe(label);
      expect(link).toHaveTextContent(text);

      await fireEvent.press(link);
      expect(mockPush).toHaveBeenCalledWith(`/trip/trip-42/${segment}`);
    },
  );

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

  test('numbers the stops again once the dragged one has landed, and not while it is carried', async () => {
    mockStops.data = [rome, florence];
    await render(<TripScreen />);
    const sortables = jest.requireMock('react-native-sortables') as {
      __dragStart: (key: string) => void;
      __dropAt: (data: unknown[]) => void;
      __activeItemDropped: (key: string) => void;
    };

    await act(async () => sortables.__dragStart('stop-florence'));
    expect(screen.queryByTestId('stop-number-stop-rome')).toBeNull();
    expect(screen.queryByTestId('stop-number-stop-florence')).toBeNull();

    await act(async () => sortables.__dropAt([florence, rome]));
    await act(async () => sortables.__activeItemDropped('stop-florence'));
    expect(screen.getByTestId('stop-number-stop-rome')).toHaveTextContent('1');
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

  test('the Stops header pairs a heading with a secondary "Add stop" button, and offers no primary (FR-005)', async () => {
    mockStops.data = [rome];
    await render(<TripScreen />);

    const header = screen.getByText('Stops');
    expect(header.props.accessibilityRole).not.toBe('button');
    const add = screen.getByTestId('trip-add-stop');
    expect(add.props.accessibilityLabel).toBe('Add stop');
    expect(add.props.accessibilityRole).toBe('button');
    expect(add.props.variant).toBe('secondary');
    expect(within(add).getByText('Add stop')).toBeTruthy();
    // Nothing on this screen state is a primary control.
    const primaries = screen
      .getAllByRole('button')
      .filter((button) => button.props.variant === 'primary');
    expect(primaries).toHaveLength(0);
  });

  test('"Add stop" is reachable with no stops yet, and is named once', async () => {
    await render(<TripScreen />);
    expect(screen.getAllByLabelText('Add stop')).toHaveLength(1);
    await fireEvent.press(screen.getByTestId('trip-add-stop'));
    expect(screen.getByTestId('stop-editor')).toBeTruthy();
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
    // An alert the platform announces on appearance; it reads after the list, as before.
    expect(screen.getByTestId('trip-write-error').props.accessibilityRole).toBe('alert');
  });

  test('a successful write clears an earlier failure', async () => {
    mockStops.data = [rome, florence];
    mockActions.moveStop.mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    await render(<TripScreen />);

    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(screen.getByTestId('trip-write-error')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('stop-move-down-stop-rome'));
    expect(screen.queryByTestId('trip-write-error')).toBeNull();
  });

  test('is composed from the adapter layer only: no raised-surface primitive, no legacy text or status pill, no kit', () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    for (const module of [
      '@/app/trip/[id]/index',
      '@/components/trip/stop-row',
      '@/components/trip/stop-list',
    ]) {
      const source = readFileSync(require.resolve(module), 'utf8');
      expect(source).not.toMatch(/\bSurface\b|PressableSurface|ThemedText|ThemedView/);
      expect(source).not.toMatch(/components\/trip\/status-pill|StatusPill/);
      expect(source).not.toMatch(/from 'heroui-native'|from 'uniwind'/);
      expect(source).not.toMatch(/use-appearance|Colors\[/);
    }
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
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
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
    await fireEvent.press(screen.getByTestId('currency-other-toggle'));
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
