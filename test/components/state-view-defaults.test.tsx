/**
 * Branch coverage for the state views' default props.
 */
import { render, screen } from '@testing-library/react-native';

import { EmptyState, LoadingState } from '@/components/ui/state-view';
import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

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

describe('state view defaults', () => {
  test('LoadingState announces a default title when none is supplied', async () => {
    await render(<LoadingState />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  test('EmptyState omits the detail line when there is no detail', async () => {
    await render(<EmptyState title="No trips yet" />);
    expect(screen.getByText('No trips yet')).toBeTruthy();
    expect(screen.queryByText(/Add your/)).toBeNull();
  });
});
