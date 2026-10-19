/**
 * Feature 005, T539/T540 review (FR-031: "Active · Day N of M") - `useToday`, the local calendar
 * day as state, so a card that says "Day 3 of 8" says "Day 4 of 8" the morning after without a
 * write to the store. A tab screen stays mounted for as long as the app lives, so a clock read
 * once at the last change is a day behind after midnight, and after a night in the background.
 *
 * Two ways to notice: a timer to just after the next local midnight (the app stays open across
 * it), and the return to the foreground (timers do not run while the app is away).
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { msUntilNextDay, useToday } from '@/features/trips/use-today';

function captureAppState() {
  const captured: { listener?: (state: AppStateStatus) => void } = {};
  const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    captured.listener = listener as (state: AppStateStatus) => void;
    return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  return { captured, remove };
}

/** 23:59:00 on 1 March 2026, in the device's own time zone (the day is a local one). */
const ONE_MINUTE_TO_MIDNIGHT = () => new Date(2026, 2, 1, 23, 59, 0);

beforeEach(() => {
  jest.useFakeTimers({ now: ONE_MINUTE_TO_MIDNIGHT() });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('msUntilNextDay', () => {
  test('is the time to one second past the next local midnight', () => {
    expect(msUntilNextDay(new Date(2026, 2, 1, 23, 59, 0))).toBe(61_000);
    expect(msUntilNextDay(new Date(2026, 2, 1, 0, 0, 0))).toBe(24 * 3_600_000 + 1_000);
  });

  test('crosses the end of a month and of a year', () => {
    expect(msUntilNextDay(new Date(2026, 11, 31, 23, 0, 0))).toBe(3_601_000);
  });
});

describe('useToday', () => {
  test('is the local calendar day', async () => {
    captureAppState();
    const { result } = await renderHook(() => useToday());
    expect(result.current).toBe('2026-03-01');
  });

  test('turns over at midnight with the app open and nothing else happening', async () => {
    captureAppState();
    const { result } = await renderHook(() => useToday());

    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe('2026-03-01');

    await act(async () => {
      jest.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe('2026-03-02');
  });

  test('keeps turning over, day after day', async () => {
    captureAppState();
    const { result } = await renderHook(() => useToday());

    await act(async () => {
      jest.advanceTimersByTime(3 * 24 * 3_600_000);
    });
    expect(result.current).toBe('2026-03-04');
  });

  test('is read again when the app comes back to the foreground (timers sleep in the background)', async () => {
    const { captured } = captureAppState();
    const { result } = await renderHook(() => useToday());

    // The phone slept through the night: the clock moved, no timer ran.
    jest.setSystemTime(new Date(2026, 2, 2, 7, 30, 0));
    expect(result.current).toBe('2026-03-01');

    await act(async () => captured.listener?.('background'));
    expect(result.current).toBe('2026-03-01');

    await act(async () => captured.listener?.('active'));
    expect(result.current).toBe('2026-03-02');
  });

  test('stops listening and waiting when the screen goes', async () => {
    const { remove } = captureAppState();
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    const { unmount } = await renderHook(() => useToday());

    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalled();
  });
});
