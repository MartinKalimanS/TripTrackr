/**
 * T523 - the engine of `AnimatedNumber` (feature 005; FR-060, FR-077; research D5-11): the
 * easing, the figure format and `useCountUp`, the hook that returns the number to draw.
 *
 * The clock is `Date.now()` and the frames are a small `setInterval` (about 30 a second),
 * captured and driven by hand (`test/helpers/captured-interval.ts`). Progress is taken from
 * the elapsed time, never from a tick count, so a slow frame costs smoothness and not time:
 * the count always ends when its duration says.
 */
import { act, renderHook } from '@testing-library/react-native';

import { captureIntervals } from '../../../test/helpers/captured-interval';

import {
  countUpValue,
  easeOutCubic,
  formatFigure,
  FRAME_MS,
  useCountUp,
} from './count-up';

describe('easeOutCubic - fast at first, gentle at the end', () => {
  test('starts at 0, ends at 1 and is 7/8 of the way at the half', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
  });

  test('only rises, and clamps outside 0 to 1', () => {
    let last = -1;
    for (let step = 0; step <= 100; step += 1) {
      const value = easeOutCubic(step / 100);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(7)).toBe(1);
  });
});

describe('countUpValue - where the figure is at a moment', () => {
  test('is the start before the clock starts and the target once it has run', () => {
    expect(countUpValue(0, 100, -50, 700)).toBe(0);
    expect(countUpValue(0, 100, 0, 700)).toBe(0);
    expect(countUpValue(0, 100, 700, 700)).toBe(100);
    expect(countUpValue(0, 100, 5_000, 700)).toBe(100);
  });

  test('is eased in between, and counts down as well as up', () => {
    expect(countUpValue(0, 100, 350, 700)).toBeCloseTo(87.5, 8);
    expect(countUpValue(100, 0, 350, 700)).toBeCloseTo(12.5, 8);
  });

  test('a zero or negative duration is the target at once', () => {
    expect(countUpValue(0, 42, 0, 0)).toBe(42);
    expect(countUpValue(0, 42, 10, -5)).toBe(42);
  });
});

describe('formatFigure - Intl, in the device language', () => {
  test('groups an integer: N,NNN in English and N.NNN in German', () => {
    expect(formatFigure(12346, 'en-GB')).toBe('12,346');
    expect(formatFigure(12346, 'de-DE')).toBe('12.346');
    expect(formatFigure(1_260_000, 'en-US')).toBe('1,260,000');
  });

  test('uses the separator of the locale, a narrow space in French', () => {
    expect(formatFigure(12346, 'fr-FR')).toMatch(/^12\s346$/);
  });

  test('is a whole number unless the caller asks for more', () => {
    expect(formatFigure(3.6, 'en-GB')).toBe('4');
    expect(formatFigure(4.56, 'en-GB', { maximumFractionDigits: 1 })).toBe('4.6');
  });

  test('takes any Intl option', () => {
    expect(formatFigure(0.5, 'en-GB', { style: 'percent' })).toBe('50%');
  });

  test('a locale Intl does not know is read as English, never thrown', () => {
    expect(formatFigure(12346, 'not_a_locale!')).toBe('12,346');
  });

  test('writes zero as 0', () => {
    expect(formatFigure(0, 'en-GB')).toBe('0');
  });
});

