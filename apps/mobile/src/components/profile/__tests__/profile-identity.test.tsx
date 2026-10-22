/**
 * F13 (T557) - the identity block (feature 005; FR-058, FR-080 as amended by Q-11; UI-SPEC
 * sections 8 and 10; the pictures `profile.png`, `profile-dark.png`): initials avatar, name,
 * "Traveller since", and the two pictured buttons that are coming-soon controls.
 */
import type { UserProfile } from '@triptrackr/contracts';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { appearance } from '../../../../test/helpers/appearance';
import { ProfileIdentity } from '../profile-identity';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock; hide: jest.Mock };
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearance());
  mockToast.show.mockClear();
});

const hidden = { includeHiddenElements: true };

const USER: UserProfile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'marta@example.com',
  display_name: 'Marta',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2021-06-15T10:00:00.000Z',
};

describe('<ProfileIdentity>', () => {
  test('keeps its id, shows the name in full and "Traveller since" from the creation date', async () => {
    await render(<ProfileIdentity user={USER} />);
    expect(screen.getByTestId('profile-identity')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-display-name')).toHaveTextContent('Marta');
    expect(
      screen.getByTestId('profile-display-name').props.numberOfLines,
    ).toBeUndefined();
    expect(screen.getByText('Traveller since 2021')).toBeOnTheScreen();
  });

  test('leaves "Traveller since" out when the session has no creation date to read', async () => {
    await render(<ProfileIdentity user={{ ...USER, created_at: 'unreadable' }} />);
    expect(screen.queryByText(/Traveller since/)).toBeNull();
    expect(screen.getByTestId('profile-display-name')).toBeOnTheScreen();
  });

  test('the avatar is the initials, hidden from assistive technology (the name is beside it)', async () => {
    await render(<ProfileIdentity user={USER} />);
    expect(screen.queryByText('M')).toBeNull();
    let node: ReturnType<typeof screen.getByText> | null = screen.getByText('M', hidden);
    while (node && node.props.accessibilityElementsHidden !== true) node = node.parent;
    expect(node).not.toBeNull();
  });

  test('the name is the heading of the screen (the large native title gives way to it)', async () => {
    await render(<ProfileIdentity user={USER} />);
    expect(screen.getByTestId('profile-display-name').props.accessibilityRole).toBe(
      'header',
    );
  });

  test('draws no profile photograph and no email line (the email is an Account row)', async () => {
    await render(<ProfileIdentity user={USER} />);
    expect(screen.queryByTestId('profile-email')).toBeNull();
    expect(screen.queryByText('marta@example.com')).toBeNull();
  });
});

describe('<ProfileIdentity> - the pictured buttons are coming soon (Q-11)', () => {
  test.each([
    ['coming-soon-share-passport', 'Share passport'],
    ['coming-soon-profile-settings', 'Settings'],
  ])(
    '%s is a real button, named, hinted and does one thing: the toast',
    async (id, name) => {
      await render(<ProfileIdentity user={USER} />);
      const button = screen.getByTestId(id);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe(name);
      expect(button.props.accessibilityHint).toBe('Not available yet');
      await fireEvent.press(button);
      expect(mockToast.show).toHaveBeenCalledTimes(1);
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'coming-soon' }),
      );
    },
  );
});
