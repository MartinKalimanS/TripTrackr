/**
 * T133, T135, T136 — the sync runtime as the signed-in shell wires it.
 *
 * The REAL root layout, `(tabs)` layout, triggers hook and conflict notice run
 * over a real router; the engine, the upload queue and expo-network are
 * doubles. What is pinned is the wiring the unit suites cannot see: the engine
 * and the four triggers are bound for the lifetime of a signed-in shell with an
 * open database and no longer, the first-sync state stands in for the tabs
 * until the engine says the snapshot is in, and a conflict notice shows up
 * wherever the traveller is.
 */
import { act } from '@testing-library/react-native';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SQLite from 'expo-sqlite';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth/session-store';
import { SECURE_KEYS, setSession } from '@/lib/secure-store';
import { useConflictStore } from '@/sync/conflicts';
import { resetFirstLaunch } from '@/sync/triggers';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (component: unknown) => component },
  initSentry: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  migrate: jest.fn(async () => undefined),
}));
jest.mock('expo-network', () => ({
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}));
jest.mock('@/sync/upload-queue', () => ({
  startUploadQueue: jest.fn(),
  kickUploadQueue: jest.fn(),
  countPendingUploads: jest.fn(),
}));
jest.mock('@/sync/engine', () => {
  const { create } = require('zustand') as typeof import('zustand');
  const store = create(() => ({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  }));
  return {
    useSyncStatus: () => store(),
    getSyncStatus: () => store.getState(),
    startSyncEngine: jest.fn(),
    syncNow: jest.fn(),
    countUnsynced: jest.fn(),
    __store: store,
  };
});

const {
  startSyncEngine,
  syncNow,
  __store: statusStore,
} = jest.requireMock('@/sync/engine') as {
  startSyncEngine: jest.Mock;
  syncNow: jest.Mock;
  __store: { setState: (state: Record<string, unknown>) => void };
};
const { startUploadQueue, kickUploadQueue } = jest.requireMock('@/sync/upload-queue') as {
  startUploadQueue: jest.Mock;
  kickUploadQueue: jest.Mock;
};

const secureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: (key: string, value: string) => Promise<void>;
  __reset: () => void;
};
const openDatabaseAsync = SQLite.openDatabaseAsync as jest.Mock;

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

function fakeClient() {
  return {
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql === 'PRAGMA cipher_version' ? { cipher_version: '4.6.1' } : null,
    ),
  };
}

function renderApp() {
  return renderRouter({
    _layout: require('@/app/_layout'),
    '(auth)/_layout': require('@/app/(auth)/_layout'),
    '(auth)/welcome': () => <Text>welcome-screen</Text>,
    '(tabs)/_layout': require('@/app/(tabs)/_layout'),
    '(tabs)/index': () => <Text>home-screen</Text>,
    '(tabs)/trips': () => null,
    '(tabs)/profile': () => null,
    'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
    'trip/[id]/index': () => <Text>trip-screen</Text>,
    'modal/_layout': require('@/app/modal/_layout'),
    'modal/add-trip': () => null,
    '+not-found': () => null,
  });
}

async function signedIn() {
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
  await secureStore.setItemAsync(SECURE_KEYS.dbKey, 'ab'.repeat(32));
}

const stopEngine = jest.fn();
const stopQueue = jest.fn();

function reasons(): string[] {
  return syncNow.mock.calls.map(([reason]) => reason as string);
}

beforeEach(() => {
  secureStore.__reset();
  resetFirstLaunch();
  useSessionStore.setState({ status: 'loading', user: null });
  useConflictStore.getState().clear();
  openDatabaseAsync.mockReset().mockResolvedValue(fakeClient());
  statusStore.setState({
    phase: 'idle',
    firstSyncComplete: false,
    lastSyncedAt: null,
    failure: null,
  });
  startSyncEngine.mockReset().mockReturnValue(stopEngine);
  startUploadQueue.mockReset().mockReturnValue(stopQueue);
  syncNow.mockReset().mockResolvedValue({ ok: false });
  kickUploadQueue.mockReset().mockResolvedValue(undefined);
  stopEngine.mockReset();
  stopQueue.mockReset();
});

