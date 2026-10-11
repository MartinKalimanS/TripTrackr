/**
 * `trip/[id]/_layout` for the photo gallery - the native header of the `photos` route
 * (tasks.md T442; FR-007, FR-008, FR-030; contract C4-10 rules 4 and 6; research D4-06).
 *
 * `trip-layout.test.tsx` pins which trip screens have a header at all; this suite pins
 * what the PHOTOS header carries, rendered the same way: through `expo-router/testing-library`,
 * a real router and the real native stack, so what is read is what the navigator would hand
 * the native header. The gallery itself is inert here (`photo-screen.test.tsx` covers it).
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { fireEvent, within } from '@testing-library/react-native';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

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
    'trip/[id]/photos': () => <Text testID="photos-inert">photos</Text>,
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

/** The overview, then the gallery pushed on it, as a tap on the Photos chip does. */
async function openPhotos() {
  const app = renderRouter(routes(), { initialUrl: '/trip/abc' });
  await app;
  await act(async () => router.push('/trip/abc/photos'));
  return { app };
}

describe('trip/[id]/_layout - the photos header (FR-007)', () => {
  test('is shown, and titled "Photos": the title is the navigator’s, not a line of the page', async () => {
    await openPhotos();
    const header = tripHeaders().photos;

    expect(header?.hidden).toBe(false);
    expect(header?.title).toBe('Photos');
  });

  test('draws no hairline and takes its colours from the kit tokens', async () => {
    await openPhotos();
    const header = tripHeaders().photos;

    expect(header?.hideShadow).toBe(true);
    expect(header?.backgroundColor).toBe(COLOURS.background);
    expect(header?.color).toBe(COLOURS.accent);
    expect(contentBackground('photos')).toBe(COLOURS.background);
  });

  test('paints the title in the ink, not the accent that tints the controls (FR-003)', async () => {
    await openPhotos();
    const header = tripHeaders().photos;

    expect(header?.titleColor).toBe(COLOURS.foreground);
    expect(header?.titleColor).not.toBe(COLOURS.accent);
    // The controls (the Back control's tint) are still the accent.
    expect(header?.color).toBe(COLOURS.accent);
  });

  test('is a standard title: the large title is for the top-level lists', async () => {
    await openPhotos();
    expect(tripHeaders().photos?.largeTitle).toBeFalsy();
  });

  test('leaves the overview’s own header exactly as it was (no title, a hairline-free bar)', async () => {
    await openPhotos();
    const overview = tripHeaders().index;

    expect(overview?.hidden).toBe(false);
    expect(overview?.title).toBe('');
    expect(overview?.hideShadow).toBe(true);
  });
});

/** The photos screen's own header: the overview's stays mounted beneath it. */
function photosHeaderConfig(): TestInstance {
  const [config] = screen.container.queryAll(
    (node) =>
      node.type === 'RNSScreenStackHeaderConfig' &&
      !!node.parent &&
      insideTrip(node.parent) &&
      routeName(node.parent) === 'photos',
  );
  return config as TestInstance;
}

describe('trip/[id]/_layout - Back on the photos screen (FR-008, FR-030)', () => {
  test('replaces the native back button with a control named "Back", whatever the trip is called', async () => {
    await openPhotos();

    // `headerLeft` replaces the native button; only `headerBackVisible` would keep both.
    expect(tripHeaders().photos?.backButtonInCustomView).toBe(false);
    expect(tripHeaders().photos?.hideBackButton).toBe(false);
    const back = within(photosHeaderConfig() as never).getAllByLabelText('Back');
    expect(back).toHaveLength(1);
    expect(back[0]?.props.accessibilityRole).toBe('button');
  });

  test('goes back to the trip the traveller came from', async () => {
    const { app } = await openPhotos();
    expect(app.getPathname()).toBe('/trip/abc/photos');

    await fireEvent.press(within(photosHeaderConfig() as never).getByLabelText('Back'));

    expect(app.getPathname()).toBe('/trip/abc');
    expect(screen.getByTestId('trip-index')).toBeTruthy();
  });
});
