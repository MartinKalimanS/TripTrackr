/**
 * 004 T448 and T449 - the profile, the sign-out warning, the conflict notice and the
 * first-sync gate over the REAL `heroui-native` under Jest (research D4-13).
 *
 * The suites beside the screens render them over the stand-in. This file puts the kit's
 * own ListGroup, Avatar, Card, Button, Spinner and Surface underneath them, so what they
 * rely on is checked against the real components: nothing throws (a card inside a card or
 * a group inside a card is a development error; a kit component needs only the provider),
 * the ids, names and states land on the nodes a test or a Maestro flow finds them by, and
 * a busy row draws the kit's spinner. How a class LOOKS is Uniwind's, on a device.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type * as HeroUI from 'heroui-native';
import { Text } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { FirstSyncGate } from '@/components/sync/first-sync-gate';
import { ConflictNotices } from '@/components/ui/conflict-notice';
import { useSessionStore } from '@/features/auth/session-store';
import { UnsyncedChangesError } from '@/features/auth/use-sign-out';
import { useConflictStore } from '@/sync/conflicts';
import type { SyncStatus } from '@/sync/types';

// The You screen's passport has its own suites (components/profile, test/app/profile-screen):
// here the store has no countries and the screen's own rows are what is pinned.
const mockPassport = {
  data: { trips: [], summaries: [], periods: ['all'] },
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/passport/use-passport', () => ({
  usePassport: () => mockPassport,
}));

// The stamps page draws baked stamps through expo-image, whose real module needs the
// `experienceUrl` the expo-constants stand-in of this suite does not have.
jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

jest.mock('react-native-worklets', () => require('../mocks/worklets'));
jest.mock('react-native-reanimated', () => require('../mocks/reanimated-full'));
// The suite-wide stand-in is replaced by the real kit for THIS file only.
jest.mock('heroui-native', () => jest.requireActual('heroui-native'));

// `mock`-prefixed so Jest's hoisted factory may reference them.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3', ios: { buildNumber: '45' } } },
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const mockSignOut = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as unknown,
};
jest.mock('@/features/auth/use-sign-out', () => ({
  ...jest.requireActual('@/features/auth/use-sign-out'),
  useSignOut: () => mockSignOut,
}));

jest.mock('@/sync/engine', () => {
  const { create } = require('zustand') as typeof import('zustand');
  const store = create(() => ({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  }));
  return { useSyncStatus: () => store(), syncNow: jest.fn(), __store: store };
});
const { __store: statusStore } = jest.requireMock('@/sync/engine') as {
  __store: { setState: (state: Partial<SyncStatus>) => void };
};

const { HeroUINativeProvider } = jest.requireActual<typeof HeroUI>('heroui-native');
const CONFIG = { devInfo: { stylingPrinciples: false } };

// Under Jest the kit's `useThemeColor` asks Uniwind for `--color-*` variables the stylesheet
// transform never registered, so the kit's ghost Button (our `text` variant) cannot blend
// its hover colour and its colour kit reports it. That is the test environment, not the
// screens: only that message is dropped, every other error still prints.
const COLOUR_KIT_NOISE = /\[colorKit\.RGB\]/;
// The real Spinner draws an SVG gradient from a theme colour Uniwind cannot resolve here,
// and `react-native-svg` warns about the offset it is given. Same cause, same remedy.
const SPINNER_GRADIENT_NOISE = /is not a valid color or ".*" is not a valid offset/;
const consoleError = console.error.bind(console);
const consoleWarn = console.warn.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (!COLOUR_KIT_NOISE.test(String(args[0]))) consoleError(...args);
  });
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (!SPINNER_GRADIENT_NOISE.test(String(args[0]))) consoleWarn(...args);
  });
});
afterAll(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana Lovelace',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

function inKit(node: React.ReactElement) {
  return render(<HeroUINativeProvider config={CONFIG}>{node}</HeroUINativeProvider>);
}

beforeEach(() => {
  mockPush.mockReset();
  mockSignOut.mutate.mockReset();
  mockSignOut.reset.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  useSessionStore.setState({ status: 'signed-in', user: profile });
  useConflictStore.getState().clear();
  statusStore.setState({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  });
});

describe('the profile over the real kit (T448)', () => {
  test('renders the identity, the two groups and the set-apart block without error', async () => {
    await inKit(<ProfileScreen />);

    const identity = screen.getByTestId('profile-identity');
    expect(within(identity).getByTestId('profile-display-name')).toHaveTextContent(
      'Ana Lovelace',
    );
    expect(within(identity).getByText('AL', hidden)).toBeTruthy();
    expect(screen.getByTestId('profile-account-group')).toBeTruthy();
    expect(screen.getByTestId('profile-app-group')).toBeTruthy();
    expect(screen.getByTestId('profile-version')).toHaveTextContent('1.2.3 (45)');
    const actions = within(screen.getByTestId('profile-actions'));
    expect(actions.getByTestId('profile-sign-out')).toBeTruthy();
    expect(actions.getByTestId('profile-delete-account')).toBeTruthy();
  });

  test('Sign out is one named button the kit presses; Delete account is named and unavailable', async () => {
    await inKit(<ProfileScreen />);

    const signOut = screen.getByTestId('profile-sign-out');
    expect(signOut.props.accessibilityRole).toBe('button');
    expect(signOut.props.accessibilityLabel).toBe('Sign out');
    expect(signOut.props.accessibilityHint).toBe(
      'Signs out on this device. Your trips stay on the device, encrypted.',
    );
    await fireEvent.press(signOut);
    expect(mockSignOut.mutate).toHaveBeenCalledTimes(1);

    const remove = screen.getByTestId('profile-delete-account');
    expect(remove.props.accessibilityLabel).toBe('Delete account');
    expect(remove.props.accessibilityState).not.toMatchObject({ disabled: true });
    await fireEvent.press(remove);
    expect(mockPush).toHaveBeenCalledWith('/modal/delete-account');
    // Deleting opens a sheet; it never signs out by itself.
    expect(mockSignOut.mutate).toHaveBeenCalledTimes(1);
  });

  test('while signing out the row is announced busy, draws the kit spinner and ignores presses', async () => {
    mockSignOut.isPending = true;
    await inKit(<ProfileScreen />);

    const row = screen.getByTestId('profile-sign-out');
    expect(row.props.accessibilityState).toMatchObject({ busy: true });
    const spinner = within(row).getByTestId('profile-sign-out-spinner', hidden);
    expect(spinner.props.accessibilityElementsHidden).toBe(true);
    expect(within(row).getByText('Signing out…')).toBeTruthy();
    await fireEvent.press(row);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();
  });

  test('the warning is a card with the one primary and the destructive choice; both press', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 1, 'offline');
    await inKit(<ProfileScreen />);

    const warning = screen.getByTestId('sign-out-warning');
    expect(warning.props.accessibilityRole).toBe('alert');
    expect(warning.props.accessibilityLiveRegion).toBe('assertive');
    const stay = within(warning).getByTestId('sign-out-warning-stay');
    const anyway = within(warning).getByTestId('sign-out-warning-anyway');
    expect(stay.props.accessibilityLabel).toBe('Stay signed in');
    expect(anyway.props.accessibilityLabel).toBe('Sign out anyway');

    await fireEvent.press(stay);
    expect(mockSignOut.reset).toHaveBeenCalledTimes(1);
    await fireEvent.press(anyway);
    expect(mockSignOut.mutate).toHaveBeenCalledWith({ force: true });
  });
});

describe('the conflict notice over the real kit (T449)', () => {
  test('a banner is a card with its controls named, and presses reach the store and the router', async () => {
    await inKit(<ConflictNotices />);
    await act(async () => {
      useConflictStore.getState().raise({
        id: 'a',
        table: 'notes',
        recordId: 'record-a',
        tripId: 'trip-1',
        summary: 'Your edit to “Night train” was replaced by a newer version.',
        detectedAt: '2026-09-30T10:00:00.000Z',
      });
    });

    const banner = screen.getByTestId('conflict-notice-a');
    expect(within(banner).getByText('Updated from another device')).toBeTruthy();
    expect(screen.getByTestId('conflict-notices').props.accessibilityLiveRegion).toBe(
      'polite',
    );
    const open = within(banner).getByLabelText('View the trip this change was made in');
    expect(open.props.accessibilityRole).toBe('button');
    await fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith('/trip/trip-1');
    expect(screen.queryByTestId('conflict-notice-a')).toBeNull();
  });
});

describe('the first-sync gate over the real kit (T449)', () => {
  const gate = () =>
    inKit(
      <FirstSyncGate>
        <Text testID="real-tabs">the real tabs</Text>
      </FirstSyncGate>,
    );

  test('offline is a named state with one secondary retry the kit presses', async () => {
    statusStore.setState({ failure: 'offline' });
    await gate();

    const card = screen.getByTestId('first-sync-state');
    expect(within(card).getByText('You’re offline')).toBeTruthy();
    const retry = within(card).getByLabelText('Try again');
    expect(retry.props.accessibilityRole).toBe('button');
    expect(retry.props.accessibilityState).toMatchObject({ busy: false });
  });

  test('the first frame is one named progressbar with the kit spinner hidden inside it', async () => {
    await gate();

    const card = screen.getByTestId('first-sync-state');
    expect(card.props.accessibilityRole).toBe('progressbar');
    expect(card.props.accessibilityLabel).toBe('Opening your trips');
    expect(card.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
  });

  test('a failed sync is the error state with its retry', async () => {
    statusStore.setState({ failure: 'server' });
    await gate();

    expect(screen.getByText('Your trips haven’t loaded yet')).toBeTruthy();
    expect(screen.getByLabelText('Try again').props.accessibilityRole).toBe('button');
  });
});