describe('the sync runtime is bound to the signed-in shell (T135)', () => {
  test('binds the engine and queue to the traveller’s open database, and asks for the first-launch cycle once', async () => {
    await signedIn();
    await renderApp();

    await waitFor(() => expect(startSyncEngine).toHaveBeenCalledTimes(1));
    expect(startUploadQueue).toHaveBeenCalledTimes(1);
    expect(startUploadQueue.mock.calls[0]![0]).toBe(startSyncEngine.mock.calls[0]![0]);
    expect(reasons().filter((reason) => reason === 'first-launch')).toHaveLength(1);
  });

  test('binds nothing for a signed-out device', async () => {
    await renderApp();

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(startSyncEngine).not.toHaveBeenCalled();
    expect(startUploadQueue).not.toHaveBeenCalled();
    expect(syncNow).not.toHaveBeenCalled();
  });

  test('waits for the database: nothing is bound while the store is still opening', async () => {
    await signedIn();
    let release: (client: ReturnType<typeof fakeClient>) => void = () => undefined;
    openDatabaseAsync.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await renderApp();

    expect(await screen.findByTestId('local-store-opening')).toBeTruthy();
    expect(startSyncEngine).not.toHaveBeenCalled();

    await act(async () => release(fakeClient()));

    await waitFor(() => expect(startSyncEngine).toHaveBeenCalledTimes(1));
  });

  test('signing out unbinds the engine and the queue', async () => {
    await signedIn();
    await renderApp();
    await waitFor(() => expect(startSyncEngine).toHaveBeenCalledTimes(1));
    expect(stopEngine).not.toHaveBeenCalled();

    await act(async () => {
      useSessionStore.getState().signOut();
    });

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(stopEngine).toHaveBeenCalledTimes(1);
    expect(stopQueue).toHaveBeenCalledTimes(1);
  });

  test('the next sign-in gets its own first-launch cycle', async () => {
    await signedIn();
    await renderApp();
    await waitFor(() => expect(reasons()).toEqual(['first-launch']));

    await act(async () => {
      useSessionStore.getState().signOut();
    });
    await screen.findByText('welcome-screen');
    await act(async () => {
      useSessionStore.getState().signIn(profile);
    });

    await waitFor(() =>
      expect(reasons().filter((reason) => reason === 'first-launch')).toHaveLength(2),
    );
  });
});

describe('the first-sync state stands in for the tabs (T136, FR-042)', () => {
  test('a brand-new device sees "syncing your trips", never the empty tabs, until the snapshot is in', async () => {
    await signedIn();
    await renderApp();

    expect(await screen.findByTestId('first-sync-screen')).toBeTruthy();
    expect(screen.queryByText('home-screen')).toBeNull();
    expect(await screen.findByText('Syncing your trips')).toBeTruthy();

    await act(async () => {
      statusStore.setState({ firstSyncComplete: true });
    });

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
  });

  test('offline on a brand-new device says so, and its retry asks the engine for a manual cycle', async () => {
    await signedIn();
    statusStore.setState({ failure: 'offline' });
    await renderApp();

    expect(await screen.findByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('home-screen')).toBeNull();
    syncNow.mockClear();

    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(syncNow).toHaveBeenCalledWith('manual');
  });

  test('a device that already has its data goes straight to the tabs', async () => {
    await signedIn();
    statusStore.setState({ firstSyncComplete: true });
    await renderApp();

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
  });
});

describe('the conflict notice is mounted in the signed-in shell (T133, FR-040)', () => {
  const notice = {
    id: 'n1',
    table: 'notes' as const,
    recordId: 'note-1',
    tripId: 'trip-9',
    summary: 'Your edit to “Night train” was replaced by a newer version.',
    detectedAt: '2026-09-30T10:00:00.000Z',
  };

  test('tells the traveller wherever they are, and can take them to the trip', async () => {
    await signedIn();
    statusStore.setState({ firstSyncComplete: true });
    const app = renderApp();
    await app;
    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('conflict-notices')).toBeNull();

    await act(async () => {
      useConflictStore.getState().raise(notice);
    });

    expect(await screen.findByText(notice.summary)).toBeTruthy();

    await fireEvent.press(screen.getByTestId('conflict-notice-n1-open'));

    expect(await screen.findByText('trip-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/trip/trip-9');
    expect(screen.queryByText(notice.summary)).toBeNull();
  });

  test('is not mounted for a signed-out device', async () => {
    useConflictStore.getState().raise(notice);
    await renderApp();

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(screen.queryByText(notice.summary)).toBeNull();
  });
});
