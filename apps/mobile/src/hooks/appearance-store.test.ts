/**
 * Feature 004, T461 follow-up: the module-level store behind `useAppearance` (contract
 * C4-4). It holds the accessibility flags once for the whole app, starts its native
 * subscription when the first listener arrives and tears it down when the last one leaves.
 *
 * `use-appearance-shared.test.tsx` proves what N mounted components cost; this file pins the
 * store's own rules without React: ref counting, snapshot identity, the failure fallbacks,
 * and that an answer from a session that no longer exists is dropped.
 */
import { AccessibilityInfo, Platform } from 'react-native';

import {
  __resetAppearanceStoreForTests,
  getAppearanceServerSnapshot,
  getAppearanceSnapshot,
  subscribeToAppearance,
} from './appearance-store';

// The contrast reader decides the theme, so a test can make the WHOLE read fail through it.
// It wraps the real reader; `beforeEach` points it back at it.
jest.mock('@/theme/accessibility', () => {
  const actual = jest.requireActual('@/theme/accessibility');
  return { ...actual, readPrefersMoreContrast: jest.fn() };
});

const { readPrefersMoreContrast } = jest.requireMock('@/theme/accessibility') as {
  readPrefersMoreContrast: jest.Mock;
};
const realReadPrefersMoreContrast = (
  jest.requireActual('@/theme/accessibility') as typeof import('@/theme/accessibility')
).readPrefersMoreContrast;

interface Registration {
  event: string;
  handler: () => void;
  remove: jest.Mock;
}

let registrations: Registration[];
let flags: { darker: boolean; motion: boolean; transparency: boolean };
let os: ReturnType<typeof jest.replaceProperty>;

beforeEach(() => {
  registrations = [];
  flags = { darker: false, motion: false, transparency: false };
  readPrefersMoreContrast.mockImplementation(realReadPrefersMoreContrast);
  os = jest.replaceProperty(Platform, 'OS', 'ios');
  Object.assign(AccessibilityInfo, {
    isDarkerSystemColorsEnabled: jest.fn(async () => flags.darker),
  });
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    handler: () => void,
  ) => {
    const remove = jest.fn();
    registrations.push({ event, handler, remove });
    return { remove };
  }) as never);
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockImplementation(async () => flags.motion);
  jest
    .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
    .mockImplementation(async () => flags.transparency);
});

afterEach(() => {
  __resetAppearanceStoreForTests();
  jest.restoreAllMocks();
  os.restore();
  delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
    .isDarkerSystemColorsEnabled;
  delete (AccessibilityInfo as { isHighTextContrastEnabled?: unknown })
    .isHighTextContrastEnabled;
});

/** Lets every pending native read settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The OS fires its change events and the reads they start settle. */
async function fireEvents() {
  registrations.forEach(({ handler }) => handler());
  await settle();
}

/** A query a test answers by hand, installed on iOS "Increase Contrast". */
function pendingContrast() {
  let answer: { resolve: (value: boolean) => void; reject: (error: Error) => void };
  const promise = new Promise<boolean>((resolve, reject) => {
    answer = { resolve, reject };
  });
  Object.assign(AccessibilityInfo, {
    isDarkerSystemColorsEnabled: jest.fn(() => promise),
  });
  return {
    resolve: (value: boolean) => answer.resolve(value),
    reject: (error: Error) => answer.reject(error),
  };
}

/**
 * Every call of iOS "Increase Contrast" returns a promise of its own that the test settles by
 * hand, in call order: `reads[0]` is the first read's, `reads[1]` the next one's.
 */
function controlledContrastReads() {
  const reads: { resolve: (value: boolean) => void; reject: (error: Error) => void }[] =
    [];
  Object.assign(AccessibilityInfo, {
    isDarkerSystemColorsEnabled: jest.fn(
      () =>
        new Promise<boolean>((resolve, reject) => {
          reads.push({ resolve, reject });
        }),
    ),
  });
  return reads;
}

