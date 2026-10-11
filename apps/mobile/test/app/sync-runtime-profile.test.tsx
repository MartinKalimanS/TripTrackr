/**
 * T137 — what the profile shows when the sign-out guard stops a sign-out
 * (Constitution V; sync-protocol.md §6 scenario 11).
 *
 * `useSignOut` is a double that the test steers; its own suite
 * (sync-runtime-sign-out.test.tsx) proves when it rejects. Pinned here: the
 * warning is explicit, says how many changes are not backed up and what
 * signing out means HERE (the encrypted per-account database stays, and syncs
 * on the next sign-in), offers exactly the two real choices — and every
 * pre-existing behaviour of the row (busy, error text) is unchanged.
 */
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useSessionStore } from '@/features/auth/session-store';
import { UnsyncedChangesError } from '@/features/auth/use-sign-out';
import { ApiRequestError } from '@/lib/api-client';

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

beforeEach(() => {
  mockSignOut.mutate.mockReset();
  mockSignOut.reset.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  useSessionStore.setState({ status: 'signed-in', user: profile });
});

describe('profile — sign-out guard warning (T137)', () => {
  test('shows no warning while nothing has stopped the sign-out', async () => {
    await render(<ProfileScreen />);

    expect(screen.queryByTestId('sign-out-warning')).toBeNull();
    expect(screen.queryByLabelText('Stay signed in')).toBeNull();
  });

  test('the row still signs out through a plain mutate()', async () => {
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByTestId('profile-sign-out'));

    expect(mockSignOut.mutate).toHaveBeenCalledWith();
  });

  test('says how many changes are not backed up, and why', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 1, 'offline');
    await render(<ProfileScreen />);

    const warning = screen.getByTestId('sign-out-warning');
    expect(warning).toBeTruthy();
    expect(screen.getByText('Not everything is backed up yet')).toBeTruthy();
    expect(
      screen.getByText(/3 changes on this device haven’t reached your account yet\./),
    ).toBeTruthy();
    expect(screen.getByText(/You’re offline right now/)).toBeTruthy();
  });

  test('uses the singular for one change', async () => {
    mockSignOut.error = new UnsyncedChangesError(1, 0, null);
    await render(<ProfileScreen />);

    expect(
      screen.getByText(/1 change on this device hasn’t reached your account yet\./),
    ).toBeTruthy();
    expect(screen.getByText(/They haven’t finished sending yet\./)).toBeTruthy();
  });

  test('a server failure is told as that, not as the traveller being offline', async () => {
    mockSignOut.error = new UnsyncedChangesError(1, 0, 'server');
    await render(<ProfileScreen />);

    expect(screen.getByText(/We couldn’t reach the server just now/)).toBeTruthy();
    expect(screen.queryByText(/You’re offline/)).toBeNull();
  });

  test('says what signing out means here, without overpromising or alarming', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);

    // Accurate to db/client.ts: the per-account database stays, encrypted,
    // and syncs when the traveller signs back in.
    expect(screen.getByText(/stay on this device, encrypted/)).toBeTruthy();
    expect(screen.getByText(/sync when you sign back in/)).toBeTruthy();
    expect(screen.getByText(/exist only on this device/)).toBeTruthy();
    // Nothing is called lost, deleted or gone: it is not.
    expect(screen.queryByText(/lost|deleted|gone|erase/i)).toBeNull();
  });

  test('offers exactly two real choices, safest first', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);

    const stay = screen.getByLabelText('Stay signed in');
    const anyway = screen.getByLabelText('Sign out anyway');
    expect(stay).toBeTruthy();
    expect(anyway).toBeTruthy();
    expect(screen.getByTestId('sign-out-warning-stay')).toBeTruthy();
    expect(screen.getByTestId('sign-out-warning-anyway')).toBeTruthy();
  });

  test('"Stay signed in" dismisses the warning and signs nothing out', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByLabelText('Stay signed in'));

    expect(mockSignOut.reset).toHaveBeenCalledTimes(1);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();
  });

  test('"Sign out anyway" signs out on the traveller’s say-so, and only then', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Sign out anyway'));

    expect(mockSignOut.mutate).toHaveBeenCalledTimes(1);
    expect(mockSignOut.mutate).toHaveBeenCalledWith({ force: true });
  });

  test('is announced as an alert, not left for a screen reader to find', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);

    const warning = screen.getByTestId('sign-out-warning');
    expect(warning.props.accessibilityRole).toBe('alert');
    expect(warning.props.accessibilityLiveRegion).toBe('assertive');
  });

  test('on iOS, where live regions do not exist, it is announced out loud', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    try {
      mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
      await render(<ProfileScreen />);

      expect(announce).toHaveBeenCalledWith(
        expect.stringContaining('Not everything is backed up yet'),
      );
    } finally {
      announce.mockRestore();
      os.restore();
    }
  });

  test('the warning text is never truncated, so it survives a large text size', async () => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
    await render(<ProfileScreen />);

    for (const text of [
      screen.getByText('Not everything is backed up yet'),
      screen.getByText(/haven’t reached your account yet/),
      screen.getByText(/stay on this device, encrypted/),
    ]) {
      expect(text.props.numberOfLines).toBeUndefined();
    }
  });
});

