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
import { useQueryClient } from '@tanstack/react-query';
import { act, within } from '@testing-library/react-native';
import { useTheme } from 'expo-router';
import { renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as ScreenCapture from 'expo-screen-capture';
import * as SplashScreen from 'expo-splash-screen';
import * as SQLite from 'expo-sqlite';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from 'react-native';
import { Uniwind } from 'uniwind';

import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { useLocalStore } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { __resetAppearanceStoreForTests } from '@/hooks/appearance-store';
import { SECURE_KEYS, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';
import { PaletteNames, resolvePaletteName } from '@/theme/palette';

import { backgroundVariable } from '../helpers/theme-css';

// The first render of the whole router tree pays for transforming every module it touches:
// 11 to 20 s on a cold cache, which hit the 20 s default under parallel load (004 spike).
jest.setTimeout(60_000);

// The device scheme as a store, so a test can flip it with the app mounted: what
// `Appearance` does when the traveller switches the system between light and dark.
const mockScheme = { value: 'light', listeners: new Set<() => void>() };
jest.mock('@/hooks/use-color-scheme', () => {
  const { useSyncExternalStore } = require('react') as typeof import('react');
  return {
    useColorScheme: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockScheme.listeners.add(listener);
          return () => {
            mockScheme.listeners.delete(listener);
          };
        },
        () => mockScheme.value,
      ),
  };
});

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
function renderApp(initialUrl?: string, welcome: typeof Welcome = Welcome) {
  return renderRouter(
    {
      _layout: require('@/app/_layout'),
      '(auth)/_layout': require('@/app/(auth)/_layout'),
      '(auth)/welcome': welcome,
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

afterEach(() => {
  // The shared appearance store keeps what it read for the life of the module registry, and
  // `ready` never goes false again: without this a test would inherit the last one's first read.
  __resetAppearanceStoreForTests();
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

describe('root layout — the kit follows useAppearance (feature 004, T402, T412; D4-05)', () => {
  const { HeroUINativeProvider } = jest.requireMock('heroui-native') as {
    HeroUINativeProvider: jest.Mock;
  };
  const standIn = HeroUINativeProvider.getMockImplementation();

  /** What the OS reports through AccessibilityInfo, changeable with the app mounted. */
  const a11y = { reduceMotion: false, darker: false, handlers: [] as (() => void)[] };
  let spies: jest.SpyInstance[] = [];
  let setTheme: jest.SpyInstance;
  let os: ReturnType<typeof jest.replaceProperty>;

  beforeEach(() => {
    mockScheme.value = 'light';
    Object.assign(a11y, { reduceMotion: false, darker: false, handlers: [] });
    os = jest.replaceProperty(Platform, 'OS', 'ios');
    // Uniwind registers its themes from the Metro transform, which Jest has no part in:
    // the real `setTheme('light-contrast')` would throw "not registered", so it is recorded.
    setTheme = jest.spyOn(Uniwind, 'setTheme').mockImplementation(() => undefined);
    spies = [
      setTheme,
      jest
        .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
        .mockImplementation(async () => a11y.reduceMotion),
      jest
        .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
        .mockResolvedValue(false),
      // Typed loosely: the real overloads are per event name and return a native subscription.
      jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
        _event: string,
        handler: () => void,
      ) => {
        a11y.handlers.push(handler);
        return { remove: () => undefined };
      }) as never),
    ];
    // iOS's "Increase Contrast": on the real module, absent from the Jest one.
    Object.assign(AccessibilityInfo, {
      isDarkerSystemColorsEnabled: jest.fn(async () => a11y.darker),
    });
  });

  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
    delete (AccessibilityInfo as { isDarkerSystemColorsEnabled?: unknown })
      .isDarkerSystemColorsEnabled;
    HeroUINativeProvider.mockImplementation(standIn);
    os.restore();
  });

  async function setScheme(value: 'light' | 'dark') {
    mockScheme.value = value;
    await act(async () => {
      mockScheme.listeners.forEach((listener) => listener());
    });
  }

  async function setAccessibility(next: { reduceMotion?: boolean; darker?: boolean }) {
    Object.assign(a11y, next);
    await act(async () => {
      a11y.handlers.forEach((handler) => handler());
    });
  }

  const themesAsked = () => setTheme.mock.calls.map(([name]) => name as string);
  const configs = () =>
    HeroUINativeProvider.mock.calls.map(
      ([props]) => (props as { config: Record<string, unknown> }).config,
    );

  test('mounts HeroUINativeProvider around the app, with the kit’s development banner off', async () => {
    await renderApp();

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(HeroUINativeProvider).toHaveBeenCalled();
    expect(configs()[0].devInfo).toEqual({ stylingPrinciples: false });
  });

  test('never caps font scaling: textProps and textInputProps stay unset (FR-029)', async () => {
    await renderApp();
    await screen.findByText('welcome-screen');

    for (const config of configs()) {
      expect(config.textProps).toBeUndefined();
      expect(config.textInputProps).toBeUndefined();
    }
  });

  describe('Uniwind.setTheme', () => {
    test('hands light and dark back to the OS with "system", never pinning the scheme', async () => {
      await renderApp();
      await screen.findByText('welcome-screen');

      expect(themesAsked()).toEqual(['system']);

      await setScheme('dark');

      // Pinning would call Appearance.setColorScheme('dark'): the app would then stay dark
      // when the OS goes light (AppCompatDelegate night mode / overrideUserInterfaceStyle).
      expect(themesAsked()).not.toContain('light');
      expect(themesAsked()).not.toContain('dark');
    });

    test('is called on every themeName change: contrast on and off, the scheme flipped', async () => {
      await renderApp();
      await screen.findByText('welcome-screen');

      await setAccessibility({ darker: true });
      await waitFor(() => expect(themesAsked().at(-1)).toBe('light-contrast'));

      await setScheme('dark');
      await waitFor(() => expect(themesAsked().at(-1)).toBe('dark-contrast'));

      await setScheme('light');
      await waitFor(() => expect(themesAsked().at(-1)).toBe('light-contrast'));

      await setAccessibility({ darker: false });
      await waitFor(() => expect(themesAsked().at(-1)).toBe('system'));

      expect(themesAsked()).toEqual([
        'system',
        'light-contrast',
        'dark-contrast',
        'light-contrast',
        'system',
      ]);
      // Only 'system' or a palette theme is ever asked for. Uniwind throws for a name it has
      // not registered; test/config/metro-config.test.ts checks every palette theme is.
      const known: string[] = ['system', ...PaletteNames];
      expect(themesAsked().filter((name) => !known.includes(name))).toEqual([]);
    });

    test('leaves the contrast theme for "system" again, so a traveller is not stuck in it', async () => {
      mockScheme.value = 'dark';
      a11y.darker = true;
      await renderApp();
      await waitFor(() => expect(themesAsked().at(-1)).toBe('dark-contrast'));

      await setAccessibility({ darker: false });

      await waitFor(() => expect(themesAsked().at(-1)).toBe('system'));
    });

    test('is called even while the layout renders nothing under the splash', async () => {
      // What this proves is only that the call does not wait for the first screen; that it
      // runs before PAINT cannot be seen under Jest, so the two source tests below pin why.
      mockScheme.value = 'dark';
      secureStore.getItemAsync.mockReturnValueOnce(new Promise(() => {}));

      await renderApp();

      expect(screen.queryByTestId('app-root')).toBeNull();
      expect(themesAsked()).toEqual(['system']);
    });

    describe('why it can be trusted to run before the first frame (source)', () => {
      const layoutSource = () =>
        (jest.requireActual('fs') as typeof import('fs')).readFileSync(
          require.resolve('@/app/_layout'),
          'utf8',
        );

      test('useKitTheme is a layout effect, which React runs before the commit is painted', () => {
        const hook = /function useKitTheme\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(
          layoutSource(),
        );

        expect(hook).not.toBeNull();
        expect(hook?.[1]).toMatch(/useLayoutEffect\(/);
        expect(hook?.[1]).not.toMatch(/\buseEffect\(/);
        expect(hook?.[1]).toMatch(/Uniwind\.setTheme\(kitThemeFor\(themeName\)\)/);
        expect(hook?.[1]).toMatch(/\[themeName\]/);
      });

      test('RootLayout calls it above every early return, so it also runs under the splash', () => {
        const source = layoutSource();
        const layout = source.slice(source.indexOf('function RootLayout()'));

        const call = layout.indexOf('useKitTheme(themeName)');
        const firstReturn = layout.indexOf('return null');
        expect(call).toBeGreaterThan(-1);
        expect(firstReturn).toBeGreaterThan(call);
      });
    });
  });

  describe('one canvas in all four themes, increased contrast included (FR-023, T453)', () => {
    /** The navigation theme's background, read where portalled content reads it. */
    function NavigationProbe() {
      const { colors } = useTheme();
      return <Text testID="navigation-probe">{String(colors.background)}</Text>;
    }

    const WelcomeCanvas = () => (
      <Screen testID="welcome-canvas">
        <Text>welcome-screen</Text>
      </Screen>
    );

    const flatStyle = (node: { props: { style?: unknown } }): Record<string, unknown> =>
      (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;

    /**
     * The canvas of the ROOT stack's scene around a node: its outermost `RNSScreenContentWrapper`.
     * The nested stacks (auth, trip) paint their own scenes through the kit, which Jest stubs.
     */
    function rootSceneBehind(testID: string): string | undefined {
      let scene: string | undefined;
      for (let node = screen.getByTestId(testID).parent; node; node = node.parent) {
        if (String(node.type) !== 'RNSScreenContentWrapper') continue;
        scene = String(flatStyle(node).backgroundColor);
      }
      return scene;
    }

    test.each([
      ['light', false],
      ['dark', false],
      ['light', true],
      ['dark', true],
    ] as const)(
      'a %s device with more contrast=%s: the root, the navigation theme, the scene and Screen paint the kit’s background',
      async (scheme, moreContrast) => {
        // What the kit's classes paint in this theme: `--background` of the generated stylesheet.
        const kitBackground = backgroundVariable(
          resolvePaletteName(scheme, moreContrast),
        ).toLowerCase();
        mockScheme.value = scheme;
        a11y.darker = moreContrast;
        HeroUINativeProvider.mockImplementation(
          ({ children }: { children?: ReactNode }) => (
            <>
              <View testID="kit-children">{children}</View>
              <NavigationProbe />
            </>
          ),
        );

        await renderApp(undefined, WelcomeCanvas);
        await screen.findByText('welcome-screen');

        const rootStyle = flatStyle(screen.getByTestId('app-root'));
        expect(String(rootStyle.backgroundColor).toLowerCase()).toBe(kitBackground);
        expect(screen.getByTestId('navigation-probe').props.children.toLowerCase()).toBe(
          kitBackground,
        );
        expect(rootSceneBehind('welcome-canvas')?.toLowerCase()).toBe(kitBackground);

        const canvas = screen.getByTestId('welcome-canvas');
        expect(String(flatStyle(canvas).backgroundColor).toLowerCase()).toBe(
          kitBackground,
        );
        expect(String(canvas.props.className)).toContain('bg-background');
      },
    );

    test('a live switch of the scheme repaints all of them together, and the contrast setting keeps them in step', async () => {
      HeroUINativeProvider.mockImplementation(
        ({ children }: { children?: ReactNode }) => (
          <>
            <View testID="kit-children">{children}</View>
            <NavigationProbe />
          </>
        ),
      );
      await renderApp(undefined, WelcomeCanvas);
      await screen.findByText('welcome-screen');
      const canvasOf = () =>
        String(
          flatStyle(screen.getByTestId('welcome-canvas')).backgroundColor,
        ).toLowerCase();
      const lightCanvas = backgroundVariable('light').toLowerCase();
      expect(canvasOf()).toBe(lightCanvas);

      await setScheme('dark');

      const darkCanvas = backgroundVariable('dark').toLowerCase();
      expect(darkCanvas).not.toBe(lightCanvas);
      await waitFor(() => expect(canvasOf()).toBe(darkCanvas));
      expect(
        String(flatStyle(screen.getByTestId('app-root')).backgroundColor).toLowerCase(),
      ).toBe(darkCanvas);
      expect(screen.getByTestId('navigation-probe').props.children.toLowerCase()).toBe(
        darkCanvas,
      );
      expect(rootSceneBehind('welcome-canvas')?.toLowerCase()).toBe(darkCanvas);

      // Sunrise keeps the paper in the contrast themes (C5-3): the switch must still reach
      // every surface, and they must all still agree on the one canvas.
      await setAccessibility({ darker: true });

      const contrastCanvas = backgroundVariable('dark-contrast').toLowerCase();
      await waitFor(() => expect(themesAsked()).toContain('dark-contrast'));
      expect(canvasOf()).toBe(contrastCanvas);
      expect(
        String(flatStyle(screen.getByTestId('app-root')).backgroundColor).toLowerCase(),
      ).toBe(contrastCanvas);
      expect(screen.getByTestId('navigation-probe').props.children.toLowerCase()).toBe(
        contrastCanvas,
      );
      expect(rootSceneBehind('welcome-canvas')?.toLowerCase()).toBe(contrastCanvas);
    });
  });

  describe('the splash waits for the first accessibility read (D4-05)', () => {
    /** A contrast query a test settles by hand, so the read stays pending until it says. */
    function pendingContrastRead() {
      let settle: { resolve: (value: boolean) => void; reject: (error: Error) => void };
      const promise = new Promise<boolean>((resolve, reject) => {
        settle = { resolve, reject };
      });
      Object.assign(AccessibilityInfo, {
        isDarkerSystemColorsEnabled: jest.fn(() => promise),
      });
      return {
        resolve: (value: boolean) => settle.resolve(value),
        reject: (error: Error) => settle.reject(error),
      };
    }

    test('signed out: no screen and no splash hide while the read is pending, both once it answers', async () => {
      const contrast = pendingContrastRead();

      await renderApp();
      // The session is known and nothing else is outstanding; only the read is.
      await waitFor(() => expect(useSessionStore.getState().status).toBe('signed-out'));
      // The router testing library fakes timers; let everything that can settle, settle.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(SplashScreen.hide).not.toHaveBeenCalled();
      expect(screen.queryByTestId('app-root')).toBeNull();
      expect(screen.queryByText('welcome-screen')).toBeNull();

      await act(async () => {
        contrast.resolve(false);
      });

      expect(await screen.findByText('welcome-screen')).toBeTruthy();
      expect(SplashScreen.hide).toHaveBeenCalled();
    });

    test('signed in: the open store does not hide the splash before the read answers', async () => {
      await signedIn();
      const contrast = pendingContrastRead();

      await renderApp();
      await waitFor(() => expect(openDatabaseAsync).toHaveBeenCalled());
      // The router testing library fakes timers; let everything that can settle, settle.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(50);
      });
      expect(SplashScreen.hide).not.toHaveBeenCalled();
      expect(screen.queryByText('home-screen')).toBeNull();

      await act(async () => {
        contrast.resolve(false);
      });

      expect(await screen.findByText('home-screen')).toBeTruthy();
      expect(SplashScreen.hide).toHaveBeenCalled();
    });

    test('a rejected query settles the read too: the app comes up on the more-contrast theme', async () => {
      const contrast = pendingContrastRead();

      await renderApp();
      await waitFor(() => expect(useSessionStore.getState().status).toBe('signed-out'));
      expect(SplashScreen.hide).not.toHaveBeenCalled();

      await act(async () => {
        contrast.reject(new Error('the accessibility service is not available'));
      });

      expect(await screen.findByText('welcome-screen')).toBeTruthy();
      expect(SplashScreen.hide).toHaveBeenCalled();
      expect(themesAsked().at(-1)).toBe('light-contrast');
    });

    test('the first render of the app already has the flags the OS reported', async () => {
      mockScheme.value = 'dark';
      a11y.darker = true;
      a11y.reduceMotion = true;

      await renderApp();
      await screen.findByText('welcome-screen');

      // `themeName` and `prefersLessMotion` come out of one state, so an app whose very
      // first render already has animation off was rendered after the flags were read:
      // there is no render on the base theme, or with animation on, to flip afterwards.
      expect(configs().length).toBeGreaterThan(0);
      expect(configs()[0].animation).toBe('disable-all');
      expect(themesAsked().at(-1)).toBe('dark-contrast');
    });
  });

  describe('the provider config (reduced motion, D4-05)', () => {
    const animation = () => configs().at(-1)?.animation;

    test('has no animation key at all unless reduce motion is on', async () => {
      await renderApp();
      await screen.findByText('welcome-screen');
      for (const config of configs()) expect(Object.keys(config)).toEqual(['devInfo']);

      await setAccessibility({ reduceMotion: true });
      await waitFor(() =>
        expect(Object.keys(configs().at(-1) ?? {}).sort()).toEqual([
          'animation',
          'devInfo',
        ]),
      );

      await setAccessibility({ reduceMotion: false });
      await waitFor(() =>
        expect(Object.keys(configs().at(-1) ?? {})).toEqual(['devInfo']),
      );
    });

    test('leaves animation to the kit, then disables it while reduce motion is on', async () => {
      await renderApp();
      await screen.findByText('welcome-screen');
      expect(animation()).toBeUndefined();

      await setAccessibility({ reduceMotion: true });
      await waitFor(() => expect(animation()).toBe('disable-all'));

      await setAccessibility({ reduceMotion: false });
      await waitFor(() => expect(animation()).toBeUndefined());
    });

    test('starts disabled when the OS already asks for reduced motion', async () => {
      a11y.reduceMotion = true;
      await renderApp();
      await screen.findByText('welcome-screen');

      await waitFor(() => expect(animation()).toBe('disable-all'));
    });

    test('keeps one config object while the motion flag is unchanged', async () => {
      await renderApp();
      await screen.findByText('welcome-screen');
      await setScheme('dark');
      await waitFor(() => expect(themesAsked()).toHaveLength(2));

      expect(configs().length).toBeGreaterThan(1);
      expect(new Set(configs()).size).toBe(1);
    });

    test('keeps the development banner off while animation toggles', async () => {
      a11y.reduceMotion = true;
      await renderApp();
      await screen.findByText('welcome-screen');

      await waitFor(() => expect(animation()).toBe('disable-all'));
      expect(configs().at(-1)?.devInfo).toEqual({ stylingPrinciples: false });
    });
  });

  describe('where the kit’s portal host mounts (research D4-05, review of the spike)', () => {
    /**
     * The kit's `Portal` registers its ELEMENTS in a module-level store and `PortalHost`
     * renders them wherever the provider mounted it: a sibling after `children`, inside
     * the provider. Select items, Dialog and Toast content therefore see only the
     * contexts ABOVE `HeroUINativeProvider`. The stand-in below reproduces that placement
     * with a probe in the host's position.
     */
    function PortalHostProbe() {
      const client = useQueryClient();
      const store = useLocalStore();
      const navigation = useTheme();
      return (
        <Text testID="portal-host-probe">
          {JSON.stringify({
            retry: client.getDefaultOptions().queries?.retry,
            storeOpen: store.db !== null,
            background: navigation.colors.background,
          })}
        </Text>
      );
    }

    const mountWithPortalHost = () =>
      HeroUINativeProvider.mockImplementation(
        ({ children }: { children?: ReactNode }) => (
          <>
            <View testID="kit-children">{children}</View>
            <PortalHostProbe />
          </>
        ),
      );
    const probed = () =>
      JSON.parse(screen.getByTestId('portal-host-probe').props.children as string) as {
        retry?: number;
        storeOpen: boolean;
        background: string;
      };

    test('the kit still mounts PortalHost after children, inside the provider (source guard)', () => {
      const fs = jest.requireActual('fs') as typeof import('fs');
      const path = jest.requireActual('path') as typeof import('path');
      const kitSrc = path.join(
        path.dirname(require.resolve('heroui-native/package.json')),
        'src',
      );
      const provider = fs.readFileSync(
        path.join(kitSrc, 'providers', 'hero-ui-native', 'provider.tsx'),
        'utf8',
      );
      const portal = fs.readFileSync(
        path.join(kitSrc, 'primitives', 'portal', 'portal.tsx'),
        'utf8',
      );

      expect(provider).toMatch(/\{children\}\s*<PortalHost \/>/);
      expect(portal).toMatch(/updatePortal\(hostName, name, children\)/);
    });

    test('portalled content reaches the QueryClient, the local store and the navigation theme', async () => {
      await signedIn();
      mountWithPortalHost();

      await renderApp();

      expect(await screen.findByText('home-screen')).toBeTruthy();
      await waitFor(() => expect(probed().storeOpen).toBe(true));
      expect(probed()).toEqual({
        retry: 1,
        storeOpen: true,
        background: Colors.light.canvas,
      });
    });

    test('the provider still wraps the navigator, so every screen is a child of it', async () => {
      await signedIn();
      mountWithPortalHost();

      await renderApp();

      const children = await screen.findByTestId('kit-children');
      expect(await within(children).findByText('home-screen')).toBeTruthy();
    });

    test('KeyboardProvider is above the kit provider, so a keyboard-aware toast wrapper works', async () => {
      mountWithPortalHost();

      await renderApp();
      await screen.findByText('welcome-screen');

      const keyboard = findHost(
        screen.toJSON(),
        (node) => node.type === 'KeyboardProvider',
      );
      expect(keyboard).not.toBeNull();
      expect(
        findHost(keyboard, (node) => node.props?.testID === 'kit-children'),
      ).not.toBeNull();
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

type HostNode = { type: string; props?: Record<string, unknown>; children?: unknown };

/** The first host node, in the rendered tree below `root`, that satisfies `match`. */
function findHost(root: unknown, match: (node: HostNode) => boolean): HostNode | null {
  const nodes = Array.isArray(root) ? root : [root];
  for (const node of nodes) {
    if (node === null || typeof node !== 'object') continue;
    const host = node as HostNode;
    if (match(host)) return host;
    const found = findHost(host.children ?? null, match);
    if (found) return found;
  }
  return null;
}
