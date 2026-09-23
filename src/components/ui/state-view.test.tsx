/**
 * T069 — FR-027. Empty, loading, and error states are designed states, not
 * gaps, and are held to the same standard as populated screens.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

import { EmptyState, ErrorState, LoadingState } from './state-view';

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

describe('state views — FR-027', () => {
  test('the empty state is styled and explains itself', async () => {
    await render(<EmptyState title="No trips yet" detail="Add your first stop." />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(screen.getByText('Add your first stop.')).toBeTruthy();
  });

  test('the loading state is announced, not a silent pause', async () => {
    await render(<LoadingState title="Loading trips" />);
    // A spinner with no accessible name is an invisible wait for a screen reader.
    expect(screen.getByLabelText('Loading trips')).toBeTruthy();
  });

  test('the error state conveys failure by text, not colour alone (FR-010)', async () => {
    await render(
      <ErrorState title="Could not load trips" detail="Check your connection." />,
    );
    expect(screen.getByText('Could not load trips')).toBeTruthy();
    expect(screen.getByText('Check your connection.')).toBeTruthy();
  });

  test('the error state offers a way out rather than a dead end', async () => {
    const onRetry = jest.fn();
    await render(<ErrorState title="Could not load trips" onRetry={onRetry} />);
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('omits the retry control when no retry is possible', async () => {
    await render(<ErrorState title="Could not load trips" />);
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });
});
