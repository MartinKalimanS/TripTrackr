/**
 * R009 — the `(tabs)` placeholders: home, trips, profile.
 *
 * The home tab becomes the Mapbox globe in US3 (T093) and the trip list lands
 * with US1 (T066). Until then each tab is a designed empty state (FR-027) with
 * its primary action reachable — so the navigation tree can be exercised end to
 * end on a device before any product data exists.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/(tabs)/index';
import ProfileScreen from '@/app/(tabs)/profile';
import TripsScreen from '@/app/(tabs)/trips';

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

beforeEach(() => {
  mockConstants.expoConfig = { version: '1.2.3', ios: { buildNumber: '45' } };
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

describe('<TripsScreen> — list placeholder', () => {
  test('shows a designed empty state (FR-027)', async () => {
    await render(<TripsScreen />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
  });

  test('offers the same primary action as the globe, so a traveller is never stuck', async () => {
    await render(<TripsScreen />);
    await fireEvent.press(screen.getByLabelText('Plan a trip'));
    expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
  });
});

describe('<ProfileScreen>', () => {
  test('shows the app version from the embedded config', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByText(/1\.2\.3/)).toBeTruthy();
    expect(screen.getByText(/\(45\)/)).toBeTruthy();
  });

  test('presents the account-deletion entry point the stores require, disabled until wired', async () => {
    // App Store Review 5.1.1(v) and Google Play's account-deletion policy both
    // require in-app deletion to be discoverable. It is visible now and inert
    // until T188 lands `DELETE /me`; hiding it until then would risk shipping
    // a build without it.
    await render(<ProfileScreen />);
    const row = screen.getByLabelText('Delete account');
    expect(row.props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText(/Delete account/)).toBeTruthy();
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
