/**
 * F13 (T557) - the pictured recap entry (feature 005; FR-080 as amended by Q-11; UI-SPEC section
 * 10): drawn as in `profile.png`, and a coming-soon control: one toast and nothing else.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { appearance } from '../../../../test/helpers/appearance';
import { RecapEntry } from '../recap-entry';

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

describe('<RecapEntry>', () => {
  test('says the year in view in the pictured words', async () => {
    await render(<RecapEntry period="2026" thisYear={2026} />);
    expect(screen.getByText('Your 2026 in 7 slides')).toBeOnTheScreen();
    expect(screen.getByText('See it and share it')).toBeOnTheScreen();
  });

  test('for All time it is this year, and another year when that year is in view', async () => {
    await render(<RecapEntry period="all" thisYear={2027} />);
    expect(screen.getByText('Your 2027 in 7 slides')).toBeOnTheScreen();
    await render(<RecapEntry period="2024" thisYear={2027} />);
    expect(screen.getByText('Your 2024 in 7 slides')).toBeOnTheScreen();
  });

  test('is a real button, hinted "Not available yet", and its only effect is the one toast', async () => {
    await render(<RecapEntry period="2026" thisYear={2026} />);
    const button = screen.getByTestId('coming-soon-recap');
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(
      'Your 2026 in 7 slides, See it and share it',
    );
    expect(button.props.accessibilityHint).toBe('Not available yet');
    await fireEvent.press(button);
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'coming-soon' }),
    );
  });

  test('is 72 dp at least, radius 24, padding 12, with a 48 dp coral-to-amber tile', async () => {
    await render(<RecapEntry period="2026" thisYear={2026} />);
    const style = StyleSheet.flatten(screen.getByTestId('coming-soon-recap').props.style);
    expect(style).toMatchObject({
      minHeight: 72,
      borderRadius: 24,
      padding: 12,
      gap: 12,
    });
    expect(
      StyleSheet.flatten(screen.getByTestId('recap-tile').props.style),
    ).toMatchObject({
      width: 48,
      height: 48,
      borderRadius: 16,
    });
    expect(
      screen.getByTestId('scrim-recap', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
