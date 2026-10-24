/**
 * `trip/[id]/_layout` for the offline maps screen - the `offline-maps` route has NO native header
 * (feature 005 F11, tasks.md T552; FR-007, FR-008, FR-030; research D4-06): the screen draws
 * the pictured `AreaHeader` itself, with Back, so the navigator's header is hidden for it.
 *
 * `trip-layout.test.tsx` pins which trip screens have a header at all; this suite pins the
 * offline-maps route, rendered the same way: through `expo-router/testing-library`, a real router
 * and the real native stack, so what is read is what the navigator would hand the native
 * header. The screen itself is inert here, but for the `AreaHeader` it draws, so Back is
 * proved through the real router (`offline-maps.test.tsx` covers the screen).
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { fireEvent, within } from '@testing-library/react-native';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

import { AreaHeader } from '@/components/ui/area-header';

type TestInstance = typeof screen.container;

// A cold first render of the router tree transforms every module it touches.
jest.setTimeout(60_000);

jest.mock('@/components/require-local-store', () => ({
  RequireLocalStore: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const COLOURS: Record<string, string> = {
  background: 'rgb(11, 22, 33)',
  foreground: 'rgb(77, 88, 99)',
  accent: 'rgb(44, 55, 66)',
};

beforeEach(() => {
  // `useStackHeaderOptions` asks for its three colours in one call, `useHeaderTheme` one at a time.
  const colourOf = (token: string) => COLOURS[token] ?? '#808080';
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string | string[]) =>
      Array.isArray(token) ? token.map(colourOf) : colourOf(token)) as never);
});
afterEach(() => jest.restoreAllMocks());

/** The app's root: a headerless stack with the tabs (here `index`) as the anchor. */
function RootStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
const anchored = { default: RootStack, unstable_settings: { anchor: 'index' } };

function routes() {
  return {
    _layout: anchored,
    index: () => <Text>home</Text>,
    'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
    'trip/[id]/index': () => <Text testID="trip-index">overview</Text>,
    'trip/[id]/offline-maps': () => (
      <AreaHeader title="Offline maps" testID="offline-maps-inert" />
    ),
  };
}

function insideTrip(node: TestInstance): boolean {
  for (let up = node.parent; up; up = up.parent) {
    if (up.type === 'RNSScreen' && String(up.props.screenId).startsWith('trip/[id]')) {
      return true;
    }
  }
  return false;
}

const routeName = (scene: TestInstance | null) =>
  String(scene?.props.screenId).replace(/-[\w-]{21}$/, '');

/** The header config the navigator gave each screen of the trip stack, by route name. */
function tripHeaders(): Record<string, Record<string, unknown>> {
  const configs = screen.container.queryAll(
    (node) =>
      node.type === 'RNSScreenStackHeaderConfig' &&
      !!node.parent &&
      insideTrip(node.parent),
  );
  return Object.fromEntries(
    configs.map((config) => [routeName(config.parent), config.props]),
  );
}

function contentBackground(name: string): unknown {
  const scene = screen.container.queryAll(
    (node) =>
      node.type === 'RNSScreen' &&
      String(node.props.screenId).startsWith(`${name}-`) &&
      insideTrip(node),
  )[0];
  const wrapper = scene?.children.find(
    (child): child is TestInstance =>
      typeof child !== 'string' && child.type === 'RNSScreenContentWrapper',
  );
  return StyleSheet.flatten(wrapper?.props.style).backgroundColor;
}

/** The overview, then the screen pushed on it, as a tap on the Offline maps row does. */
async function openOfflineMaps() {
  const app = renderRouter(routes(), { initialUrl: '/trip/abc' });
  await app;
  await act(async () => router.push('/trip/abc/offline-maps'));
  return { app };
}

describe('trip/[id]/_layout - the offline maps route draws its own header (FR-044)', () => {
  test('has no native header: the title and Back are the screen’s (AreaHeader)', async () => {
    await openOfflineMaps();

    expect(tripHeaders()['offline-maps']?.hidden).toBe(true);
    expect(screen.getByTestId('offline-maps-inert')).toBeTruthy();
  });

  test('the scene behind it is still the canvas colour', async () => {
    await openOfflineMaps();
    expect(contentBackground('offline-maps')).toBe(COLOURS.background);
  });

  test('leaves the overview’s own header exactly as it was (no title, a hairline-free bar)', async () => {
    await openOfflineMaps();
    const overview = tripHeaders().index;

    expect(overview?.hidden).toBe(false);
    expect(overview?.title).toBe('');
    expect(overview?.hideShadow).toBe(true);
  });
});

describe('trip/[id]/_layout - Back on the offline maps screen (FR-008, FR-030)', () => {
  test('is the one control named "Back", drawn by the screen', async () => {
    await openOfflineMaps();

    const back = within(screen.getByTestId('offline-maps-inert')).getAllByLabelText(
      'Back',
    );
    expect(back).toHaveLength(1);
    expect(back[0]?.props.accessibilityRole).toBe('button');
  });

  test('goes back to the trip the traveller came from', async () => {
    const { app } = await openOfflineMaps();
    expect(app.getPathname()).toBe('/trip/abc/offline-maps');

    await fireEvent.press(
      within(screen.getByTestId('offline-maps-inert')).getByLabelText('Back'),
    );

    expect(app.getPathname()).toBe('/trip/abc');
    expect(screen.getByTestId('trip-index')).toBeTruthy();
  });
});
