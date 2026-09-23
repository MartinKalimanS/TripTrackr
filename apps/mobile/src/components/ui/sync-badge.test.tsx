/**
 * T066 — contract C11, FR-007.
 *
 * Constitution Principle II: a record must not be presented as saved before its
 * bytes have landed. Neumorphism's entire vocabulary is "soft, settled,
 * finished" — exactly the wrong signal for a pending record — so the style
 * needs an explicit counter-signal or it quietly implies the opposite.
 */
import { render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { SyncBadge } from './sync-badge';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

beforeEach(() => {
  useAppearance.mockReturnValue({
    theme: 'light',
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors.light,
  } as AppearanceContext);
});

describe('<SyncBadge> — contract C11', () => {
  test.each([
    ['pending', 'Not yet synced'],
    ['syncing', 'Syncing'],
    ['failed', 'Sync failed'],
  ] as const)('conveys %s with text, not colour alone (FR-010)', async (state, label) => {
    await render(<SyncBadge state={state} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  test.each(['pending', 'syncing', 'failed'] as const)(
    'announces %s to assistive technology with a text equivalent',
    async (state) => {
      await render(<SyncBadge state={state} />);
      expect(screen.getByLabelText(/sync/i)).toBeTruthy();
    },
  );

  test('carries an icon as well as the message, so state survives a glance', async () => {
    await render(<SyncBadge state="pending" />);
    expect(screen.getByTestId('sync-badge-icon')).toBeTruthy();
  });

  test('distinguishes failure from the other states by more than hue', async () => {
    await render(<SyncBadge state="failed" />);
    const failedIcon = screen.getByTestId('sync-badge-icon').props.children;
    screen.unmount?.();

    await render(<SyncBadge state="pending" />);
    const pendingIcon = screen.getByTestId('sync-badge-icon').props.children;

    expect(failedIcon).not.toBe(pendingIcon);
  });

  test('queries nothing — it reflects state the caller owns (Principle II)', () => {
    // The badge is a presentation of synchronisation state, never a participant
    // in it. Importing the sync layer here would invert that.
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('./sync-badge.tsx'), 'utf8') as string;
    expect(source).not.toMatch(/useQuery|fetch\(|axios|drizzle|expo-sqlite/);
  });
});
