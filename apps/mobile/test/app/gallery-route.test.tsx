/**
 * T524 - the dev gallery is reachable ONLY in development (feature 005; research D5-18; v57
 * authentication guide, https://docs.expo.dev/router/advanced/authentication/).
 *
 * The root layout admits the `(dev)` group behind `Stack.Protected guard={__DEV__}`. Rendered
 * through `expo-router/testing-library` (a real router over an in-memory route map: a stub that
 * re-implemented the guard would test the stub), `/gallery` lands on the gallery while
 * `__DEV__` is true, signed in or not. While it is false the group does not exist for the
 * router: a deep link to it is turned away to where the auth gate puts the traveller (the
 * tabs, or an auth screen), as for any protected group, and the gallery module is never
 * loaded. The gallery itself is a stub here: `test/dev/gallery.test.tsx` renders the real one.
 *
 * That the route file loads the gallery only inside `if (__DEV__)` (which the release bundler
 * folds away) and that the layout's guard is the literal `__DEV__` is read from the source in
 * `test/dev/gallery-source.test.ts`.
 */
import { renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth/session-store';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';
import { SECURE_KEYS, setSession } from '@/lib/secure-store';

jest.setTimeout(60_000);

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (component: unknown) => component },
  initSentry: jest.fn(),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));
jest.mock('@/sync/use-sync-triggers', () => ({ useSyncTriggers: jest.fn() }));
jest.mock('@/sync/engine', () => ({
  useSyncStatus: () => ({
    phase: 'idle',
    firstSyncComplete: true,
    lastSyncedAt: null,
    failure: null,
  }),
  getSyncStatus: jest.fn(),
  startSyncEngine: jest.fn(() => () => undefined),
  syncNow: jest.fn(),
  countUnsynced: jest.fn(async () => 0),
}));
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  migrate: jest.fn(async () => undefined),
}));

// The gallery module, counted: how many times it was LOADED is the guard's other half.
const mockGallery = { loads: 0 };
jest.mock('@/components/dev/gallery', () => {
  mockGallery.loads += 1;
  const { createElement } = require('react') as typeof import('react');
  const { Text: StubText } = require('react-native') as typeof import('react-native');
  return {
    Gallery: () => createElement(StubText, { testID: 'gallery-stub' }, 'gallery-stub'),
  };
});

const SQLite = jest.requireMock('expo-sqlite') as { openDatabaseAsync: jest.Mock };
const secureStore = jest.requireMock('expo-secure-store') as {
  setItemAsync: (key: string, value: string) => Promise<void>;
  __reset: () => void;
};

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

const globals = globalThis as unknown as { __DEV__: boolean };
const wasDev = globals.__DEV__;

/** The real layouts and the real `(dev)` group, over placeholder screens. */
function renderApp(initialUrl: string) {
  return renderRouter(
    {
      _layout: require('@/app/_layout'),
      '(auth)/_layout': require('@/app/(auth)/_layout'),
      '(auth)/welcome': () => <Text>welcome-screen</Text>,
      '(auth)/login': () => <Text>login-screen</Text>,
      '(auth)/register': () => <Text>register-screen</Text>,
      '(tabs)/_layout': require('@/app/(tabs)/_layout'),
      '(tabs)/index': () => <Text>home-screen</Text>,
      '(tabs)/trips': () => null,
      '(tabs)/profile': () => null,
      'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
      'trip/[id]/index': () => null,
      'modal/_layout': require('@/app/modal/_layout'),
      'modal/add-trip': () => null,
      '(dev)/_layout': require('@/app/(dev)/_layout'),
      '(dev)/gallery': require('@/app/(dev)/gallery'),
      '+not-found': () => <Text>not-found-screen</Text>,
    },
    { initialUrl },
  );
}

async function signedIn() {
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
  await secureStore.setItemAsync(SECURE_KEYS.dbKey, 'ab'.repeat(32));
}

beforeEach(() => {
  secureStore.__reset();
  mockGallery.loads = 0;
  useSessionStore.setState({ status: 'loading', user: null });
  SQLite.openDatabaseAsync.mockReset().mockResolvedValue({
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql === 'PRAGMA cipher_version' ? { cipher_version: '4.6.1' } : null,
    ),
  });
});

afterEach(() => {
  globals.__DEV__ = wasDev;
  __resetAppearanceStoreForTests();
});

describe('the gallery route in development', () => {
  test('a signed-in traveller deep-linked to /gallery lands on it', async () => {
    await signedIn();
    const app = renderApp('/gallery');
    await app;

    expect(await screen.findByTestId('gallery-stub')).toBeTruthy();
    expect(app.getPathname()).toBe('/gallery');
  });

  test('a signed-out traveller can open it too: it is a development tool, not a screen', async () => {
    const app = renderApp('/gallery');
    await app;

    expect(await screen.findByTestId('gallery-stub')).toBeTruthy();
    expect(app.getPathname()).toBe('/gallery');
  });
});

describe('the gallery route in a release build (__DEV__ is false)', () => {
  test('a signed-in traveller deep-linked to /gallery is turned away to the tabs', async () => {
    globals.__DEV__ = false;
    await signedIn();
    const app = renderApp('/gallery');
    await app;

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByTestId('gallery-stub')).toBeNull();
    expect(app.getPathname()).not.toBe('/gallery');
    expect(mockGallery.loads).toBe(0);
  });

  test('a signed-out traveller deep-linked to /gallery is turned away to an auth screen', async () => {
    globals.__DEV__ = false;
    const app = renderApp('/gallery');
    await app;

    // The router lands on the first screen of the only group left open to a signed-out
    // traveller: the welcome screen or the sign-in one, whichever it lists first.
    expect(await screen.findByText(/^(welcome|login)-screen$/)).toBeTruthy();
    expect(screen.queryByTestId('gallery-stub')).toBeNull();
    expect(['/welcome', '/login']).toContain(app.getPathname());
    expect(mockGallery.loads).toBe(0);
  });

  test('the route itself renders nothing and loads nothing without __DEV__', () => {
    globals.__DEV__ = false;
    const GalleryRoute = (require('@/app/(dev)/gallery') as { default: () => unknown })
      .default;

    expect(GalleryRoute()).toBeNull();
    expect(mockGallery.loads).toBe(0);
  });
});
