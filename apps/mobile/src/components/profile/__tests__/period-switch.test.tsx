/**
 * F13 (T557) - the period switch (feature 005; FR-058; contract C5-16; UI-SPEC section 8):
 * All time and each year with a trip, newest first, a 36 dp radio group named "Period".
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { appearance } from '../../../../test/helpers/appearance';
import { PERIOD_FIT, PeriodSwitch } from '../period-switch';

jest.mock('@/hooks/use-appearance');
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

beforeEach(() => useAppearance.mockReturnValue(appearance()));

const sw = (periods: string[], selected = 'all', onSelect = jest.fn()) => (
  <PeriodSwitch periods={periods} selected={selected} onSelect={onSelect} />
);

describe('<PeriodSwitch>', () => {
  test('is the group `passport-period`, named Period, one radio per period in order', async () => {
    await render(sw(['all', '2026', '2025']));
    const group = screen.getByTestId('passport-period');
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(group.props.accessibilityLabel).toBe('Period');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.props.accessibilityLabel)).toEqual([
      'All time',
      'Year 2026',
      'Year 2025',
    ]);
    expect(screen.getByText('All time')).toBeOnTheScreen();
    expect(screen.getByText('2026')).toBeOnTheScreen();
  });

  test('the selected one is checked', async () => {
    await render(sw(['all', '2026'], '2026'));
    expect(
      screen.getByTestId('passport-period-2026').props.accessibilityState,
    ).toMatchObject({
      selected: true,
      checked: true,
    });
    expect(
      screen.getByTestId('passport-period-all').props.accessibilityState,
    ).toMatchObject({
      selected: false,
    });
  });

  test('choosing a year reports it', async () => {
    const onSelect = jest.fn();
    await render(sw(['all', '2026', '2025'], 'all', onSelect));
    await fireEvent.press(screen.getByTestId('passport-period-2025'));
    expect(onSelect).toHaveBeenCalledWith('2025');
  });

  test('with only All time it is still drawn, as one segment', async () => {
    await render(sw(['all']));
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });

  test('up to four segments fit; more scroll sideways, so no year is out of reach', async () => {
    await render(sw(['all', '2026', '2025', '2024']));
    expect(screen.queryByTestId('passport-period-scroll')).toBeNull();
    expect(PERIOD_FIT).toBe(4);
  });

  test('five periods or more sit in a horizontal scroller at a readable width', async () => {
    await render(sw(['all', '2026', '2025', '2024', '2023', '2019']));
    const scroller = screen.getByTestId('passport-period-scroll');
    expect(scroller.props.horizontal).toBe(true);
    expect(screen.getAllByRole('radio')).toHaveLength(6);
  });
});
