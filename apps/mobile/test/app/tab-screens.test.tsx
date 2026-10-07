/**
 * The `(tabs)` screens: home (the globe, T099), trips (T066), profile (T065).
 *
 * The live-query hooks are mocked; their own suites run them against a real
 * database, and the globe itself has its own suite
 * (src/components/globe/__tests__/globe-view.test.tsx). What is pinned here
 * is presentation: every state is designed (FR-027), the status is text + icon
 * (FR-010/FR-013), a locally written trip carries the pending marker, and the
 * profile can sign out.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import TripsScreen from '@/app/(tabs)/trips';
import { useSessionStore } from '@/features/auth/session-store';
import type { GlobeTrip } from '@/features/globe/globe-data';
import type { GlobeData } from '@/features/globe/use-globe';
import type { TripSummary } from '@/features/trips/use-trips';

// `mock`-prefixed so Jest's hoisted factory may reference it.
const mockPush = jest.fn();
const mockNavigate = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => ({
      push: mockPush,
      navigate: mockNavigate,
      back: jest.fn(),
      replace: jest.fn(),
    }),
    // The trips header is the navigator's: this draws its `headerRight` where a screen
    // would put it, so a test finds the iOS "Plan a trip" action by its id.
    Stack: {
      Screen: ({
        options,
      }: {
        options?: { headerRight?: (props: Record<string, unknown>) => React.ReactNode };
      }) =>
        React.createElement(
          React.Fragment,
          null,
          options?.headerRight?.({ tintColor: 'tint', canGoBack: false }),
        ),
    },
  };
});

// The trip card's cover draws a thumbnail through expo-image, whose real module needs
// the `experienceUrl` the expo-constants stand-in below does not have.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

const mockGlobe: { data: GlobeData; loading: boolean; error: Error | null } = {
  data: { trips: [], focus: [], summary: { countriesVisited: 0, distanceKm: 0 } },
  loading: false,
  error: null,
};

jest.mock('@/features/globe/use-globe', () => ({
  useGlobe: () => mockGlobe,
}));

// The map is native; its own suite asserts what it hands Mapbox. Here it is a
// marker carrying the props the screen chose.
jest.mock('@/components/globe/globe-view', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    GlobeView: (props: Record<string, unknown>) =>
      React.createElement(View, { testID: 'globe-view', ...props }),
  };
});

// A mutable stand-in so one suite can cover both an embedded config and its
// absence without `jest.resetModules()`, which would load a second React and
// break every hook.
const mockConstants: { expoConfig: Record<string, unknown> | null } = {
  expoConfig: { version: '1.2.3', ios: { buildNumber: '45' } },
};

jest.mock('expo-constants', () => ({
  __esModule: true,
  // A getter: the factory is hoisted above `mockConstants` and runs on first
  // import, so a plain property would capture `undefined`.
  get default() {
    return mockConstants;
  },
}));

// The state views and `FormActions` press through the Atlas `Button`, which plays haptics
// (`use-haptics`). The real `expo-haptics` loads `expo`, whose asset module reads
// `expo-constants`' `experienceUrl` at import time, and the stand-in above has none: this
// suite never asserts a haptic, so it takes the same stub as `use-haptics.test.ts`.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const mockTrips: { data: TripSummary[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrips: () => mockTrips,
}));

const mockSignOut = { mutate: jest.fn(), isPending: false, error: null as unknown };

// The hook now lives in use-sign-out.ts (T137); its guard predicate stays real.
jest.mock('@/features/auth/use-sign-out', () => ({
  ...jest.requireActual('@/features/auth/use-sign-out'),
  useSignOut: () => mockSignOut,
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

function summary(
  overrides: Partial<TripSummary['trip']> & {
    stopCount?: number;
    status?: TripSummary['status'];
  } = {},
): TripSummary {
  const { stopCount = 0, status = 'planning', ...trip } = overrides;
  return {
    trip: {
      id: 'trip-1',
      title: 'Italy, spring 2026',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'planning',
      created_at: '2026-09-01T10:00:00.000Z',
      updated_at: '2026-09-01T10:00:00.000Z',
      deleted_at: null,
      is_dirty: true,
      synced_at: null,
      ...trip,
    },
    stopCount,
    status,
    cover: { kind: 'typographic', initial: 'I', status },
    dateRange: null,
  };
}

function globeTrip(id: string, placed: boolean): GlobeTrip {
  return {
    id,
    title: id,
    status: 'active',
    stops: [
      {
        id: `${id}-stop`,
        cityId: 1,
        countryId: placed ? 39 : null,
        arriveDate: '2026-05-10',
        departDate: '2026-05-12',
        coordinate: placed ? [12.4964, 41.9028] : null,
      },
    ],
  };
}

beforeEach(() => {
  mockConstants.expoConfig = { version: '1.2.3', ios: { buildNumber: '45' } };
  mockTrips.data = [];
  mockTrips.loading = false;
  mockTrips.error = null;
  mockGlobe.data = {
    trips: [],
    focus: [],
    summary: { countriesVisited: 0, distanceKm: 0 },
  };
  mockGlobe.loading = false;
  mockGlobe.error = null;
  mockPush.mockReset();
  mockNavigate.mockReset();
  mockSignOut.mutate.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('<HomeScreen> — the globe (T099, FR-045, FR-051)', () => {
  test('shows a designed loading state while the store has not answered (FR-027)', async () => {
    mockGlobe.loading = true;
    await render(<HomeScreen />);
    expect(screen.getByLabelText('Loading your globe')).toBeTruthy();
    expect(screen.queryByTestId('globe-view')).toBeNull();
  });

  test('the loading state is one announced progressbar on the `home-screen` scaffold (T428)', async () => {
    mockGlobe.loading = true;
    await render(<HomeScreen />);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Loading your globe' })).toBeTruthy();
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    expect(screen.queryByTestId('globe-notice')).toBeNull();
  });

  test('shows the globe with a plain-words notice over it, never the raw error (feature 003 FR-005)', async () => {
    mockGlobe.error = new Error('database is locked');
    await render(<HomeScreen />);
    expect(screen.getByTestId('globe-view')).toBeTruthy();
    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
  });

  test('the notice over the globe is an alert and the screen keeps its `home-screen` id (T428)', async () => {
    mockGlobe.error = new Error('database is locked');
    await render(<HomeScreen />);
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByTestId('globe-notice').props.accessibilityRole).toBe('alert');
    expect(screen.queryByTestId('globe-stats')).toBeNull();
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
  });

  test('with no trips, the globe is still there and one card invites the first trip (feature 003 FR-001, FR-002)', async () => {
    await render(<HomeScreen />);
    expect(screen.getByTestId('globe-view')).toBeTruthy();
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
    // Nothing to count yet: the statistics wait for the first stop.
    expect(screen.queryByTestId('globe-stats')).toBeNull();
    // One primary control per state (FR-005, C4-10 rule 3).
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Plan a trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('hands the empty globe an announcement that does not claim trips it is not showing', async () => {
    await render(<HomeScreen />);
    expect(screen.getByTestId('globe-view').props.accessibilityLabel).toBe(
      'Globe with nothing drawn yet. Your trips are listed in the Trips tab.',
    );
  });

  test('with one trip and no stop, the card opens that trip to add the first stop', async () => {
    mockGlobe.data = { ...mockGlobe.data, trips: [globeTrip('no-city-yet', false)] };
    await render(<HomeScreen />);
    expect(screen.getByTestId('globe-view')).toBeTruthy();
    expect(screen.getByText('Your trip needs a first stop')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-add-stop'));
    expect(mockPush).toHaveBeenCalledWith('/trip/no-city-yet');
  });

  test('with several trips and no stop, the card opens the trip list', async () => {
    mockGlobe.data = {
      ...mockGlobe.data,
      trips: [globeTrip('one', false), globeTrip('two', false)],
    };
    await render(<HomeScreen />);
    expect(screen.getByTestId('globe-view')).toBeTruthy();
    expect(screen.getByText('Your trips need a first stop')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('home-open-trips'));
    expect(mockNavigate).toHaveBeenCalledWith('/trips');
  });

  test('with something to place, is the globe with its statistics and no invitation (FR-045, FR-050)', async () => {
    const trips = [globeTrip('italy', true), globeTrip('elsewhere', false)];
    mockGlobe.data = {
      trips,
      focus: ['italy'],
      summary: { countriesVisited: 1, distanceKm: 230.9 },
    };
    await render(<HomeScreen />);

    const globe = screen.getByTestId('globe-view');
    expect(globe.props.trips).toBe(trips);
    expect(globe.props.focus).toEqual(['italy']);
    // The same calendar day the statuses were derived with (useGlobe(today)).
    expect(globe.props.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(globe.props.accessibilityLabel).toBe(
      'Globe showing 2 trips across 1 country. Every trip is also listed in the Trips tab.',
    );
    expect(screen.getByTestId('globe-stat-countries')).toHaveTextContent('1');
    expect(screen.getByTestId('globe-stat-distance')).toHaveTextContent('231 km');
    expect(screen.queryByTestId('globe-empty-state')).toBeNull();
    // The statistics are a summary, not a control: nothing to press over the globe.
    expect(screen.getByTestId('globe-stats').props.accessibilityRole).toBe('summary');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('is built on the Atlas scaffolds: none of the retired primitives (T428)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/(tabs)/index'), 'utf8') as string;
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
  });
});

describe('<TripsScreen> — the local trip list (T066)', () => {
  test('shows a designed loading state while the store has not answered (FR-027)', async () => {
    mockTrips.loading = true;
    await render(<TripsScreen />);
    expect(screen.getByLabelText('Loading trips')).toBeTruthy();
  });

  test('shows a designed empty state and keeps "Plan a trip" reachable', async () => {
    await render(<TripsScreen />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trips-plan-trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');

    // The empty state names the same next step with an action of its own (a distinct id).
    mockPush.mockReset();
    await fireEvent.press(screen.getByTestId('trips-empty-plan-trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('shows a designed error state when the store fails', async () => {
    mockTrips.error = new Error('database is locked');
    await render(<TripsScreen />);
    expect(screen.getByText('Couldn’t read your trips')).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
  });

  test('lists each trip with title, status as text + icon, stop count, and a pending marker while dirty', async () => {
    mockTrips.data = [
      summary({ id: 'a', title: 'Italy, spring 2026', stopCount: 2, status: 'planning' }),
      summary({
        id: 'b',
        title: 'Lisbon weekend',
        stopCount: 1,
        status: 'active',
        is_dirty: false,
      }),
      summary({
        id: 'c',
        title: 'Old trip',
        stopCount: 0,
        status: 'past',
        is_dirty: false,
      }),
    ];
    await render(<TripsScreen />);

    expect(screen.getByTestId('trips-list')).toBeTruthy();
    expect(screen.getByText('Italy, spring 2026')).toBeTruthy();
    expect(screen.getByText('2 stops · EUR')).toBeTruthy();
    expect(screen.getByText('1 stop · EUR')).toBeTruthy();
    expect(screen.getByText('No stops yet · EUR')).toBeTruthy();
    expect(screen.getByLabelText('Status: Planning')).toBeTruthy();
    expect(screen.getByLabelText('Status: Active')).toBeTruthy();
    expect(screen.getByLabelText('Status: Past')).toBeTruthy();
    // Exactly one row is dirty, so exactly one pending badge.
    expect(screen.getAllByLabelText('Sync pending')).toHaveLength(1);
  });

  test('opens a trip when its card is pressed', async () => {
    mockTrips.data = [summary({ id: 'trip-42' })];
    await render(<TripsScreen />);
    await fireEvent.press(screen.getByTestId('trip-card-trip-42'));
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42');
  });
});

describe('<ProfileScreen>', () => {
  test('shows who is signed in', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Ana');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ana@example.com');
    expect(screen.getByText('Home currency: EUR')).toBeTruthy();
  });

  test('shows the app version from the embedded config', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByText(/1\.2\.3/)).toBeTruthy();
    expect(screen.getByText(/\(45\)/)).toBeTruthy();
  });

  test('signs out through the mutation (FR-004) and marks the row busy while it runs', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockSignOut.mutate).toHaveBeenCalled();

    mockSignOut.isPending = true;
    await render(<ProfileScreen />);
    expect(
      screen.getAllByTestId('profile-sign-out').at(-1)?.props.accessibilityState,
    ).toMatchObject({
      busy: true,
    });
  });

  test('presents the account-deletion entry point the stores require, disabled until wired', async () => {
    // App Store Review 5.1.1(v) and Google Play's account-deletion policy both
    // require in-app deletion to be discoverable. It is visible now and inert
    // until T188 lands `DELETE /me`; hiding it until then would risk shipping
    // a build without it.
    await render(<ProfileScreen />);
    const row = screen.getByLabelText('Delete account');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
  });

  test('renders without a traveller card if the session has no profile (defensive)', async () => {
    useSessionStore.setState({ status: 'signed-in', user: null });
    await render(<ProfileScreen />);
    expect(screen.queryByTestId('profile-display-name')).toBeNull();
    expect(screen.getByText('Version')).toBeTruthy();
  });
});

describe('profile without an embedded config', () => {
  test('does not crash when expo-constants has no expoConfig (dev client, Expo Go)', async () => {
    mockConstants.expoConfig = null;

    await render(<ProfileScreen />);
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByTestId('profile-version').props.children).toBe('unknown');
  });

  test('omits the build number when the config carries none (remote versioning)', async () => {
    mockConstants.expoConfig = { version: '1.2.3' };

    await render(<ProfileScreen />);
    expect(screen.getByTestId('profile-version').props.children).toBe('1.2.3');
  });
});
