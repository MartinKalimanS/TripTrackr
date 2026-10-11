/**
 * `(auth)/_layout` - the native header of Sign in and Create account (tasks.md T446;
 * FR-007, FR-008, FR-030; research D4-06 and "Items to verify" item 7; contract C4-11
 * "Welcome, Login, Register").
 *
 * Rendered through `expo-router/testing-library`, like `trip-layout.test.tsx`: a real
 * router and the real native stack over an in-memory route map, so what is read is what
 * the navigator would hand the native header (`RNSScreenStackHeaderConfig`). The three
 * screens are inert here (their own suite covers their content); what is under test is
 * which of them has a header, what it carries, that "Back" is named "Back" (the Maestro
 * flows say `tapOn: 'Back'`) and where it goes.
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { fireEvent } from '@testing-library/react-native';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

/** A node of the rendered tree (the renderer's own type is not exported by the library). */
type TestInstance = typeof screen.container;

// A cold first render of the router tree transforms every module it touches.
jest.setTimeout(60_000);

const COLOURS: Record<string, string> = {
  background: 'rgb(11, 22, 33)',
  accent: 'rgb(44, 55, 66)',
  foreground: 'rgb(77, 88, 99)',
};

beforeEach(() => {
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string | string[]) =>
      Array.isArray(token)
        ? token.map((name) => COLOURS[name] ?? '#808080')
        : (COLOURS[token] ?? '#808080')) as never);
});
afterEach(() => jest.restoreAllMocks());

/** The app's root: a headerless stack, as `src/app/_layout.tsx` has. */
function RootStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function routes() {
  return {
    _layout: RootStack,
    '(auth)/_layout': require('@/app/(auth)/_layout'),
    '(auth)/welcome': () => <Text>welcome</Text>,
    '(auth)/login': () => <Text>login</Text>,
    '(auth)/register': () => <Text>register</Text>,
  };
}

/** A screen's route name: its id is the name, a dash and a 21-character key. */
function routeName(scene: TestInstance | null): string {
  return String(scene?.props.screenId).replace(/-[\w-]{21}$/, '');
}

const AUTH_SCREENS = ['welcome', 'login', 'register'];

/** The header config the navigator gave each screen of the auth stack, by route name. */
function authHeaders(): Record<string, Record<string, unknown>> {
  const configs = screen.container.queryAll(
    (node) =>
      node.type === 'RNSScreenStackHeaderConfig' &&
      !!node.parent &&
      AUTH_SCREENS.includes(routeName(node.parent)),
  );
  return Object.fromEntries(
    configs.map((config) => [routeName(config.parent), config.props]),
  );
}

/** The scene background the navigator painted behind an auth screen. */
function contentBackground(name: string): unknown {
  const scene = screen.container.queryAll(
    (node) => node.type === 'RNSScreen' && routeName(node) === name,
  )[0];
  const wrapper = scene?.children.find(
    (child): child is TestInstance =>
      typeof child !== 'string' && child.type === 'RNSScreenContentWrapper',
  );
  return StyleSheet.flatten(wrapper?.props.style).backgroundColor;
}

/** The router's handle is wrapped: returning it from an async function would unwrap it. */
async function openAt(url: string) {
  const app = renderRouter(routes(), { initialUrl: url });
  await app;
  return { app };
}

describe('(auth)/_layout - which screens have a header (FR-007)', () => {
  test('Sign in and Create account have one; the welcome screen has none', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/login'));
    await act(async () => router.push('/register'));

    const headers = authHeaders();
    expect(Object.keys(headers).sort()).toEqual(['login', 'register', 'welcome']);
    expect(headers.welcome?.hidden).toBe(true);
    expect(headers.login?.hidden).toBe(false);
    expect(headers.register?.hidden).toBe(false);
  });

  test('the titles are the screens’ own words, in the navigation header', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/login'));
    await act(async () => router.push('/register'));

    const headers = authHeaders();
    expect(headers.login?.title).toBe('Sign in');
    expect(headers.register?.title).toBe('Create account');
  });

  test('draws no hairline under the header (FR-006)', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/login'));
    expect(authHeaders().login?.hideShadow).toBe(true);
  });

  test('takes its colours from the kit tokens: background for bar and scene, accent for the tint', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/login'));

    const header = authHeaders().login;
    expect(header?.backgroundColor).toBe(COLOURS.background);
    expect(header?.color).toBe(COLOURS.accent);
    expect(header?.titleColor).toBe(COLOURS.foreground);
    expect(contentBackground('login')).toBe(COLOURS.background);
  });

  test('the welcome screen is painted with the same background, so there is no seam', async () => {
    await openAt('/welcome');
    expect(contentBackground('welcome')).toBe(COLOURS.background);
  });
});

describe('(auth)/_layout - Back (FR-008, research "Items to verify" item 7)', () => {
  test('Sign in offers one control named "Back", a button, whatever the previous screen is called', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/login'));

    const back = screen.getAllByLabelText('Back');
    expect(back).toHaveLength(1);
    expect(back[0]?.props.accessibilityRole).toBe('button');
    // `headerLeft` replaces the native button; only `headerBackVisible` would keep both.
    expect(authHeaders().login?.backButtonInCustomView).toBe(false);
    expect(authHeaders().login?.hideBackButton).toBe(false);
  });

  test('Create account has the same one', async () => {
    await openAt('/welcome');
    await act(async () => router.push('/register'));

    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
  });

  test('the welcome screen has no Back: it is where Back goes', async () => {
    await openAt('/welcome');
    expect(screen.queryByLabelText('Back')).toBeNull();
  });

  test('Back pops to the welcome screen', async () => {
    const { app } = await openAt('/welcome');
    await act(async () => router.push('/login'));
    expect(app.getPathname()).toBe('/login');

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(app.getPathname()).toBe('/welcome');
  });

  test('a deep link to Create account still has the welcome screen beneath it, and Back lands there', async () => {
    const { app } = await openAt('/register');
    expect(app.getPathname()).toBe('/register');

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(app.getPathname()).toBe('/welcome');
  });
});

describe('(auth)/_layout - the group keeps its anchor (FR-030)', () => {
  test('still opens the welcome screen first', () => {
    const layout = jest.requireActual('@/app/(auth)/_layout') as {
      unstable_settings?: { anchor?: string };
    };
    expect(layout.unstable_settings).toEqual({ anchor: 'welcome' });
  });
});
