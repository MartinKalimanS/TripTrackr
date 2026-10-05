/**
 * T136, T137 against the REAL engine and a REAL database — sync-protocol.md §6
 * scenarios 7 and 11.
 *
 * The unit suites double the engine, which proves the runtime calls it the way
 * it was told to. This one checks it was told right: the first-sync gate and
 * the sign-out guard run over `startSyncEngine` and the SQLite harness
 * (test/db/sqlite-harness.ts), with only the network replaced (and the upload
 * queue's kick, which would reach for the object store). What the engine says
 * about a new device, an offline one, and a device that already holds rows is
 * what the traveller sees; what it counts is what the guard warns about.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import { FirstSyncGate } from '@/components/sync/first-sync-gate';
import { LocalStoreProvider, type AppDatabase } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { UnsyncedChangesError, useSignOut } from '@/features/auth/use-sign-out';
import { apiFetch } from '@/lib/api-client';
import { getSession, setSession } from '@/lib/secure-store';
import { useConflictStore } from '@/sync/conflicts';
import { countUnsynced, getSyncStatus, startSyncEngine, syncNow } from '@/sync/engine';
import { useSyncWarningsStore } from '@/sync/warnings';

import {
  at,
  createTestDatabase,
  pullPage,
  seed,
  seedTrip,
  uuid,
  type TestSqlite,
} from './sync-core-fixtures';
import { networkError, routeApi } from './sync-core-network';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  initSentry: jest.fn(),
}));
jest.mock('@/lib/api-client', () => ({
  ...jest.requireActual('@/lib/api-client'),
  apiFetch: jest.fn(),
}));
jest.mock('@/lib/mapbox', () => ({ clearOfflineMaps: jest.fn(async () => undefined) }));
// The real count of bytes still waiting; only the kick, which would reach for
// the object store, is replaced.
jest.mock('@/sync/upload-queue', () => ({
  ...jest.requireActual('@/sync/upload-queue'),
  kickUploadQueue: jest.fn(async () => undefined),
}));

const mockApiFetch = apiFetch as jest.Mock;
const secureStore = jest.requireMock('expo-secure-store') as { __reset: () => void };

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

let sqlite: TestSqlite;
let unbind: () => void = () => undefined;

const appDb = () => sqlite.db as unknown as AppDatabase;

const okPush = (call: { body: unknown }) => ({
  results: (call.body as { records: { id: string }[] }).records.map((record) => ({
    id: record.id,
    status: 'applied' as const,
  })),
});
const offline = () => {
  throw networkError();
};

beforeEach(async () => {
  secureStore.__reset();
  sqlite = await createTestDatabase();
  useConflictStore.getState().clear();
  useSyncWarningsStore.getState().reset();
  useSessionStore.setState({ status: 'signed-in', user: profile });
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
});

afterEach(() => {
  unbind();
  unbind = () => undefined;
  sqlite.close();
});

function bind() {
  unbind = startSyncEngine(appDb());
}

function renderGate() {
  return render(
    <FirstSyncGate>
      <Text testID="real-tabs">the real tabs</Text>
    </FirstSyncGate>,
  );
}

describe('first sync on the real engine (FR-042, scenario 7)', () => {
  test('a brand-new device: "syncing your trips" until the snapshot is in, then the tabs', async () => {
    let finish: () => void = () => undefined;
    routeApi(mockApiFetch, {
      pull: () =>
        new Promise((resolve) => {
          finish = () => resolve(pullPage({}, 'cursor-1', false));
        }),
    });
    bind();
    await renderGate();

    // The engine has not reported a thing yet, so it is never an empty screen.
    expect(screen.getByTestId('first-sync-screen')).toBeTruthy();
    let cycle!: ReturnType<typeof syncNow>;
    await act(async () => {
      cycle = syncNow('first-launch');
    });
    expect(await screen.findByText('Syncing your trips')).toBeTruthy();
    expect(screen.queryByTestId('real-tabs')).toBeNull();

    await act(async () => {
      finish();
      await cycle;
    });

    expect(await screen.findByTestId('real-tabs')).toBeTruthy();
    expect(getSyncStatus().firstSyncComplete).toBe(true);
  });

  test('offline on a brand-new device: says so, and Try again finishes the job once the network is back', async () => {
    routeApi(mockApiFetch, { pull: offline });
    bind();
    await renderGate();
    await act(async () => {
      await syncNow('first-launch');
    });

    expect(await screen.findByText('You’re offline')).toBeTruthy();
    expect(screen.queryByTestId('real-tabs')).toBeNull();

    routeApi(mockApiFetch, { pull: () => pullPage({}, 'cursor-1', false) });
    await fireEvent.press(screen.getByLabelText('Try again'));

    expect(await screen.findByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByText('You’re offline')).toBeNull();
  });

  test('a device that already holds its own rows goes straight to the tabs, with no syncing state', async () => {
    seedTrip(sqlite);
    bind();
    await renderGate();

    expect(screen.getByTestId('real-tabs')).toBeTruthy();
    expect(screen.queryByTestId('first-sync-screen')).toBeNull();
  });
});

function signOutHook() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: 0 } },
  });
  return renderHook(() => useSignOut(), {
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>
        <LocalStoreProvider value={{ db: appDb(), error: null, retry: () => undefined }}>
          {children}
        </LocalStoreProvider>
      </QueryClientProvider>
    ),
  });
}

describe('sign-out guard on the real engine (scenario 11)', () => {
  test('pushes the traveller’s unsynced record first, and then signs out', async () => {
    seedTrip(sqlite, { is_dirty: true, synced_at: null });
    bind();
    const calls = routeApi(mockApiFetch, {
      push: okPush,
      pull: () => pullPage({}, 'c', false),
    });
    const { result } = await signOutHook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.map((call) => call.path)).toContain('/sync/push');
    expect(useSessionStore.getState().status).toBe('signed-out');
    await expect(getSession()).resolves.toBeNull();
  });

  test('offline with an unsynced note: warns, counts it, and does not sign out', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      synced_at: null,
      updated_at: at(3),
    });
    bind();
    routeApi(mockApiFetch, { push: offline, pull: () => pullPage({}, 'c', false) });
    const { result } = await signOutHook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(UnsyncedChangesError);
    expect(result.current.error).toMatchObject({
      changes: 1,
      uploads: 0,
      remaining: 1,
      failure: 'offline',
    });
    expect(useSessionStore.getState().status).toBe('signed-in');
    await expect(getSession()).resolves.toMatchObject({ refreshToken: 'refresh' });
  });

  test('a photo whose bytes have not arrived counts too, exactly once', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'photos', uuid(5), {
      is_dirty: true,
      synced_at: null,
      upload_state: 'pending',
      local_file_uri: 'file:///staged/photo.jpg',
    });
    bind();
    routeApi(mockApiFetch, { push: okPush, pull: () => pullPage({}, 'c', false) });
    const { result } = await signOutHook();

    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ changes: 0, uploads: 1, remaining: 1 });
  });

  test('"Sign out anyway" signs out even with the note unsent, and leaves it in the database for the next sign-in', async () => {
    seedTrip(sqlite);
    seed(sqlite, 'notes', uuid(4), {
      is_dirty: true,
      synced_at: null,
      updated_at: at(3),
    });
    bind();
    routeApi(mockApiFetch, { push: offline, pull: () => pullPage({}, 'c', false) });
    const { result } = await signOutHook();

    result.current.mutate({ force: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useSessionStore.getState().status).toBe('signed-out');
    await expect(countUnsynced(appDb())).resolves.toBe(1);
  });
});