describe('before anyone subscribes', () => {
  test('the snapshot is the unread default and nothing has been registered or read', () => {
    expect(getAppearanceSnapshot()).toEqual({
      prefersMoreContrast: false,
      prefersLessMotion: false,
      prefersLessTransparency: false,
      ready: false,
    });
    expect(AccessibilityInfo.addEventListener).not.toHaveBeenCalled();
    expect(AccessibilityInfo.isReduceMotionEnabled).not.toHaveBeenCalled();
  });

  test('the server snapshot is the unread default, and the same object every time', () => {
    expect(getAppearanceServerSnapshot()).toBe(getAppearanceServerSnapshot());
    expect(getAppearanceServerSnapshot()).toEqual(getAppearanceSnapshot());
  });

  test('the snapshot is frozen: a consumer cannot mutate what every other one reads', () => {
    expect(Object.isFrozen(getAppearanceSnapshot())).toBe(true);
  });
});

describe('ref counting', () => {
  test('starts once for the first listener, however many follow', async () => {
    const unsubscribers = Array.from({ length: 25 }, () =>
      subscribeToAppearance(() => undefined),
    );
    await settle();

    expect(registrations).toHaveLength(3);
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.isDarkerSystemColorsEnabled).toHaveBeenCalledTimes(1);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  test('tears down only when the LAST listener leaves, removing every subscription once', () => {
    const first = subscribeToAppearance(() => undefined);
    const second = subscribeToAppearance(() => undefined);

    first();
    expect(registrations.some(({ remove }) => remove.mock.calls.length > 0)).toBe(false);

    second();
    expect(registrations.map(({ remove }) => remove.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
  });

  test('unsubscribing twice counts once: a stray second call cannot tear down others', () => {
    const first = subscribeToAppearance(() => undefined);
    const second = subscribeToAppearance(() => undefined);

    first();
    first();

    expect(registrations.some(({ remove }) => remove.mock.calls.length > 0)).toBe(false);
    second();
    expect(registrations.every(({ remove }) => remove.mock.calls.length === 1)).toBe(
      true,
    );
  });

  test('the same function subscribed twice is two subscribers, each with its own unsubscribe', () => {
    const listener = jest.fn();
    const first = subscribeToAppearance(listener);
    const second = subscribeToAppearance(listener);

    first();
    expect(registrations.some(({ remove }) => remove.mock.calls.length > 0)).toBe(false);
    second();
    expect(registrations.every(({ remove }) => remove.mock.calls.length === 1)).toBe(
      true,
    );
  });

  test('a restart registers fresh listeners and reads again', async () => {
    subscribeToAppearance(() => undefined)();
    const restarted = subscribeToAppearance(() => undefined);
    await settle();

    expect(registrations).toHaveLength(6);
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(2);
    restarted();
  });

  test('a restart begins from the unread default: what was read is not vouched for any more', async () => {
    flags.darker = true;
    const first = subscribeToAppearance(() => undefined);
    await settle();
    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );

    first();

    expect(getAppearanceSnapshot()).toEqual({
      prefersMoreContrast: false,
      prefersLessMotion: false,
      prefersLessTransparency: false,
      ready: false,
    });
  });

  test('reads the platform when it starts, not when the module loads', async () => {
    os.restore();
    os = jest.replaceProperty(Platform, 'OS', 'android');
    Object.assign(AccessibilityInfo, {
      isHighTextContrastEnabled: jest.fn(async () => true),
    });

    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(registrations.map(({ event }) => event).sort()).toEqual([
      'highTextContrastChanged',
      'reduceMotionChanged',
    ]);
    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({
        prefersMoreContrast: true,
        prefersLessTransparency: false,
      }),
    );
    unsubscribe();
  });

  test('a platform with no accessibility events registers nothing and still settles `ready`', async () => {
    os.restore();
    // Not a platform the app ships on: whatever it is, the mapping has no event for it.
    os = jest.replaceProperty(Platform, 'OS', 'unknown-os' as never);

    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(registrations).toHaveLength(0);
    expect(getAppearanceSnapshot().ready).toBe(true);
    unsubscribe();
  });
});

describe('notification and snapshot identity', () => {
  test('every listener is told once when the first read settles, and the snapshot is new', async () => {
    const listeners = [jest.fn(), jest.fn(), jest.fn()];
    const before = getAppearanceSnapshot();
    const unsubscribers = listeners.map((listener) => subscribeToAppearance(listener));
    await settle();

    listeners.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1));
    expect(getAppearanceSnapshot()).not.toBe(before);
    expect(getAppearanceSnapshot().ready).toBe(true);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  test('the snapshot is the SAME object between reads while nothing changed', async () => {
    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(getAppearanceSnapshot()).toBe(getAppearanceSnapshot());
    unsubscribe();
  });

  test('a change event that re-reports the same values tells nobody and keeps the object', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAppearance(listener);
    await settle();
    const settled = getAppearanceSnapshot();
    listener.mockClear();

    await fireEvents();
    await fireEvents();

    expect(listener).not.toHaveBeenCalled();
    expect(getAppearanceSnapshot()).toBe(settled);
    unsubscribe();
  });

  test('a changed signal tells every listener once and swaps in a new object', async () => {
    const listeners = [jest.fn(), jest.fn()];
    const unsubscribers = listeners.map((listener) => subscribeToAppearance(listener));
    await settle();
    const settled = getAppearanceSnapshot();
    listeners.forEach((listener) => listener.mockClear());

    flags.motion = true;
    await fireEvents();

    listeners.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1));
    expect(getAppearanceSnapshot()).not.toBe(settled);
    expect(getAppearanceSnapshot()).toEqual({ ...settled, prefersLessMotion: true });
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  test('a listener that leaves while it is being told does not stop the others hearing it', async () => {
    const heard = jest.fn();
    const leaving: { unsubscribe?: () => void } = {};
    leaving.unsubscribe = subscribeToAppearance(() => leaving.unsubscribe?.());
    const second = subscribeToAppearance(heard);

    await settle();

    expect(heard).toHaveBeenCalledTimes(1);
    second();
  });

  test('a listener removed by an earlier one in the same round is not called', async () => {
    const removed = jest.fn();
    const after = jest.fn();
    const remover: { removeSecond?: () => void } = {};
    const first = subscribeToAppearance(() => remover.removeSecond?.());
    remover.removeSecond = subscribeToAppearance(removed);
    const third = subscribeToAppearance(after);

    await settle();

    expect(removed).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    first();
    third();
  });

  test('a listener subscribed during a round hears the next one, not this one', async () => {
    const newcomer = jest.fn();
    let joined = false;
    const first = subscribeToAppearance(() => {
      if (joined) return;
      joined = true;
      subscribeToAppearance(newcomer);
    });

    await settle();
    expect(newcomer).not.toHaveBeenCalled();
    // The newcomer joined the running session: no second one was started for it.
    expect(registrations).toHaveLength(3);

    flags.motion = true;
    await fireEvents();

    expect(newcomer).toHaveBeenCalledTimes(1);
    first();
  });

  test('a listener that throws does not starve the rest, and its error is reported, not swallowed', async () => {
    const reported: (() => void)[] = [];
    jest.spyOn(globalThis, 'queueMicrotask').mockImplementation((task) => {
      reported.push(task);
    });
    const failure = new Error('a consumer failed while rendering');
    const before = jest.fn();
    const after = jest.fn();
    const unsubscribers = [
      subscribeToAppearance(before),
      subscribeToAppearance(() => {
        throw failure;
      }),
      subscribeToAppearance(after),
    ];

    await settle();

    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    // The new snapshot is in place for everyone, and the error surfaces on its own tick.
    expect(getAppearanceSnapshot().ready).toBe(true);
    expect(reported).toHaveLength(1);
    expect(() => reported[0]()).toThrow(failure);
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  });

  test('a late listener reads the CURRENT value straight away, with no second read', async () => {
    flags.motion = true;
    const first = subscribeToAppearance(() => undefined);
    await settle();

    const late = subscribeToAppearance(() => undefined);

    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersLessMotion: true }),
    );
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    first();
    late();
  });
});

