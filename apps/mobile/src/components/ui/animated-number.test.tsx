/**
 * T523 - `AnimatedNumber`, a figure that counts up once (feature 005; FR-060, FR-074, FR-076,
 * FR-077; contract C5-30; research D5-11).
 *
 * What a traveller must be able to rely on, and what is proven here: a screen reader hears the
 * FINAL value at once and never an intermediate frame (the label is the final text from the
 * first render, and no frame changes it, and nothing is a live region); under reduced motion
 * the final text is there on the first render, with no timer; the figure follows the device
 * locale; the digits are tabular and in a display face so they do not jitter; and the box is
 * as wide as the final text from the first frame, so nothing around it moves while it counts.
 *
 * Time is driven by hand: the component's interval is captured and `Date.now()` is moved
 * (`test/helpers/captured-interval.ts`).
 */
import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { Motion } from '@/theme';

import { captureIntervals } from '../../../test/helpers/captured-interval';

import { AnimatedNumber } from './animated-number';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function setMotion(prefersLessMotion: boolean) {
  useAppearance.mockReturnValue({
    theme: 'light',
    themeName: 'light',
    prefersMoreContrast: false,
    prefersLessMotion,
    prefersLessTransparency: false,
    fontScale: 1,
    tokens: Colors.light,
    ready: true,
  });
}

let intervals: ReturnType<typeof captureIntervals>;
let now: jest.SpyInstance<number, []>;

beforeEach(() => {
  setMotion(false);
  intervals = captureIntervals();
  now = jest.spyOn(Date, 'now').mockReturnValue(50_000);
});
afterEach(() => jest.restoreAllMocks());

/** Moves the clock `ms` past the start and runs the latest frame. */
const frame = (ms: number) =>
  act(() => {
    now.mockReturnValue(50_000 + ms);
    intervals.tick(intervals.all.length - 1);
  });

const shown = (id = 'n') => screen.getByTestId(id);
const hidden = { includeHiddenElements: true };
const style = (id: string): TextStyle & ViewStyle =>
  (StyleSheet.flatten(screen.getByTestId(id, hidden).props.style) ?? {}) as TextStyle &
    ViewStyle;

describe('AnimatedNumber - the count-up', () => {
  test('counts from nothing to the final value, and rests on it', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    expect(shown()).toHaveTextContent('0');
    await frame(100);
    const early = Number(shown().props.children.replace(/,/g, ''));
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(12346);
    // Eased out, it rounds to the final figure a moment before the duration ends, so the
    // middle of the count is the place to be short of it.
    await frame(Motion.countUpMs / 2);
    expect(shown()).not.toHaveTextContent('12,346');
    await frame(Motion.countUpMs);
    expect(shown()).toHaveTextContent('12,346');
    expect(intervals.live()).toHaveLength(0);
    await frame(5_000);
    expect(shown()).toHaveTextContent('12,346');
  });

  test('takes 700 ms by default, and the duration is a prop', async () => {
    await render(<AnimatedNumber value={50} testID="n" />);
    expect(Motion.countUpMs).toBe(700);
    await frame(350);
    expect(shown()).not.toHaveTextContent('50');
    await frame(699);
    expect(intervals.live()).toHaveLength(1);
    await frame(700);
    expect(shown()).toHaveTextContent('50');
    expect(intervals.live()).toHaveLength(0);
  });

  test('a duration of its own', async () => {
    await render(<AnimatedNumber value={50} duration={200} testID="n" />);
    await frame(100);
    expect(shown()).not.toHaveTextContent('50');
    await frame(199);
    expect(intervals.live()).toHaveLength(1);
    await frame(200);
    expect(shown()).toHaveTextContent('50');
    expect(intervals.live()).toHaveLength(0);
  });

  test('a delay holds it at nothing (the 80 ms stagger of the three figures)', async () => {
    await render(
      <AnimatedNumber value={14} delay={Motion.countUpStaggerMs * 2} testID="n" />,
    );
    await frame(Motion.countUpStaggerMs * 2 - 1);
    expect(shown()).toHaveTextContent('0');
    await frame(Motion.countUpStaggerMs * 2 + Motion.countUpMs);
    expect(shown()).toHaveTextContent('14');
  });

  test('counts on from where it was when the value changes mid-count', async () => {
    const view = await render(<AnimatedNumber value={100} testID="n" />);
    await frame(Motion.countUpMs / 2);
    const before = Number(shown().props.children);
    await view.rerender(<AnimatedNumber value={200} testID="n" />);
    const mid = Number(shown().props.children);
    expect(mid).toBeGreaterThanOrEqual(before);
    expect(mid).toBeLessThan(200);
    await frame(Motion.countUpMs * 3);
    expect(shown()).toHaveTextContent('200');
  });

  test('a new value after the count is drawn at once (the policy is in count-up-policy.test)', async () => {
    const view = await render(<AnimatedNumber value={14} testID="n" />);
    await frame(Motion.countUpMs);
    expect(shown()).toHaveTextContent('14');
    await view.rerender(<AnimatedNumber value={20} testID="n" />);
    expect(shown()).toHaveTextContent('20');
    expect(intervals.live()).toHaveLength(0);
  });

  test('a value that is not a number is zero, not a NaN on the screen', async () => {
    await render(<AnimatedNumber value={Number.NaN} testID="n" />);
    expect(shown()).toHaveTextContent('0');
    expect(shown().props.accessibilityLabel).toBe('0');
  });

  test('stops its timer when the figure goes away', async () => {
    const view = await render(<AnimatedNumber value={14} testID="n" />);
    expect(intervals.live()).toHaveLength(1);
    await view.rerender(<></>);
    expect(intervals.live()).toHaveLength(0);
  });
});

