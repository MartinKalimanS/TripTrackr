/**
 * `useIdleSpin` - the slow turn of the Home globe (feature 005, T537; FR-019; contract C5-24):
 * ONE timer that, while it is allowed, starts the next `linearTo` move every 5 seconds, 20
 * degrees east each time, for at most the 45 seconds of the cap. Which conditions stop it is the
 * pure rule (`test/features/idle-spin.test.ts`); here the hook is shown to follow `enabled`
 * with one timer, to clean it up, to continue where it stopped and never to start again after
 * the cap. The timer is spied through `setInterval` (AGENTS.md: `jest.getTimerCount()` also
 * counts React's own timers).
 */
import { act, renderHook } from '@testing-library/react-native';

import { IDLE_SPIN_MOVES, IdleSpin } from '@/features/globe/idle-spin';
import type { LngLat } from '@/features/globe/great-circle';

import {
  captureIntervals,
  type CapturedIntervals,
} from '../../../../test/helpers/captured-interval';
import { useIdleSpin } from '../use-idle-spin';

let intervals: CapturedIntervals;

const spins = () => intervals.all.filter((interval) => interval.ms === IdleSpin.stepMs);
const liveSpins = () =>
  intervals.live().filter((interval) => interval.ms === IdleSpin.stepMs);
const tickSpin = (index = 0) =>
  act(() => intervals.tick(intervals.all.indexOf(spins()[index]!)));

beforeEach(() => {
  intervals = captureIntervals(IdleSpin.stepMs);
});

afterEach(() => {
  jest.restoreAllMocks();
});

async function setup(initial: { enabled: boolean; origin?: LngLat }) {
  const setCamera = jest.fn();
  const handle = { current: { setCamera } };
  const hook = await renderHook(
    (props: { enabled: boolean; origin: LngLat }) => useIdleSpin({ handle, ...props }),
    { initialProps: { enabled: initial.enabled, origin: initial.origin ?? [10, 48] } },
  );
  return { setCamera, hook };
}

describe('useIdleSpin: one timer that follows `enabled`', () => {
  test('starts no timer while it is not allowed', async () => {
    await setup({ enabled: false });
    expect(spins()).toHaveLength(0);
  });

  test('starts ONE timer of one step when it is allowed, and moves nothing until it fires', async () => {
    const { setCamera } = await setup({ enabled: true });
    expect(spins()).toHaveLength(1);
    expect(liveSpins()).toHaveLength(1);
    expect(setCamera).not.toHaveBeenCalled();
  });

  test('each tick is a linear move one step east of the last, from where the globe opened', async () => {
    const { setCamera } = await setup({ enabled: true, origin: [10, 48] });
    await tickSpin();
    await tickSpin();
    expect(setCamera).toHaveBeenNthCalledWith(1, {
      centerCoordinate: [30, 48],
      animationMode: 'linearTo',
      animationDuration: 5000,
    });
    expect(setCamera).toHaveBeenNthCalledWith(2, {
      centerCoordinate: [50, 48],
      animationMode: 'linearTo',
      animationDuration: 5000,
    });
  });

  test('clears its timer the moment it is not allowed, and starts exactly one more when it is again', async () => {
    const { hook } = await setup({ enabled: true });
    await hook.rerender({ enabled: false, origin: [10, 48] });
    expect(liveSpins()).toHaveLength(0);
    await hook.rerender({ enabled: true, origin: [10, 48] });
    expect(spins()).toHaveLength(2);
    expect(liveSpins()).toHaveLength(1);
  });

  test('carries on from where it stopped, not from the start', async () => {
    const { setCamera, hook } = await setup({ enabled: true, origin: [10, 48] });
    await tickSpin(0);
    await hook.rerender({ enabled: false, origin: [10, 48] });
    await hook.rerender({ enabled: true, origin: [10, 48] });
    await tickSpin(1);
    expect(setCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerCoordinate: [50, 48] }),
    );
  });

  test('clears its timer when Home goes away', async () => {
    const { hook } = await setup({ enabled: true });
    await hook.unmount();
    expect(liveSpins()).toHaveLength(0);
  });

  test('turns about the new centre when the globe\u2019s centre moves (the first stop appeared)', async () => {
    const { setCamera, hook } = await setup({ enabled: true, origin: [0, 20] });
    await hook.rerender({ enabled: true, origin: [12.5, 41.9] });
    await tickSpin();
    expect(setCamera).toHaveBeenLastCalledWith(
      expect.objectContaining({ centerCoordinate: [32.5, 41.9] }),
    );
  });
});

describe('useIdleSpin: the 45 second cap (FR-019)', () => {
  test('makes the moves that end within the cap and clears its timer with the last', async () => {
    const { setCamera } = await setup({ enabled: true, origin: [0, 0] });
    for (let move = 0; move < IDLE_SPIN_MOVES - 1; move += 1) await tickSpin();
    expect(liveSpins()).toHaveLength(1);
    await tickSpin();
    expect(setCamera).toHaveBeenCalledTimes(IDLE_SPIN_MOVES);
    expect(liveSpins()).toHaveLength(0);
  });

  test('a callback that still arrives after the cap moves nothing', async () => {
    const { setCamera } = await setup({ enabled: true, origin: [0, 0] });
    for (let move = 0; move <= IDLE_SPIN_MOVES; move += 1) await tickSpin();
    expect(setCamera).toHaveBeenCalledTimes(IDLE_SPIN_MOVES);
  });

  test('never starts again after the cap, however often it is allowed', async () => {
    const { hook } = await setup({ enabled: true, origin: [0, 0] });
    for (let move = 0; move <= IDLE_SPIN_MOVES; move += 1) await tickSpin();
    await hook.rerender({ enabled: false, origin: [0, 0] });
    await hook.rerender({ enabled: true, origin: [0, 0] });
    expect(liveSpins()).toHaveLength(0);
  });

  test('counts the time it turned, not the time it was held still', async () => {
    const { setCamera, hook } = await setup({ enabled: true, origin: [0, 0] });
    for (let move = 0; move < 3; move += 1) await tickSpin(0);
    await hook.rerender({ enabled: false, origin: [0, 0] });
    await hook.rerender({ enabled: true, origin: [0, 0] });
    for (let move = 0; move < IDLE_SPIN_MOVES - 3; move += 1) await tickSpin(1);
    expect(setCamera).toHaveBeenCalledTimes(IDLE_SPIN_MOVES);
  });
});

describe('useIdleSpin: a globe that is not there', () => {
  test('does not throw when the map has no camera to move', async () => {
    const handle = { current: null };
    await renderHook(() => useIdleSpin({ handle, origin: [0, 0], enabled: true }));
    await tickSpin();
    expect(liveSpins()).toHaveLength(1);
  });

  test('a tick with no camera does not use up the allowance of the 45 seconds', async () => {
    const setCamera = jest.fn();
    const handle: { current: { setCamera: jest.Mock } | null } = { current: null };
    await renderHook(() => useIdleSpin({ handle, origin: [0, 0], enabled: true }));
    for (let tick = 0; tick < IDLE_SPIN_MOVES + 2; tick += 1) await tickSpin();
    expect(liveSpins()).toHaveLength(1);
    handle.current = { setCamera };
    for (let move = 0; move < IDLE_SPIN_MOVES; move += 1) await tickSpin();
    expect(setCamera).toHaveBeenCalledTimes(IDLE_SPIN_MOVES);
  });
});
