/**
 * T135 — the four sync triggers (sync-protocol.md §3; FR-038).
 *
 * The engine, the upload queue and expo-network are doubles: what is pinned
 * here is WHEN `syncNow` is asked for and with which reason — the 30 s
 * foreground timer, an offline → online transition, the app coming to the
 * foreground, and the first launch after a sign-in — and that none of them can
 * stack, leak, or outlive the signed-in shell.
 */
import { AppState, type AppStateStatus } from 'react-native';

import type { AppDatabase } from '@/db/client';
import { Sentry } from '@/lib/sentry';
import { startSyncEngine, syncNow } from '@/sync/engine';
import { SYNC_INTERVAL_MS, resetFirstLaunch, startSyncTriggers } from '@/sync/triggers';
import { kickUploadQueue, startUploadQueue } from '@/sync/upload-queue';

jest.mock('@/lib/sentry', () => ({ Sentry: { captureException: jest.fn() } }));
jest.mock('@/sync/engine', () => ({ startSyncEngine: jest.fn(), syncNow: jest.fn() }));
jest.mock('@/sync/upload-queue', () => ({
  startUploadQueue: jest.fn(),
  kickUploadQueue: jest.fn(),
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(),
  getNetworkStateAsync: jest.fn(),
}));

const Network = jest.requireMock('expo-network') as {
  addNetworkStateListener: jest.Mock;
  getNetworkStateAsync: jest.Mock;
};

type NetworkEvent = { isConnected?: boolean; isInternetReachable?: boolean };

const db = { tag: 'db' } as unknown as AppDatabase;
const USER = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';

const ONLINE: NetworkEvent = { isConnected: true, isInternetReachable: true };
const OFFLINE: NetworkEvent = { isConnected: false, isInternetReachable: false };

const stopEngine = jest.fn();
const stopQueue = jest.fn();
const removeApp = jest.fn();
const removeNetwork = jest.fn();

let emitApp: (state: AppStateStatus) => void;
let emitNetwork: (event: NetworkEvent) => void;

const originalCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState')!;

function setAppState(state: AppStateStatus) {
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
}

/** Let the seed `getNetworkStateAsync()` promise settle. */
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function start(seed: NetworkEvent | Error = ONLINE, userId = USER) {
  if (seed instanceof Error) Network.getNetworkStateAsync.mockRejectedValue(seed);
  else Network.getNetworkStateAsync.mockResolvedValue(seed);
  return startSyncTriggers({ db, userId });
}

beforeEach(() => {
  jest.useFakeTimers();
  resetFirstLaunch();
  setAppState('active');

  (startSyncEngine as jest.Mock).mockReturnValue(stopEngine);
  (startUploadQueue as jest.Mock).mockReturnValue(stopQueue);
  (syncNow as jest.Mock).mockResolvedValue({ ok: true });
  (kickUploadQueue as jest.Mock).mockResolvedValue(undefined);

  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    emitApp = listener as (state: AppStateStatus) => void;
    return { remove: removeApp } as unknown as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  Network.addNetworkStateListener.mockImplementation(
    (listener: (event: NetworkEvent) => void) => {
      emitNetwork = listener;
      return { remove: removeNetwork };
    },
  );
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  Object.defineProperty(AppState, 'currentState', originalCurrentState);
  for (const mock of [stopEngine, stopQueue, removeApp, removeNetwork]) mock.mockReset();
  Network.addNetworkStateListener.mockReset();
  Network.getNetworkStateAsync.mockReset();
});

function reasons(): string[] {
  return (syncNow as jest.Mock).mock.calls.map(([reason]) => reason as string);
}

describe('binding the engine and the upload queue', () => {
  test('binds both to the signed-in traveller’s database for as long as the triggers run', async () => {
    const stop = start();
    await flush();

    expect(startSyncEngine).toHaveBeenCalledWith(db);
    expect(startUploadQueue).toHaveBeenCalledWith(db);
    expect(stopEngine).not.toHaveBeenCalled();
    expect(stopQueue).not.toHaveBeenCalled();

    stop();

    expect(stopEngine).toHaveBeenCalledTimes(1);
    expect(stopQueue).toHaveBeenCalledTimes(1);
  });

  test('binds the engine before the first cycle is requested', async () => {
    start();
    await flush();

    const bind = (startSyncEngine as jest.Mock).mock.invocationCallOrder[0]!;
    const firstCycle = (syncNow as jest.Mock).mock.invocationCallOrder[0]!;
    expect(bind).toBeLessThan(firstCycle);
  });
});

