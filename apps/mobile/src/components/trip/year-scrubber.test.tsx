/**
 * T540 - `YearScrubber` (contract C5-19; FR-035): a 28 dp capsule on the right edge of a long
 * trips list, two-digit years in the eyebrow role, the year in view on `ink`. A touch (and a drag)
 * along it jumps to the year at that height, with a selection haptic when the year changes. For a
 * screen reader it is ONE `adjustable` control: swipe up or down to go to a later or an earlier
 * year (`increment` and `decrement`), its value the year in words.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useAccessibilityFlags } from '@/hooks/use-accessibility-flags';
import type { Haptics } from '@/hooks/use-haptics';

import { classesOf } from '../../../test/helpers/host-nodes';
import { YearScrubber } from './year-scrubber';

jest.mock('@/hooks/use-accessibility-flags');
jest.mock('@/hooks/use-haptics');
const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

beforeEach(() => {
  (useAccessibilityFlags as jest.Mock).mockReturnValue({
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
  });
  useHaptics.mockReturnValue(haptics);
  jest.mocked(haptics.selection).mockClear();
});

const YEARS = [2026, 2025, 2024, 2023];
const HEIGHT = 200;
const hidden = { includeHiddenElements: true };

async function renderScrubber(
  props: { years?: number[]; activeYear?: number | null } = {},
) {
  const onJump = jest.fn();
  await render(
    <YearScrubber
      years={props.years ?? YEARS}
      activeYear={props.activeYear === undefined ? 2025 : props.activeYear}
      onJump={onJump}
    />,
  );
  await fireEvent(screen.getByTestId('trips-year-scrubber'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 28, height: HEIGHT } },
  });
  return onJump;
}

const touch = (name: string, locationY: number) =>
  act(async () => {
    screen.getByTestId('trips-year-scrubber').props[name]({ nativeEvent: { locationY } });
  });

describe('<YearScrubber> for a screen reader', () => {
  test('is ONE adjustable control named for what it does, its value the year in view', async () => {
    await renderScrubber();
    const scrubber = screen.getByTestId('trips-year-scrubber');

    expect(scrubber.props.accessible).toBe(true);
    expect(scrubber.props.accessibilityRole).toBe('adjustable');
    expect(scrubber.props.accessibilityLabel).toBe('Jump to year');
    expect(scrubber.props.accessibilityValue).toEqual({ text: '2025' });
    expect(scrubber.props.accessibilityActions).toEqual([
      { name: 'increment', label: 'Later year' },
      { name: 'decrement', label: 'Earlier year' },
    ]);
  });

  test('increment goes to the next later year, decrement to the next earlier one', async () => {
    const onJump = await renderScrubber();
    const scrubber = screen.getByTestId('trips-year-scrubber');

    await fireEvent(scrubber, 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(onJump).toHaveBeenLastCalledWith(2026);

    await fireEvent(scrubber, 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onJump).toHaveBeenLastCalledWith(2024);
  });

  test('does nothing past the newest or the oldest year', async () => {
    const newest = await renderScrubber({ activeYear: 2026 });
    await fireEvent(screen.getByTestId('trips-year-scrubber'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(newest).not.toHaveBeenCalled();
  });

  test('with no year in view it starts from the newest', async () => {
    const onJump = await renderScrubber({ activeYear: null });
    expect(screen.getByTestId('trips-year-scrubber').props.accessibilityValue).toEqual({
      text: '2026',
    });
    await fireEvent(screen.getByTestId('trips-year-scrubber'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(onJump).toHaveBeenLastCalledWith(2025);
  });
});

describe('<YearScrubber> as drawn', () => {
  test('lists two-digit years, newest first, the year in view on ink', async () => {
    await renderScrubber();

    for (const label of ['26', '25', '24', '23']) {
      expect(screen.getByText(label, hidden)).toBeTruthy();
    }
    const active = screen.getByTestId('trips-year-scrubber-year-2025', hidden);
    expect(classesOf(active)).toContain('bg-foreground');
    expect(
      classesOf(screen.getByTestId('trips-year-scrubber-year-2024', hidden)),
    ).not.toContain('bg-foreground');
  });

  test('with many years it keeps the newest seven, a dot and the oldest', async () => {
    const years = Array.from({ length: 18 }, (_, index) => 2026 - index);
    await renderScrubber({ years, activeYear: 2026 });

    const labels = ['26', '25', '24', '23', '22', '21', '20', '\u00B7', '09'];
    for (const label of labels) {
      expect(screen.getByText(label, hidden)).toBeTruthy();
    }
    expect(screen.queryByText('15', hidden)).toBeNull();
  });

  test('is a 28 dp capsule on the cream ground with a hairline', async () => {
    await renderScrubber();
    const classes = classesOf(screen.getByTestId('trips-year-scrubber'));
    expect(classes).toEqual(
      expect.arrayContaining([
        'bg-surface-secondary',
        'border',
        'border-separator',
        'min-w-[28px]',
      ]),
    );
  });

  test('reaches 44 dp wide by hit area, whatever its visible width', async () => {
    await renderScrubber();
    expect(screen.getByTestId('trips-year-scrubber').props.hitSlop).toEqual({
      left: 16,
      right: 4,
      top: 4,
      bottom: 4,
    });
  });

  test('draws nothing with no years', async () => {
    await render(<YearScrubber years={[]} activeYear={null} onJump={jest.fn()} />);
    expect(screen.queryByTestId('trips-year-scrubber')).toBeNull();
  });
});

describe('<YearScrubber> touched', () => {
  test('claims the touch, so the list does not scroll under a finger on it', async () => {
    await renderScrubber();
    const scrubber = screen.getByTestId('trips-year-scrubber');
    expect(scrubber.props.onStartShouldSetResponder()).toBe(true);
    expect(scrubber.props.onResponderTerminationRequest()).toBe(false);
  });

  test('a touch jumps to the year at that height, top the newest, bottom the oldest', async () => {
    const onJump = await renderScrubber();

    await touch('onResponderGrant', 5);
    expect(onJump).toHaveBeenLastCalledWith(2026);

    await touch('onResponderMove', HEIGHT - 5);
    expect(onJump).toHaveBeenLastCalledWith(2023);
  });

  test('a drag past the ends stays on the first or the last year', async () => {
    const onJump = await renderScrubber();

    await touch('onResponderGrant', -40);
    expect(onJump).toHaveBeenLastCalledWith(2026);
    await touch('onResponderMove', HEIGHT + 80);
    expect(onJump).toHaveBeenLastCalledWith(2023);
  });

  test('a drag within one year jumps once, and plays the selection haptic once', async () => {
    const onJump = await renderScrubber();

    await touch('onResponderGrant', 10);
    await touch('onResponderMove', 20);
    await touch('onResponderMove', 30);

    expect(onJump).toHaveBeenCalledTimes(1);
    expect(haptics.selection).toHaveBeenCalledTimes(1);
  });

  test('crossing into another year jumps and plays the haptic again', async () => {
    const onJump = await renderScrubber();

    await touch('onResponderGrant', 10);
    await touch('onResponderMove', 60);

    expect(onJump.mock.calls.map(([year]) => year)).toEqual([2026, 2025]);
    expect(haptics.selection).toHaveBeenCalledTimes(2);
  });

  test('a new touch on the year it left jumps again', async () => {
    const onJump = await renderScrubber();

    await touch('onResponderGrant', 10);
    await touch('onResponderRelease', 10);
    await touch('onResponderGrant', 10);

    expect(onJump).toHaveBeenCalledTimes(2);
  });
});
