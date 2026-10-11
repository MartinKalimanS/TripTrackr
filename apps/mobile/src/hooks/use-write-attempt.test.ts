/**
 * T460 - FR-020. `useWriteAttempt` is where a screen's local writes are run and their
 * failures shown in words. It is also the one place that knows whether a write went
 * through, so it is where the success haptic of a SAVE and the warning haptic of a
 * destructive CONFIRMATION belong: a haptic that fired before the local write succeeded
 * would say "saved" for a record that is not.
 */
import { act, renderHook } from '@testing-library/react-native';

import type { Haptics } from '@/hooks/use-haptics';
import { Sentry } from '@/lib/sentry';

import { useWriteAttempt } from './use-write-attempt';

jest.mock('@/hooks/use-haptics');
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { useHaptics } = jest.requireMock('@/hooks/use-haptics') as {
  useHaptics: jest.Mock<Haptics, []>;
};
const haptics: Haptics = { selection: jest.fn(), success: jest.fn(), warning: jest.fn() };

const FAILED = 'That could not be saved.';
const fails = () => {
  throw new Error('disk full');
};

beforeEach(() => {
  jest.clearAllMocks();
  useHaptics.mockReturnValue(haptics);
});

const setup = () => renderHook(() => useWriteAttempt(FAILED));

describe('attempt - the plain write', () => {
  test('runs the write, clears a stale error and plays nothing', async () => {
    const { result } = await setup();
    const write = jest.fn();
    let ran = false;
    await act(async () => {
      ran = result.current.attempt(write);
    });
    expect(ran).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(result.current.writeError).toBeNull();
    expect(haptics.success).not.toHaveBeenCalled();
    expect(haptics.warning).not.toHaveBeenCalled();
  });

  test('a throwing write is reported, shown in words and returns false', async () => {
    const { result } = await setup();
    let ran = true;
    await act(async () => {
      ran = result.current.attempt(fails);
    });
    expect(ran).toBe(false);
    expect(result.current.writeError).toBe(FAILED);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('attemptSave - a save plays the success haptic once it has gone through', () => {
  test('plays success AFTER the write, and returns true', async () => {
    const order: string[] = [];
    (haptics.success as jest.Mock).mockImplementationOnce(() => order.push('haptic'));
    const { result } = await setup();
    let saved = false;
    await act(async () => {
      saved = result.current.attemptSave(() => order.push('write'));
    });
    expect(saved).toBe(true);
    expect(order).toEqual(['write', 'haptic']);
    expect(haptics.selection).not.toHaveBeenCalled();
    expect(haptics.warning).not.toHaveBeenCalled();
  });

  test('a failed write plays nothing: the record is not saved', async () => {
    const { result } = await setup();
    let saved = true;
    await act(async () => {
      saved = result.current.attemptSave(fails);
    });
    expect(saved).toBe(false);
    expect(haptics.success).not.toHaveBeenCalled();
    expect(result.current.writeError).toBe(FAILED);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

describe('attemptRemoval - a destructive confirmation plays the warning haptic', () => {
  test('plays warning BEFORE the write, which still runs, and returns true', async () => {
    const order: string[] = [];
    (haptics.warning as jest.Mock).mockImplementationOnce(() => order.push('haptic'));
    const { result } = await setup();
    let removed = false;
    await act(async () => {
      removed = result.current.attemptRemoval(() => order.push('write'));
    });
    expect(removed).toBe(true);
    expect(order).toEqual(['haptic', 'write']);
    expect(haptics.success).not.toHaveBeenCalled();
  });

  test('a failed removal is still reported and shown, and returns false', async () => {
    const { result } = await setup();
    let removed = true;
    await act(async () => {
      removed = result.current.attemptRemoval(fails);
    });
    expect(removed).toBe(false);
    expect(result.current.writeError).toBe(FAILED);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