describe('profile — the existing sign-out states are untouched', () => {
  test('marks the row busy while signing out, with its label', async () => {
    mockSignOut.isPending = true;
    await render(<ProfileScreen />);

    expect(screen.getByTestId('profile-sign-out').props.accessibilityState).toMatchObject(
      {
        busy: true,
      },
    );
    expect(screen.getByText('Signing out…')).toBeTruthy();
  });

  test('any other failure still shows its sentence, and not the warning', async () => {
    mockSignOut.error = new ApiRequestError(0, { code: 'NETWORK', message: 'No' });
    await render(<ProfileScreen />);

    expect(
      screen.getByText('You seem to be offline. Check your connection and try again.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('sign-out-warning')).toBeNull();
  });

  test('an unknown failure shows the generic sentence', async () => {
    mockSignOut.error = new Error('database is locked');
    await render(<ProfileScreen />);

    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByText('database is locked')).toBeNull();
  });
});

describe('profile — the warning on the Atlas primitives (T448; FR-005, FR-016, FR-025, FR-030)', () => {
  beforeEach(() => {
    mockSignOut.error = new UnsyncedChangesError(2, 0, 'offline');
  });

  test('sits directly under the Sign out row that raised it and above Delete account, as it always followed it', async () => {
    await render(<ProfileScreen />);

    const ids = screen
      .getAllByTestId(/^(profile-sign-out|sign-out-warning|profile-delete-account)$/)
      .map((node) => node.props.testID);
    expect(ids).toEqual([
      'profile-sign-out',
      'sign-out-warning',
      'profile-delete-account',
    ]);
    expect(
      within(screen.getByTestId('profile-actions')).getByTestId('sign-out-warning'),
    ).toBeTruthy();
  });

  test('"Stay signed in" is the one primary control and comes first; "Sign out anyway" is the destructive one', async () => {
    await render(<ProfileScreen />);

    const stay = screen.getByTestId('sign-out-warning-stay');
    const anyway = screen.getByTestId('sign-out-warning-anyway');
    expect(stay.props.variant).toBe('primary');
    // The kit's name for the destructive variant (button.tsx KIT_VARIANT).
    expect(anyway.props.variant).toBe('danger-soft');
    expect(
      screen.getAllByRole('button').filter((node) => node.props.variant === 'primary'),
    ).toEqual([stay]);
    const buttons = screen
      .getAllByRole('button')
      .map((node) => node.props.testID)
      .filter((id) => String(id).startsWith('sign-out-warning-'));
    expect(buttons).toEqual(['sign-out-warning-stay', 'sign-out-warning-anyway']);
  });

  test('keeps the names and the hint of the two choices exactly', async () => {
    await render(<ProfileScreen />);

    expect(screen.getByTestId('sign-out-warning-stay').props.accessibilityLabel).toBe(
      'Stay signed in',
    );
    expect(
      screen.getByTestId('sign-out-warning-stay').props.accessibilityHint,
    ).toBeUndefined();
    expect(screen.getByTestId('sign-out-warning-anyway').props.accessibilityLabel).toBe(
      'Sign out anyway',
    );
    expect(screen.getByTestId('sign-out-warning-anyway').props.accessibilityHint).toBe(
      'Signs out now. The changes stay on this device and sync when you sign back in.',
    );
  });

  test('the destructive choice is words and an icon, not colour alone', async () => {
    await render(<ProfileScreen />);

    const anyway = screen.getByTestId('sign-out-warning-anyway');
    expect(
      within(anyway).getByTestId('sign-out-warning-anyway-icon', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    expect(within(anyway).getByText('Sign out anyway')).toBeTruthy();
  });

  test('says what is wrong with a caution icon beside the title, which assistive technology skips', async () => {
    await render(<ProfileScreen />);

    const warning = screen.getByTestId('sign-out-warning');
    const icon = within(warning).getByTestId('sign-out-warning-icon', {
      includeHiddenElements: true,
    });
    expect(icon.props.accessibilityElementsHidden).toBe(true);
    expect(within(warning).getByText('Not everything is backed up yet')).toBeTruthy();
  });

  test('the title is announced as part of the alert, not as a heading of the screen', async () => {
    await render(<ProfileScreen />);

    expect(
      screen.getByText('Not everything is backed up yet').props.accessibilityRole,
    ).not.toBe('header');
  });

  test('no other state shows a primary control on the profile', async () => {
    mockSignOut.error = null;
    await render(<ProfileScreen />);

    expect(
      screen.getAllByRole('button').filter((node) => node.props.variant === 'primary'),
    ).toHaveLength(0);
  });

  test('the "Stay signed in" choice is not busy while a sign-out is pending: the row is', async () => {
    mockSignOut.error = null;
    mockSignOut.isPending = true;
    await render(<ProfileScreen />);

    expect(screen.queryByTestId('sign-out-warning')).toBeNull();
    expect(screen.getByTestId('profile-sign-out').props.accessibilityState).toMatchObject(
      {
        busy: true,
      },
    );
  });

  test('any other failure is an alert with its own id under the row (InlineError: words, danger ink and an icon)', async () => {
    mockSignOut.error = new ApiRequestError(0, { code: 'NETWORK', message: 'No' });
    await render(<ProfileScreen />);

    const error = screen.getByTestId('profile-sign-out-error');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(
      within(error).getByText(
        'You seem to be offline. Check your connection and try again.',
      ),
    ).toBeTruthy();
  });

  test('is built on the Atlas primitives: none of the retired ones, and no kit import', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(
        require.resolve('@/components/auth/sign-out-warning'),
        'utf8',
      ) as string;
    expect(source).not.toMatch(
      /from '@\/components\/(themed-text|themed-view|ui\/surface|ui\/pressable-surface)'/,
    );
    expect(source).not.toMatch(/from 'heroui-native|from 'uniwind/);
  });
});