describe('first launch after sign-in', () => {
  test('asks for one full-snapshot cycle, and resumes any uploads an earlier run left', async () => {
    start();
    await flush();

    expect(reasons()).toEqual(['first-launch']);
    expect(kickUploadQueue).toHaveBeenCalledWith('first-launch');
  });

  test('fires exactly once per sign-in, however often the shell restarts the triggers', async () => {
    start()();
    start()();
    await flush();

    expect(reasons().filter((reason) => reason === 'first-launch')).toHaveLength(1);
  });

  test('fires again for the next sign-in of the same traveller', async () => {
    start()();
    resetFirstLaunch();
    start();
    await flush();

    expect(reasons().filter((reason) => reason === 'first-launch')).toHaveLength(2);
  });

  test('fires again when a different traveller signs in', async () => {
    start(ONLINE, USER)();
    start(ONLINE, 'another-traveller');
    await flush();

    expect(reasons().filter((reason) => reason === 'first-launch')).toHaveLength(2);
  });
});

describe('the 30 second foreground timer', () => {
  test('requests a cycle every 30 seconds and not before', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    jest.advanceTimersByTime(SYNC_INTERVAL_MS - 1);
    expect(reasons()).toEqual([]);

    jest.advanceTimersByTime(1);
    expect(reasons()).toEqual(['timer']);

    jest.advanceTimersByTime(SYNC_INTERVAL_MS * 2);
    expect(reasons()).toEqual(['timer', 'timer', 'timer']);
  });

  test('the interval is 30 seconds (sync-protocol.md §3)', () => {
    expect(SYNC_INTERVAL_MS).toBe(30_000);
  });

  test('pauses in the background and resumes, freshly, on foreground', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitApp('background');
    jest.advanceTimersByTime(SYNC_INTERVAL_MS * 4);
    expect(reasons()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);

    emitApp('active');
    expect(reasons()).toEqual(['foreground']);

    jest.advanceTimersByTime(SYNC_INTERVAL_MS - 1);
    expect(reasons()).toEqual(['foreground']);
    jest.advanceTimersByTime(1);
    expect(reasons()).toEqual(['foreground', 'timer']);
  });

  test('never stacks timers, however often the app reports the same state', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitApp('active');
    emitApp('active');
    emitApp('background');
    emitApp('background');
    emitApp('inactive');
    emitApp('active');
    emitApp('active');

    expect(jest.getTimerCount()).toBe(1);
    (syncNow as jest.Mock).mockClear();
    jest.advanceTimersByTime(SYNC_INTERVAL_MS);
    expect(reasons()).toEqual(['timer']);
  });

  test('does not start one when the app launches in the background', async () => {
    setAppState('background');
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    jest.advanceTimersByTime(SYNC_INTERVAL_MS * 3);
    expect(reasons()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);

    emitApp('active');
    expect(jest.getTimerCount()).toBe(1);
  });
});

describe('app foregrounded', () => {
  test('asks for a cycle and nudges the upload queue on the way back in', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();
    (kickUploadQueue as jest.Mock).mockClear();

    emitApp('background');
    emitApp('active');

    expect(reasons()).toEqual(['foreground']);
    expect(kickUploadQueue).toHaveBeenCalledWith('foreground');
  });

  test('a repeated active report is not a second foregrounding', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitApp('active');

    expect(reasons()).toEqual([]);
  });

  test('coming back from the iOS app switcher counts', async () => {
    start();
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitApp('inactive');
    emitApp('active');

    expect(reasons()).toEqual(['foreground']);
  });
});

