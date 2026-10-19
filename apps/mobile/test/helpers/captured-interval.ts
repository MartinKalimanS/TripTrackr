/**
 * Captures a component's OWN interval so a test drives it by hand, frame by frame, instead of
 * faking Jest's clock (which does not coexist with Testing Library's async `render` across the
 * tests of one file here) or counting `jest.getTimerCount()` (which also counts React's
 * internal timers: AGENTS.md, "To assert on a component's own timer, spy on `setInterval`").
 *
 *   const intervals = captureIntervals();           // in beforeEach; restore in afterEach
 *   await render(<Thing />);
 *   act(() => intervals.tick(0));                   // run the first interval's callback once
 *   expect(intervals.all[0].cleared).toBe(true);
 *
 * Only an interval with a delay under 100 ms is captured (the count-up runs at about 30
 * frames a second); any other passes through to the real timer. `captureIntervals(5000)`
 * captures every interval up to 5 s instead (the idle spin of the Home globe runs every 5 s;
 * tell the intervals apart by `ms`). A captured interval returns a numeric id of 7000 and up,
 * and `clearInterval` of that id marks it cleared and does nothing else. Not a test file.
 */
export interface CapturedInterval {
  callback: () => void;
  ms: number;
  id: number;
  cleared: boolean;
}

export interface CapturedIntervals {
  all: CapturedInterval[];
  /** The intervals not yet cleared. */
  live: () => CapturedInterval[];
  /** Runs the callback of interval `index` once, whether or not it was cleared. */
  tick: (index?: number) => void;
}

const FIRST_ID = 7_000;
const FRAME_CEILING_MS = 100;

export function captureIntervals(slowestMs = FRAME_CEILING_MS - 1): CapturedIntervals {
  const all: CapturedInterval[] = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;

  jest.spyOn(globalThis, 'setInterval').mockImplementation(((
    callback: () => void,
    ms?: number,
    ...rest: unknown[]
  ) => {
    if (ms === undefined || ms > slowestMs) return realSet(callback, ms, ...rest);
    const id = FIRST_ID + all.length;
    all.push({ callback, ms, id, cleared: false });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval);

  jest.spyOn(globalThis, 'clearInterval').mockImplementation(((id?: number) => {
    const captured = all.find((interval) => interval.id === id);
    if (captured) captured.cleared = true;
    else realClear(id);
  }) as unknown as typeof clearInterval);

  return {
    all,
    live: () => all.filter((interval) => !interval.cleared),
    tick: (index = 0) => all[index].callback(),
  };
}
