/**
 * T529 - the sync chip and banner, wired for screens to drop in (feature 005, contracts C5-16
 * and C5-28; FR-026, FR-065). `SyncStatusChip` and `SyncStatusBanner` read ONE derived state
 * (`useSyncChipState`) and hand it to the adapters, which draw it; the only thing they do is
 * Retry, which asks the sync engine for a manual cycle (the existing runtime: nothing is
 * written to the store and no new request exists). Nothing is drawn when everything is
 * synchronised, and the banner is only for offline and for a failed sync: a waiting or a running
 * sync is the chip's alone, so one question gets one answer per screen.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SyncStatusBanner, SyncStatusChip } from '@/components/sync/sync-status';
import type { SyncChipState } from '@/features/sync/use-sync-chip-state';

import { appearanceOf } from '../helpers/appearance';

// `mock`-prefixed so Jest's hoisted factories may reference them.
const mockState: { current: SyncChipState } = { current: { kind: 'synced' } };
const mockSyncNow = jest.fn();

jest.mock('@/hooks/use-appearance');
jest.mock('@/features/sync/use-sync-chip-state', () => ({
  useSyncChipState: () => mockState.current,
}));
jest.mock('@/sync/engine', () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => {
  useAppearance.mockReturnValue(appearanceOf('light'));
  mockState.current = { kind: 'synced' };
  mockSyncNow.mockReset();
});

describe('<SyncStatusChip>', () => {
  test('draws nothing when everything is synchronised', async () => {
    await render(<SyncStatusChip />);
    expect(screen.queryByTestId('sync-chip')).toBeNull();
  });

  test.each([
    [{ kind: 'waiting', count: 3 }, '3 changes waiting to sync'],
    [{ kind: 'syncing', count: 2 }, 'Syncing 2 changes'],
    [{ kind: 'offline', count: 1 }, 'Offline, 1 change waiting to sync'],
  ] as const)('%j is announced "%s"', async (state, words) => {
    mockState.current = state;
    await render(<SyncStatusChip />);
    expect(screen.getByTestId('sync-chip').props.accessibilityLabel).toBe(words);
  });

  test('a failed sync offers Retry, which asks the engine for a manual cycle', async () => {
    mockState.current = { kind: 'failed', count: 2 };
    await render(<SyncStatusChip />);

    const chip = screen.getByTestId('sync-chip');
    expect(chip.props.accessibilityRole).toBe('button');
    await fireEvent.press(chip);
    expect(mockSyncNow).toHaveBeenCalledTimes(1);
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
  });

  test('the other states are labels, not buttons: nothing happens when they are pressed', async () => {
    mockState.current = { kind: 'waiting', count: 3 };
    await render(<SyncStatusChip />);
    expect(screen.getByTestId('sync-chip').props.accessibilityRole).toBe('text');
    expect(mockSyncNow).not.toHaveBeenCalled();
  });
});

describe('<SyncStatusBanner>', () => {
  test.each([
    [{ kind: 'synced' }],
    [{ kind: 'waiting', count: 3 }],
    [{ kind: 'syncing', count: 3 }],
  ] as const)('%j has no banner', async (state) => {
    mockState.current = state;
    await render(<SyncStatusBanner />);
    expect(screen.queryByTestId('sync-banner')).toBeNull();
  });

  test('offline says so in words, calmly, with nothing to retry', async () => {
    mockState.current = { kind: 'offline', count: 3 };
    await render(<SyncStatusBanner />);

    expect(screen.getByTestId('sync-banner')).toBeTruthy();
    expect(
      screen.getByText("Offline. 3 changes will sync when you're back online."),
    ).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  test('a failed sync says the data is safe on the phone and offers Retry', async () => {
    mockState.current = { kind: 'failed', count: 2 };
    await render(<SyncStatusBanner />);

    expect(
      screen.getByText("Couldn't sync 2 changes. Your trips are safe on this phone."),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(mockSyncNow).toHaveBeenCalledWith('manual');
  });

  test('the banner and the chip say the same thing about the same state', async () => {
    mockState.current = { kind: 'offline', count: 1 };
    await render(
      <>
        <SyncStatusChip />
        <SyncStatusBanner />
      </>,
    );
    expect(screen.getByTestId('sync-chip').props.accessibilityLabel).toContain(
      '1 change',
    );
    expect(
      screen.getByText("Offline. 1 change will sync when you're back online."),
    ).toBeTruthy();
  });
});