describe('useCountUp - the number to draw', () => {
  let intervals: ReturnType<typeof captureIntervals>;
  let now: jest.SpyInstance<number, []>;

  beforeEach(() => {
    intervals = captureIntervals();
    now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
  });
  afterEach(() => jest.restoreAllMocks());

  const options = { enabled: true, durationMs: 700, delayMs: 0 };
  const frame = (at: number) =>
    act(() => {
      now.mockReturnValue(10_000 + at);
      intervals.tick(intervals.all.length - 1);
    });

  test('is the target at once, with no timer, when motion is off', async () => {
    const { result } = await renderHook(() =>
      useCountUp(14, { ...options, enabled: false }),
    );
    expect(result.current).toBe(14);
    expect(intervals.all).toHaveLength(0);
  });

  test('starts from nothing and runs one interval of about 30 frames a second', async () => {
    const { result } = await renderHook(() => useCountUp(14, options));
    expect(result.current).toBe(0);
    expect(intervals.all).toHaveLength(1);
    expect(intervals.all[0].ms).toBe(FRAME_MS);
    expect(FRAME_MS).toBeGreaterThanOrEqual(16);
    expect(FRAME_MS).toBeLessThanOrEqual(50);
  });

  test('follows the clock, not the ticks: the same time, the same figure', async () => {
    const { result } = await renderHook(() => useCountUp(100, options));
    await frame(350);
    expect(result.current).toBeCloseTo(87.5, 6);
    await frame(350);
    await frame(350);
    expect(result.current).toBeCloseTo(87.5, 6);
  });

  test('ends on the target exactly, once its duration has run, and clears its interval', async () => {
    const { result } = await renderHook(() => useCountUp(12346, options));
    await frame(699);
    expect(result.current).toBeLessThan(12346);
    expect(intervals.all[0].cleared).toBe(false);
    await frame(700);
    expect(result.current).toBe(12346);
    expect(intervals.all[0].cleared).toBe(true);
    expect(intervals.live()).toHaveLength(0);
  });

  test('a late frame lands on the target and does not overshoot', async () => {
    const { result } = await renderHook(() => useCountUp(50, options));
    await frame(10_000);
    expect(result.current).toBe(50);
  });

  test('waits out its delay (the 80 ms stagger) before it moves', async () => {
    const { result } = await renderHook(() =>
      useCountUp(100, { ...options, delayMs: 160 }),
    );
    await frame(100);
    expect(result.current).toBe(0);
    await frame(160 + 350);
    expect(result.current).toBeCloseTo(87.5, 6);
  });

  test('a target of zero has nothing to count and sets no timer', async () => {
    const { result } = await renderHook(() => useCountUp(0, options));
    expect(result.current).toBe(0);
    expect(intervals.all).toHaveLength(0);
  });

  test('a re-render with the same target does not restart the count', async () => {
    const { rerender } = await renderHook(() => useCountUp(14, options));
    await rerender({});
    await rerender({});
    expect(intervals.all).toHaveLength(1);
  });

  test('a new target counts on from where it had got to, with one interval alive', async () => {
    let target = 100;
    const { result, rerender } = await renderHook(() => useCountUp(target, options));
    await frame(350);
    const reached = result.current;
    expect(reached).toBeCloseTo(87.5, 6);
    target = 200;
    await rerender({});
    expect(intervals.all).toHaveLength(2);
    expect(intervals.all[0].cleared).toBe(true);
    expect(intervals.live()).toHaveLength(1);
    now.mockReturnValue(10_000 + 350);
    await frame(350);
    expect(result.current).toBeCloseTo(reached, 6);
    await frame(350 + 700);
    expect(result.current).toBe(200);
  });

  test('a new target after it has finished counts from the old one, not from nothing', async () => {
    let target = 14;
    const { result, rerender } = await renderHook(() => useCountUp(target, options));
    await frame(700);
    expect(result.current).toBe(14);
    target = 20;
    now.mockReturnValue(20_000);
    await rerender({});
    const start = 20_000 - 10_000;
    await frame(start + 350);
    expect(result.current).toBeGreaterThan(14);
    expect(result.current).toBeLessThan(20);
    await frame(start + 700);
    expect(result.current).toBe(20);
  });

  test('turning motion off mid-count shows the target at once and clears the interval', async () => {
    let enabled = true;
    const { result, rerender } = await renderHook(() =>
      useCountUp(500, { ...options, enabled }),
    );
    await frame(100);
    enabled = false;
    await rerender({});
    expect(result.current).toBe(500);
    expect(intervals.live()).toHaveLength(0);
  });

  test('clears its interval when the component goes away', async () => {
    const { unmount } = await renderHook(() => useCountUp(14, options));
    expect(intervals.live()).toHaveLength(1);
    await unmount();
    expect(intervals.live()).toHaveLength(0);
  });
});
