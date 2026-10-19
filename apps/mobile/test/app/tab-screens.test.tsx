/**
 * The `(tabs)` screens: trips (T066), profile (T065). The Home (the globe, T099, recomposed by
 * T537) is `test/app/home-screen.test.tsx`.
 *
 * The live-query hooks are mocked; their own suites run them against a real
 * database, and the globe itself has its own suite
 * (src/components/globe/__tests__/globe-view.test.tsx). What is pinned here
 * is presentation: every state is designed (FR-027), the status is text + icon
 * (FR-010/FR-013), a locally written trip carries the pending marker, and the
 * profile can sign out.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import TripsScreen from '@/app/(tabs)/trips';
import { useSessionStore } from '@/features/auth/session-store';
import type { TripCardModel } from '@/features/trips/trip-card-model';

import { cardModel } from '../helpers/trip-card-fixture';

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

const mockTrips: { data: TripCardModel[]; loading: boolean; error: Error | null } = {
  data: [],
  loading: false,
  error: null,
};

jest.mock('@/features/trips/use-trips', () => ({
  useTrips: () => mockTrips,
}));

// The tab bar's zone comes from React Navigation through expo-router/js-tabs, which loads the
// whole router and needs the real expo-constants this suite replaces: no bar here, no zone.
jest.mock('@/components/trip/use-tab-zone', () => ({ useTabZone: () => 0 }));

// The sync chip and banner of the Trips screen have their own suites (use-trips-sync).
jest.mock('@/features/trips/use-trips-sync', () => ({
  useTripsSync: () => ({ chip: { kind: 'synced' }, banner: null, retry: jest.fn() }),
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
  overrides: {
    id?: string;
    title?: string;
    is_dirty?: boolean;
    stopCount?: number;
    status?: TripCardModel['status'];
  } = {},
): TripCardModel {
  const { id = 'trip-1', title = 'Italy, spring 2026', stopCount = 0 } = overrides;
  const { status = 'planning', is_dirty: pending = true } = overrides;
  return cardModel({
    id,
    title,
    status,
    stopCount,
    pending,
    dayOf: status === 'active' ? { day: 3, of: 8 } : null,
    daysToGo: status === 'planning' ? 94 : null,
  });
}

beforeEach(() => {
  mockConstants.expoConfig = { version: '1.2.3', ios: { buildNumber: '45' } };
  mockTrips.data = [];
  mockTrips.loading = false;
  mockTrips.error = null;
  mockPush.mockReset();
  mockNavigate.mockReset();
  mockSignOut.mutate.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  useSessionStore.setState({ status: 'signed-in', user: profile });
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
    // An active trip is the hero, a planned one the ticket: each says its status in a chip.
    expect(screen.getByLabelText('Status: Planning')).toBeTruthy();
    expect(screen.getByLabelText('Status: Active, day 3 of 8')).toBeTruthy();
    // A past trip is a row, and says so (and its stops) in its name.
    expect(screen.getByLabelText('Old trip, past, No stops yet')).toBeTruthy();
    expect(screen.getByLabelText('Lisbon weekend, active, 1 stop')).toBeTruthy();
    expect(screen.getByLabelText('Italy, spring 2026, planning, 2 stops')).toBeTruthy();
    // Only the planned trip is dirty (the default), so exactly one pending marker.
    expect(
      screen.getAllByLabelText('Sync pending', { includeHiddenElements: true }),
    ).toHaveLength(1);
  });

  test('opens a trip when its card is pressed', async () => {
    mockTrips.data = [summary({ id: 'trip-42' })];
    await render(<TripsScreen />);
    await fireEvent.press(screen.getByTestId('trip-card-trip-42'));
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-42');
  });
});

const hidden = { includeHiddenElements: true };
const classesOf = (node: { props: { className?: unknown } }) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);

describe('<ProfileScreen> (T065, restyled by T448; FR-016)', () => {
  test('shows who is signed in', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Ana');
    expect(screen.getByTestId('profile-email')).toHaveTextContent('ana@example.com');
  });

  test('puts the traveller beside an avatar of their initials, which AT skips because the name is written beside it', async () => {
    await render(<ProfileScreen />);
    const identity = screen.getByTestId('profile-identity');
    expect(within(identity).getByTestId('profile-display-name')).toBeTruthy();
    expect(within(identity).getByTestId('profile-email')).toBeTruthy();
    // The initials of "Ana", in the avatar, hidden from assistive technology (decorative).
    expect(screen.queryByText('A')).toBeNull();
    const initials = screen.getByText('A', hidden);
    let node: typeof initials | null = initials;
    while (node && node.props.accessibilityElementsHidden !== true) node = node.parent;
    expect(node).not.toBeNull();
    expect(node?.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('a long name and email wrap in full rather than being cut off (FR-029)', async () => {
    await render(<ProfileScreen />);
    for (const id of ['profile-display-name', 'profile-email']) {
      expect(screen.getByTestId(id).props.numberOfLines).toBeUndefined();
    }
  });

  test('the name is not announced as a heading: the native header is the title (FR-030)', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByTestId('profile-display-name').props.accessibilityRole).not.toBe(
      'header',
    );
  });

  test('says the home currency as one phrase, as it always did, in a grouped Account row', async () => {
    await render(<ProfileScreen />);
    const account = screen.getByTestId('profile-account-group');
    expect(within(account).getByLabelText('Home currency: EUR')).toBeTruthy();
    expect(within(account).getByText('EUR', hidden)).toBeTruthy();
  });

  test('groups the account and the app under their own headings', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByText('Account').props.accessibilityRole).toBe('header');
    expect(screen.getByText('App').props.accessibilityRole).toBe('header');
    const app = screen.getByTestId('profile-app-group');
    expect(within(app).getByText('Version')).toBeTruthy();
    expect(within(app).getByTestId('profile-version')).toBeTruthy();
  });

  test('shows the app version from the embedded config', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByText(/1\.2\.3/)).toBeTruthy();
    expect(screen.getByText(/\(45\)/)).toBeTruthy();
  });

  test('is a screen under the native header: the large title collapses over its scroller (props asserted; the collapse is a device check, T408)', async () => {
    await render(<ProfileScreen />);
    const root = screen.toJSON() as {
      props: Record<string, unknown>;
      children: { type: string; props: Record<string, unknown> }[];
    };
    expect(root.props.testID).toBe('profile-screen');
    expect(root.children[0].type).toBe('RCTScrollView');
    expect(root.children[0].props.contentInsetAdjustmentBehavior).toBe('automatic');
    // No title of its own any more: that is the header's (profile/_layout.tsx), "You".
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.queryByText('You')).toBeNull();
  });

  test('sets Sign out and Delete account apart: after the groups, in a block of their own, not in either group', async () => {
    await render(<ProfileScreen />);
    const actions = screen.getByTestId('profile-actions');
    expect(within(actions).getByTestId('profile-sign-out')).toBeTruthy();
    expect(within(actions).getByTestId('profile-delete-account')).toBeTruthy();
    for (const group of ['profile-account-group', 'profile-app-group']) {
      const inside = within(screen.getByTestId(group));
      expect(inside.queryByTestId('profile-sign-out')).toBeNull();
      expect(inside.queryByTestId('profile-delete-account')).toBeNull();
    }
    // Reading order: identity, account, app, then the set-apart block.
    const order = screen
      .getAllByTestId(/^profile-(identity|account-group|app-group|actions)$/)
      .map((node) => node.props.testID);
    expect(order).toEqual([
      'profile-identity',
      'profile-account-group',
      'profile-app-group',
      'profile-actions',
    ]);
  });

  test('both are destructive by words, an icon and the danger ink, never colour alone (FR-025)', async () => {
    await render(<ProfileScreen />);
    for (const [row, title] of [
      ['profile-sign-out', 'Sign out'],
      ['profile-delete-account', 'Delete account'],
    ] as const) {
      expect(classesOf(screen.getByText(title))).toContain('text-danger');
      expect(
        within(screen.getByTestId(row)).getByTestId(`${row}-icon`, hidden),
      ).toBeTruthy();
    }
    // The icons are decorative: the words are the label.
    expect(screen.queryByTestId('profile-sign-out-icon')).toBeNull();
    expect(screen.queryByTestId('profile-delete-account-icon')).toBeNull();
  });

  test('says in words what signing out does here (the hint says it to a screen reader)', async () => {
    await render(<ProfileScreen />);
    expect(
      screen.getByText('Your trips are kept on this device, encrypted.'),
    ).toBeTruthy();
    expect(screen.getByTestId('profile-sign-out').props.accessibilityHint).toBe(
      'Signs out on this device. Your trips stay on the device, encrypted.',
    );
  });

  test('has no primary control: every control is a row, so the one-primary rule holds (FR-005)', async () => {
    await render(<ProfileScreen />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getAllByRole('button').filter((node) => node.props.variant === 'primary'),
    ).toHaveLength(0);
  });

  test('signs out through the mutation (FR-004) and marks the row busy while it runs', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockSignOut.mutate).toHaveBeenCalled();
    expect(screen.getByLabelText('Sign out')).toBe(
      screen.getByTestId('profile-sign-out'),
    );

    mockSignOut.isPending = true;
    await render(<ProfileScreen />);
    const busy = screen.getAllByTestId('profile-sign-out').at(-1);
    expect(busy?.props.accessibilityState).toMatchObject({ busy: true });
    expect(busy?.props.accessibilityLabel).toBe('Sign out');
    expect(screen.getByText('Signing out…')).toBeTruthy();
    mockSignOut.mutate.mockReset();
    await fireEvent.press(busy!);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();
  });

  test('presents the account-deletion entry point the stores require, disabled until wired', async () => {
    // App Store Review 5.1.1(v) and Google Play's account-deletion policy both
    // require in-app deletion to be discoverable. It is visible now and inert
    // until T188 lands `DELETE /me`; hiding it until then would risk shipping
    // a build without it.
    await render(<ProfileScreen />);
    const row = screen.getByLabelText('Delete account');
    expect(row).toBe(screen.getByTestId('profile-delete-account'));
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(row.props.accessibilityHint).toBe(
      'Permanently removes your account and everything you recorded',
    );
    expect(screen.getByText('Coming soon')).toBeTruthy();
    await fireEvent.press(row);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();
  });

  test('renders without a traveller card if the session has no profile (defensive)', async () => {
    useSessionStore.setState({ status: 'signed-in', user: null });
    await render(<ProfileScreen />);
    expect(screen.queryByTestId('profile-display-name')).toBeNull();
    expect(screen.queryByTestId('profile-identity')).toBeNull();
    expect(screen.queryByTestId('profile-account-group')).toBeNull();
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByTestId('profile-sign-out')).toBeTruthy();
  });

  test('is built on the Atlas primitives: none of the retired ones, and no kit import (T448)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/(tabs)/profile'), 'utf8') as string;
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
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
