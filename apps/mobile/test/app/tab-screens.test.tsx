/**
 * The `(tabs)` screens: home (globe placeholder), trips (T066), profile (T065).
 *
 * The live-query hooks are mocked; their own suite runs them against a real
 * database. What is pinned here is presentation: every state is designed
 * (FR-027), the status is text + icon (FR-010/FR-013), a locally written trip
 * carries the pending marker, and the profile can sign out.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import TripsScreen from '@/app/(tabs)/trips';
import { useSessionStore } from '@/features/auth/session-store';
import type { TripSummary } from '@/features/trips/use-trips';

// `mock`-prefixed so Jest's hoisted factory may reference it.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

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

const mockTrips: { data: TripSummary[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrips: () => mockTrips,
}));

const mockSignOut = { mutate: jest.fn(), isPending: false, error: null as unknown };

jest.mock('@/features/auth/use-session', () => ({
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
  };
}

beforeEach(() => {
  mockConstants.expoConfig = { version: '1.2.3', ios: { buildNumber: '45' } };
  mockTrips.data = [];
  mockTrips.loading = false;
  mockTrips.error = null;
  mockSignOut.mutate.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('<HomeScreen> — globe placeholder', () => {
  test('shows a designed empty state rather than a blank canvas (FR-027)', async () => {
    await render(<HomeScreen />);
    expect(screen.getByText('Your globe is waiting for its first trip')).toBeTruthy();
  });

  test('offers "Plan a trip" and opens the add-trip modal', async () => {
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByLabelText('Plan a trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });

  test('does not mount a MapView yet — the globe arrives in US3 (T093)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/(tabs)/index'), 'utf8') as string;
    expect(source).not.toMatch(/@rnmapbox\/maps|MapView/);
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
