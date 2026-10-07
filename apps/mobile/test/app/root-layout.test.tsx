/**
 * R009 / T041 — the root layout, its auth gate, and its local-store gate
 * (research D-17, v57 authentication guide:
 * https://docs.expo.dev/router/reference/authentication.md).
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route,
 * so a test there would be bundled into the app (see metro.config.js).
 *
 * Rendered through `expo-router/testing-library`, which mounts a real router
 * over an in-memory route map. That is deliberate: the gate is `Stack.Protected`,
 * and a stub that re-implemented its redirect rule would be testing the stub.
 * The screens themselves are inert placeholders here — their own suites cover
 * their content — so what is under test is which group the router lands on,
 * and when the splash comes down.
 */
import { act } from '@testing-library/react-native';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import * as SQLite from 'expo-sqlite';
import { Platform, Text } from 'react-native';

import { useSessionStore } from '@/features/auth/session-store';
import { SECURE_KEYS, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

// The first render of the whole router tree pays for transforming every module it touches:
// 11 to 20 s on a cold cache, which hit the 20 s default under parallel load (004 spike).
jest.setTimeout(60_000);

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (component: unknown) => component },
  initSentry: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));

// The sync runtime has its own suites (test/sync, sync-runtime-*.test.tsx, and
// the shell wiring in test/app/sync-runtime-shell.test.tsx). Here the layout's
// concern is the auth and store gates, so the engine is a double that reports
// the first sync as done and the triggers bind nothing.
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

// The migrator is proven against a real database in test/db; here the client
// is a recorder, so the migrator must not try to run SQL through it.
jest.mock('drizzle-orm/expo-sqlite/migrator', () => ({
  migrate: jest.fn(async () => undefined),
}));

const secureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock;
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

function fakeClient({ cipher = '4.6.1' }: { cipher?: string | null } = {}) {
  return {
    execAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async (sql: string) =>
      sql === 'PRAGMA cipher_version' && cipher ? { cipher_version: cipher } : null,
    ),
  };
}

const Welcome = () => <Text>welcome-screen</Text>;
const Home = () => <Text>home-screen</Text>;

/**
 * The real layouts — passed as modules so their `unstable_settings` anchors
 * and their `RequireLocalStore` gates are honoured exactly as Metro would —
 * over placeholder screens.
 *
 * `renderRouter` wraps RNTL 14's async `render` and attaches `getPathname` to
 * the pending promise, so callers hold the promise AND await it.
 */
function renderApp(initialUrl?: string) {
  return renderRouter(
    {
      _layout: require('@/app/_layout'),
      '(auth)/_layout': require('@/app/(auth)/_layout'),
      '(auth)/welcome': Welcome,
      '(tabs)/_layout': require('@/app/(tabs)/_layout'),
      '(tabs)/index': Home,
      '(tabs)/trips': () => null,
      '(tabs)/profile': () => null,
      'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
      'trip/[id]/index': () => <Text>trip-screen</Text>,
      'modal/_layout': require('@/app/modal/_layout'),
      'modal/add-trip': () => <Text>add-trip-screen</Text>,
      '+not-found': () => <Text>not-found-screen</Text>,
    },
    initialUrl ? { initialUrl } : undefined,
  );
}

async function signedIn() {
  await setSession({ accessToken: 'access', refreshToken: 'refresh', user: profile });
  await secureStore.setItemAsync(SECURE_KEYS.dbKey, 'ab'.repeat(32));
}

beforeEach(() => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'loading', user: null });
  openDatabaseAsync.mockReset().mockResolvedValue(fakeClient());
});