describe('connectivity restored', () => {
  test('an offline → online transition asks for a cycle immediately, and nudges the queue', async () => {
    start(ONLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();
    (kickUploadQueue as jest.Mock).mockClear();

    emitNetwork(OFFLINE);
    expect(reasons()).toEqual([]);

    emitNetwork(ONLINE);
    expect(reasons()).toEqual(['reconnect']);
    expect(kickUploadQueue).toHaveBeenCalledWith('reconnect');
  });

  test('fires on the transition only, not on every event', async () => {
    start(ONLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork(ONLINE);
    emitNetwork({ isConnected: true, isInternetReachable: true });
    emitNetwork(OFFLINE);
    emitNetwork(OFFLINE);
    expect(reasons()).toEqual([]);

    emitNetwork(ONLINE);
    emitNetwork(ONLINE);
    expect(reasons()).toEqual(['reconnect']);
  });

  test('a launch that begins offline syncs the moment it comes online', async () => {
    start(OFFLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork(ONLINE);

    expect(reasons()).toEqual(['reconnect']);
  });

  test('a connection with no route to the internet is offline, not online', async () => {
    start(ONLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork({ isConnected: true, isInternetReachable: false });
    emitNetwork(ONLINE);

    expect(reasons()).toEqual(['reconnect']);
  });

  test('a connected network that has not reported reachability yet is online', async () => {
    start(OFFLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork({ isConnected: true });

    expect(reasons()).toEqual(['reconnect']);
  });

  test('an event with nothing in it is offline', async () => {
    start(ONLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork({});
    emitNetwork(ONLINE);

    expect(reasons()).toEqual(['reconnect']);
  });

  test('an event that arrives before the initial reading wins over it', async () => {
    Network.getNetworkStateAsync.mockResolvedValue(ONLINE);
    startSyncTriggers({ db, userId: USER });
    // The platform's event is newer than the read that is still in flight.
    emitNetwork(OFFLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork(ONLINE);

    expect(reasons()).toEqual(['reconnect']);
  });

  test('a first reading of "online" followed by "online" is not a reconnect', async () => {
    start(ONLINE);
    await flush();
    (syncNow as jest.Mock).mockClear();

    emitNetwork(ONLINE);

    expect(reasons()).toEqual([]);
  });

  test('an unreadable initial state is reported, and later events still work', async () => {
    const failure = new Error('network module unavailable');
    start(failure);
    await flush();
    (syncNow as jest.Mock).mockClear();

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);

    emitNetwork(OFFLINE);
    emitNetwork(ONLINE);
    expect(reasons()).toEqual(['reconnect']);
  });
});

describe('stopping', () => {
  test('clears the timer, removes both listeners, and unbinds', async () => {
    const stop = start();
    await flush();
    expect(jest.getTimerCount()).toBe(1);

    stop();

    expect(jest.getTimerCount()).toBe(0);
    expect(removeApp).toHaveBeenCalledTimes(1);
    expect(removeNetwork).toHaveBeenCalledTimes(1);
    expect(stopEngine).toHaveBeenCalledTimes(1);
    expect(stopQueue).toHaveBeenCalledTimes(1);
  });

  test('a late event or a late reading after stopping asks for nothing', async () => {
    let resolveSeed: (event: NetworkEvent) => void = () => undefined;
    Network.getNetworkStateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveSeed = resolve;
      }),
    );
    const stop = startSyncTriggers({ db, userId: USER });
    await flush();
    (syncNow as jest.Mock).mockClear();
    (kickUploadQueue as jest.Mock).mockClear();

    stop();
    emitNetwork(OFFLINE);
    emitNetwork(ONLINE);
    emitApp('background');
    emitApp('active');
    resolveSeed(OFFLINE);
    await flush();
    jest.advanceTimersByTime(SYNC_INTERVAL_MS * 2);

    expect(reasons()).toEqual([]);
    expect(kickUploadQueue).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('stopping twice unbinds once', async () => {
    const stop = start();
    await flush();

    stop();
    stop();

    expect(stopEngine).toHaveBeenCalledTimes(1);
    expect(removeNetwork).toHaveBeenCalledTimes(1);
  });
});

describe('a cycle or a nudge that fails', () => {
  test('is reported, never thrown into the timer or the listener', async () => {
    const failure = new Error('engine exploded');
    (syncNow as jest.Mock).mockRejectedValue(failure);
    (kickUploadQueue as jest.Mock).mockRejectedValue(failure);

    start();
    await flush();
    emitApp('background');
    emitApp('active');
    await flush();

    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
    expect((Sentry.captureException as jest.Mock).mock.calls.length).toBeGreaterThan(1);
  });
});