describe('`ready` and the failure fallbacks (contract C4, research D4-05)', () => {
  test('stays false for as long as a query never answers', async () => {
    pendingContrast();
    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(getAppearanceSnapshot().ready).toBe(false);
    unsubscribe();
  });

  test('a rejected platform query reads as the MORE accessible value, and settles `ready`', async () => {
    Object.assign(AccessibilityInfo, {
      isDarkerSystemColorsEnabled: jest
        .fn()
        .mockRejectedValue(new Error('the accessibility service is not available')),
    });
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockRejectedValue(new Error('unavailable'));
    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockRejectedValue(new Error('unavailable'));

    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(getAppearanceSnapshot()).toEqual({
      prefersMoreContrast: true,
      prefersLessMotion: true,
      prefersLessTransparency: true,
      ready: true,
    });
    unsubscribe();
  });

  test('the whole read failing settles `ready` and keeps the flags there were', async () => {
    readPrefersMoreContrast.mockRejectedValue(new Error('unexpected'));
    const listener = jest.fn();

    const unsubscribe = subscribeToAppearance(listener);
    await settle();

    expect(getAppearanceSnapshot()).toEqual({
      prefersMoreContrast: false,
      prefersLessMotion: false,
      prefersLessTransparency: false,
      ready: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('a later read failing as a whole keeps the last answer, and tells nobody', async () => {
    flags.darker = true;
    const listener = jest.fn();
    const unsubscribe = subscribeToAppearance(listener);
    await settle();
    listener.mockClear();

    readPrefersMoreContrast.mockRejectedValue(new Error('unexpected'));
    await fireEvents();

    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('is never reset by a later change event whose read has not answered', async () => {
    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();
    pendingContrast();

    await fireEvents();

    expect(getAppearanceSnapshot().ready).toBe(true);
    unsubscribe();
  });
});

describe('overlapping reads: the newest read wins', () => {
  test('an older read that answers last cannot overwrite the newer answer', async () => {
    const reads = controlledContrastReads();
    const listener = jest.fn();
    const unsubscribe = subscribeToAppearance(listener);
    registrations[0].handler();
    expect(reads).toHaveLength(2);

    reads[1].resolve(true);
    await settle();
    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );

    reads[0].resolve(false);
    await settle();

    expect(getAppearanceSnapshot().prefersMoreContrast).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('`ready` settles from the newest read while the first is still pending', async () => {
    const reads = controlledContrastReads();
    const unsubscribe = subscribeToAppearance(() => undefined);
    registrations[0].handler();

    reads[1].resolve(false);
    await settle();

    expect(getAppearanceSnapshot().ready).toBe(true);
    unsubscribe();
  });

  test('an older read that answers while a newer one is pending publishes nothing yet', async () => {
    const reads = controlledContrastReads();
    const listener = jest.fn();
    const unsubscribe = subscribeToAppearance(listener);
    registrations[0].handler();

    reads[0].resolve(true);
    await settle();

    expect(getAppearanceSnapshot().ready).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    reads[1].resolve(true);
    await settle();
    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );
    unsubscribe();
  });

  test('when the newest read falls back, the older read answering later does not undo it', async () => {
    const reads = controlledContrastReads();
    const unsubscribe = subscribeToAppearance(() => undefined);
    registrations[0].handler();

    reads[1].reject(new Error('the accessibility service is not available'));
    await settle();
    // The platform query failed: the MORE accessible value, and `ready` settled.
    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: true }),
    );

    reads[0].resolve(false);
    await settle();

    expect(getAppearanceSnapshot().prefersMoreContrast).toBe(true);
    unsubscribe();
  });

  test('when the newest read fails as a whole, `ready` still settles and an older answer is dropped', async () => {
    const reads = controlledContrastReads();
    const unsubscribe = subscribeToAppearance(() => undefined);
    readPrefersMoreContrast.mockRejectedValueOnce(new Error('unexpected'));
    registrations[0].handler();
    await settle();
    expect(getAppearanceSnapshot().ready).toBe(true);
    const settled = getAppearanceSnapshot();

    reads[0].resolve(!settled.prefersMoreContrast);
    await settle();

    expect(getAppearanceSnapshot()).toBe(settled);
    unsubscribe();
  });

  test('reads in strict sequence each publish: the newest is always the last one in', async () => {
    const reads = controlledContrastReads();
    const unsubscribe = subscribeToAppearance(() => undefined);
    reads[0].resolve(false);
    await settle();
    registrations[0].handler();
    reads[1].resolve(true);
    await settle();

    expect(getAppearanceSnapshot().prefersMoreContrast).toBe(true);
    unsubscribe();
  });
});

describe('an answer from a session that no longer exists is dropped', () => {
  test('a read that settles after the last listener left changes nothing and tells nobody', async () => {
    const contrast = pendingContrast();
    const listener = jest.fn();
    subscribeToAppearance(listener)();

    contrast.resolve(true);
    await settle();

    expect(getAppearanceSnapshot().prefersMoreContrast).toBe(false);
    expect(getAppearanceSnapshot().ready).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  test('nor does a late REJECTION of such a read', async () => {
    const contrast = pendingContrast();
    const listener = jest.fn();
    subscribeToAppearance(listener)();

    contrast.reject(new Error('late'));
    await settle();

    expect(getAppearanceSnapshot().ready).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  test('a read of the previous session does not settle the next one', async () => {
    const stale = pendingContrast();
    subscribeToAppearance(() => undefined)();
    Object.assign(AccessibilityInfo, {
      isDarkerSystemColorsEnabled: jest.fn(async () => false),
    });
    const unsubscribe = subscribeToAppearance(() => undefined);

    stale.resolve(true);
    await settle();

    expect(getAppearanceSnapshot()).toEqual(
      expect.objectContaining({ ready: true, prefersMoreContrast: false }),
    );
    unsubscribe();
  });

  test('a change event handler left over from a torn-down session starts no read', async () => {
    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();
    unsubscribe();
    const reads = jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mock.calls.length;

    await fireEvents();

    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(reads);
  });
});

describe('__resetAppearanceStoreForTests', () => {
  test('removes the native subscriptions, forgets every listener and the snapshot', async () => {
    const listener = jest.fn();
    subscribeToAppearance(listener);
    flags.darker = true;
    await settle();
    listener.mockClear();

    __resetAppearanceStoreForTests();

    expect(registrations.every(({ remove }) => remove.mock.calls.length === 1)).toBe(
      true,
    );
    expect(getAppearanceSnapshot()).toEqual(getAppearanceServerSnapshot());
    await fireEvents();
    expect(listener).not.toHaveBeenCalled();
  });

  test('is safe to call with nothing running, and a later subscribe starts cleanly', async () => {
    __resetAppearanceStoreForTests();
    __resetAppearanceStoreForTests();

    const unsubscribe = subscribeToAppearance(() => undefined);
    await settle();

    expect(registrations).toHaveLength(3);
    expect(getAppearanceSnapshot().ready).toBe(true);
    unsubscribe();
  });

  test('an unsubscribe from before the reset cannot tear down a session started after it', () => {
    const before = subscribeToAppearance(() => undefined);
    __resetAppearanceStoreForTests();
    const after = subscribeToAppearance(() => undefined);

    before();

    expect(
      registrations.slice(3).some(({ remove }) => remove.mock.calls.length > 0),
    ).toBe(false);
    after();
  });
});