describe('root layout — auth gate (R009, D-17)', () => {
  test('keeps the splash visible and renders nothing while the session is loading', async () => {
    // Never resolve one of the three keychain reads, so `getSession` never
    // settles and the store stays on `loading` for the whole test. (`Once`:
    // afterEach only clears calls, not a persistent implementation.)
    secureStore.getItemAsync.mockReturnValueOnce(new Promise(() => {}));

    await renderApp();

    expect(screen.queryByTestId('app-root')).toBeNull();
    expect(SplashScreen.hide).not.toHaveBeenCalled();
  });

  test('lands a signed-out traveller on the welcome screen, not the tabs', async () => {
    const app = renderApp();
    await app;

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(screen.queryByText('home-screen')).toBeNull();
    expect(app.getPathname()).toBe('/welcome');
    expect(openDatabaseAsync).not.toHaveBeenCalled();
  });

  test('lands a signed-in traveller on the home tab once their database is open', async () => {
    await signedIn();

    const app = renderApp();
    await app;

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByText('welcome-screen')).toBeNull();
    expect(app.getPathname()).toBe('/');
    expect(openDatabaseAsync).toHaveBeenCalledWith(`triptrackr-${profile.id}.db`, {
      enableChangeListener: true,
    });
  });

  test('a signed-out traveller deep-linked into a protected route is redirected to auth', async () => {
    await renderApp('/trip/abc');

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(screen.queryByText('trip-screen')).toBeNull();
  });

  test('a signed-in traveller deep-linked to a trip lands on it, inside the trip stack', async () => {
    await signedIn();

    const app = renderApp('/trip/abc');
    await app;

    expect(await screen.findByText('trip-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/trip/abc');
  });

  test('a signed-in traveller deep-linked to the add-trip modal lands on it', async () => {
    await signedIn();

    const app = renderApp('/modal/add-trip');
    await app;

    expect(await screen.findByText('add-trip-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/modal/add-trip');
  });

  test('an unknown URL renders the designed not-found screen, whatever the session state', async () => {
    await renderApp('/this/route/does/not/exist');

    expect(await screen.findByText('not-found-screen')).toBeTruthy();
  });

  test('paints the canvas at the root so no transition exposes a platform background', async () => {
    await renderApp();

    const root = await screen.findByTestId('app-root');
    const style = Object.assign({}, ...[root.props.style].flat(Infinity).filter(Boolean));
    expect(style.backgroundColor).toBeDefined();
  });

  test('reports a keychain failure to Sentry instead of swallowing it, and still fails closed', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await renderApp();

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
  });

  test('reports a splash preventAutoHide failure rather than ignoring the rejection', () => {
    // The module-scope call already ran on import; its handler is what is
    // under test, so the assertion is that a rejection has somewhere to go.
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/_layout'), 'utf8') as string;
    expect(source).toMatch(/preventAutoHideAsync\(\)\s*\.catch\(/);
  });

  test('loads the provider-logo font behind the splash, and reports a failure', () => {
    // The Google and Apple buttons draw Ionicons glyphs; an icon whose font is
    // not loaded yet paints nothing, so the font is loaded before any auth
    // screen can mount.
    const source = jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/app/_layout'), 'utf8') as string;
    expect(source).toMatch(/Ionicons\.loadFont\(\)\s*\.catch\(/);
  });
});

describe('root layout — app-switcher protection for the signed-in shell (T119, research D-05)', () => {
  test('on iOS, a signed-in traveller’s app is blurred in the app switcher, and signing out lifts it', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await signedIn();
      await renderApp();
      expect(await screen.findByText('home-screen')).toBeTruthy();
      expect(ScreenCapture.enableAppSwitcherProtectionAsync).toHaveBeenCalledWith(1);
      expect(ScreenCapture.disableAppSwitcherProtectionAsync).not.toHaveBeenCalled();

      await act(async () => {
        useSessionStore.getState().signOut();
      });

      expect(await screen.findByText('welcome-screen')).toBeTruthy();
      expect(ScreenCapture.disableAppSwitcherProtectionAsync).toHaveBeenCalledTimes(1);
    } finally {
      os.restore();
    }
  });

  test('a signed-out traveller’s app is left alone', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'ios');
    try {
      await renderApp();
      expect(await screen.findByText('welcome-screen')).toBeTruthy();
      expect(ScreenCapture.enableAppSwitcherProtectionAsync).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });

  test('on Android it is never asked for: FLAG_SECURE covers the recents preview', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await signedIn();
      await renderApp();
      expect(await screen.findByText('home-screen')).toBeTruthy();
      expect(ScreenCapture.enableAppSwitcherProtectionAsync).not.toHaveBeenCalled();
    } finally {
      os.restore();
    }
  });
});

describe('root layout — local store gate (T041)', () => {
  test('signed out: hides the splash as soon as the session has resolved', async () => {
    await renderApp();

    await screen.findByText('welcome-screen');
    expect(SplashScreen.hide).toHaveBeenCalled();
  });

  test('signed in: holds the splash until the database is open, then shows the tabs', async () => {
    await signedIn();
    let release: (client: ReturnType<typeof fakeClient>) => void = () => undefined;
    openDatabaseAsync.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    await renderApp();

    // Session known, store still opening: the gate shows its opening state
    // beneath the (still visible) splash, and the tabs are not mounted.
    expect(await screen.findByTestId('local-store-opening')).toBeTruthy();
    expect(screen.queryByText('home-screen')).toBeNull();
    expect(SplashScreen.hide).not.toHaveBeenCalled();

    release(fakeClient());

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(SplashScreen.hide).toHaveBeenCalled();
  });

  test('signed in: a store that will not open renders a designed error with retry, reports it, and never a blank screen', async () => {
    await signedIn();
    openDatabaseAsync.mockResolvedValueOnce(fakeClient({ cipher: null }));

    await renderApp();

    expect(await screen.findByTestId('local-store-error')).toBeTruthy();
    expect(screen.getByText('Couldn’t open your trips')).toBeTruthy();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
    expect(screen.queryByText('home-screen')).toBeNull();
    await waitFor(() =>
      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'UnencryptedDatabaseError' }),
      ),
    );
    expect(SplashScreen.hide).toHaveBeenCalled();
  });
});

describe('root layout — Uniwind and the kit provider (feature 004, T402)', () => {
  const { HeroUINativeProvider } = jest.requireMock('heroui-native') as {
    HeroUINativeProvider: jest.Mock;
  };

  test('mounts HeroUINativeProvider around the app, with the kit’s development banner off', async () => {
    await renderApp();

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(HeroUINativeProvider).toHaveBeenCalled();
    expect(HeroUINativeProvider.mock.calls[0][0].config).toEqual({
      devInfo: { stylingPrinciples: false },
    });
  });

  test('imports global.css once, from this layout, never from the package entry', () => {
    const fs = jest.requireActual('fs') as typeof import('fs');
    const path = jest.requireActual('path') as typeof import('path');
    const srcRoot = path.resolve(__dirname, '..', '..', 'src');
    const importers = (fs.readdirSync(srcRoot, { recursive: true }) as string[])
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file))
      .filter((file) =>
        /^\s*import\s+['"][^'"]*global\.css['"]/m.test(
          fs.readFileSync(path.join(srcRoot, file), 'utf8'),
        ),
      )
      .map((file) => file.split(path.sep).join('/'));

    expect(importers).toEqual(['app/_layout.tsx']);
  });
});