describe('AnimatedNumber - assistive technology hears the final value, once (FR-060, FR-076)', () => {
  test('the label is the final formatted value from the very first render', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    expect(shown().props.accessibilityLabel).toBe('12,346');
    expect(shown()).toHaveTextContent('0');
  });

  test('no frame ever changes the label: never "3, 17, 42"', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    const labels = new Set<string>();
    for (const ms of [0, 50, 120, 250, 400, 600, 700, 900]) {
      await frame(ms);
      labels.add(shown().props.accessibilityLabel);
    }
    expect([...labels]).toEqual(['12,346']);
  });

  test('is not a live region and announces nothing while it counts', async () => {
    await render(<AnimatedNumber value={14} testID="n" />);
    const props = shown().props;
    expect(props.accessibilityLiveRegion).toBeUndefined();
    expect(props['aria-live']).toBeUndefined();
  });

  test('the width-keeper is hidden from assistive technology, so the number is read once', async () => {
    await render(<AnimatedNumber value={14} testID="n" />);
    const keeper = screen.getByTestId('n-width', hidden);
    expect(keeper.props.accessibilityElementsHidden).toBe(true);
    expect(keeper.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(keeper.props.accessible).toBe(false);
    expect(screen.queryByTestId('n-width')).toBeNull();
    expect(screen.queryAllByText('14')).toHaveLength(0);
  });

  test('a caller label replaces the default one (a tile says "14 of 195 countries")', async () => {
    await render(
      <AnimatedNumber value={14} accessibilityLabel="14 of 195 countries" testID="n" />,
    );
    expect(shown().props.accessibilityLabel).toBe('14 of 195 countries');
  });
});

describe('AnimatedNumber - reduced motion (FR-073)', () => {
  beforeEach(() => setMotion(true));

  test('the final text is there on the first render, in a single text', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    expect(shown()).toHaveTextContent('12,346');
    expect(shown().props.accessibilityLabel).toBe('12,346');
    expect(screen.queryByTestId('n-width', hidden)).toBeNull();
  });

  test('sets no timer at all', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    expect(intervals.all).toHaveLength(0);
  });

  test('a new value is shown at once', async () => {
    const view = await render(<AnimatedNumber value={14} testID="n" />);
    await view.rerender(<AnimatedNumber value={20} testID="n" />);
    expect(shown()).toHaveTextContent('20');
    expect(intervals.all).toHaveLength(0);
  });

  test('switching reduced motion on mid-count shows the final text and stops the timer', async () => {
    setMotion(false);
    const view = await render(<AnimatedNumber value={500} testID="n" />);
    await frame(100);
    setMotion(true);
    await view.rerender(<AnimatedNumber value={500} testID="n" />);
    expect(shown()).toHaveTextContent('500');
    expect(intervals.live()).toHaveLength(0);
  });
});

