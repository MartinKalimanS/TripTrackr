/**
 * R009 — the root layout and its auth gate (research D-17, v57 authentication
 * guide: https://docs.expo.dev/router/reference/authentication.md).
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route,
 * so a test there would be bundled into the app (see metro.config.js).
 *
 * Rendered through `expo-router/testing-library`, which mounts a real router
 * over an in-memory route map. That is deliberate: the gate is `Stack.Protected`,
 * and a stub that re-implemented its redirect rule would be testing the stub.
 * The screens themselves are inert placeholders here — their own suites cover
 * their content — so what is under test is which group the router lands on.
 */
import { renderRouter, screen } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import { Text } from 'react-native';

import { useSessionStore } from '@/features/auth/session-store';
import { Sentry } from '@/lib/sentry';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), wrap: (component: unknown) => component },
  initSentry: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  hide: jest.fn(),
}));

const secureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock;
  setItemAsync: jest.Mock;
  __reset: () => void;
};

const Welcome = () => <Text>welcome-screen</Text>;
const Home = () => <Text>home-screen</Text>;

/**
 * The real layouts — passed as modules so their `unstable_settings` anchors
 * are honoured exactly as Metro would — over placeholder screens.
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

beforeEach(() => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'loading' });
});

describe('root layout — auth gate (R009, D-17)', () => {
  test('keeps the splash visible and renders nothing while the session is loading', async () => {
    // Never resolve, so the store stays on `loading` for the whole test.
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
  });

  test('lands a signed-in traveller on the home tab', async () => {
    await secureStore.setItemAsync('triptrackr.session', 'opaque-token');

    const app = renderApp();
    await app;

    expect(await screen.findByText('home-screen')).toBeTruthy();
    expect(screen.queryByText('welcome-screen')).toBeNull();
    expect(app.getPathname()).toBe('/');
  });

  test('a signed-out traveller deep-linked into a protected route is redirected to auth', async () => {
    await renderApp('/trip/abc');

    expect(await screen.findByText('welcome-screen')).toBeTruthy();
    expect(screen.queryByText('trip-screen')).toBeNull();
  });

  test('a signed-in traveller deep-linked to a trip lands on it, inside the trip stack', async () => {
    await secureStore.setItemAsync('triptrackr.session', 'opaque-token');

    const app = renderApp('/trip/abc');
    await app;

    expect(await screen.findByText('trip-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/trip/abc');
  });

  test('a signed-in traveller deep-linked to the add-trip modal lands on it', async () => {
    await secureStore.setItemAsync('triptrackr.session', 'opaque-token');

    const app = renderApp('/modal/add-trip');
    await app;

    expect(await screen.findByText('add-trip-screen')).toBeTruthy();
    expect(app.getPathname()).toBe('/modal/add-trip');
  });

  test('an unknown URL renders the designed not-found screen, whatever the session state', async () => {
    await renderApp('/this/route/does/not/exist');

    expect(await screen.findByText('not-found-screen')).toBeTruthy();
  });

  test('hides the splash once the session has resolved', async () => {
    await renderApp();

    await screen.findByText('welcome-screen');
    expect(SplashScreen.hide).toHaveBeenCalled();
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
});