describe('AnimatedNumber - the figure follows the device (FR-077)', () => {
  test('groups with the device locale: en-GB in the test double', async () => {
    setMotion(true);
    await render(<AnimatedNumber value={1234567} testID="n" />);
    expect(shown()).toHaveTextContent('1,234,567');
  });

  test('a locale of its own', async () => {
    setMotion(true);
    await render(<AnimatedNumber value={12346} locale="de-DE" testID="n" />);
    expect(shown()).toHaveTextContent('12.346');
    expect(shown().props.accessibilityLabel).toBe('12.346');
  });

  test('every frame is formatted too: grouping appears as it counts', async () => {
    await render(<AnimatedNumber value={1_000_000} locale="de-DE" testID="n" />);
    await frame(300);
    expect(String(shown().props.children)).toMatch(/^\d{1,3}(\.\d{3})*$/);
  });

  test('any Intl option: a decimal, a percentage', async () => {
    setMotion(true);
    await render(
      <AnimatedNumber value={4.56} format={{ maximumFractionDigits: 1 }} testID="n" />,
    );
    expect(shown()).toHaveTextContent('4.6');
  });
});

describe('AnimatedNumber - tabular digits in a display face, in a box that does not move', () => {
  test('is the numeral role in Bricolage Bold, 36 on 40, by default', async () => {
    await render(<AnimatedNumber value={14} testID="n" />);
    const classes = String(shown().props.className).split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining(['font-display-bold', 'text-[36px]', 'leading-[40px]']),
    );
  });

  test('both texts carry tabular figures, whatever the role', async () => {
    await render(<AnimatedNumber value={14} variant="title" testID="n" />);
    expect(style('n').fontVariant).toEqual(['tabular-nums']);
    expect(style('n-width').fontVariant).toEqual(['tabular-nums']);
  });

  test('is always a display face: a body role is not on offer', async () => {
    await render(<AnimatedNumber value={14} variant="headline" testID="n" />);
    expect(String(shown().props.className)).toContain('font-display-bold');
  });

  test('reserves the width of the FINAL text from the first frame', async () => {
    await render(<AnimatedNumber value={12346} testID="n" />);
    const keeper = screen.getByTestId('n-width', hidden);
    expect(keeper.props.children).toBe('12,346');
    expect(style('n-width').opacity).toBe(0);
    // The keeper is in flow and sizes the box; the visible figure lies over it.
    expect(style('n-width').position).toBeUndefined();
    expect(style('n')).toMatchObject({ position: 'absolute', left: 0, right: 0, top: 0 });
    expect(shown()).toHaveTextContent('0');
  });

  test('the keeper and the figure share every text style the caller gives, alignment included', async () => {
    await render(
      <AnimatedNumber
        value={14}
        style={{ textAlign: 'center', color: 'red' }}
        containerStyle={{ alignSelf: 'flex-start' }}
        testID="n"
      />,
    );
    expect(style('n').textAlign).toBe('center');
    expect(style('n-width').textAlign).toBe('center');
    expect(style('n-container')).toMatchObject({ alignSelf: 'flex-start' });
  });

  test('forwards text props to both texts (a line that shrinks to fit)', async () => {
    await render(<AnimatedNumber value={14} numberOfLines={1} testID="n" />);
    expect(shown().props.numberOfLines).toBe(1);
    expect(screen.getByTestId('n-width', hidden).props.numberOfLines).toBe(1);
  });

  test('carries the capped role of the numeral: the hero numeral is held at 1.3', async () => {
    await render(<AnimatedNumber value={14} testID="n" />);
    expect(shown().props.maxFontSizeMultiplier).toBe(1.3);
  });
});
