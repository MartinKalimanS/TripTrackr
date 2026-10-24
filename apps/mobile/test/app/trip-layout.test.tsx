/**
 * `trip/[id]/_layout` - the native header of the trip screen (tasks.md T427, trip part;
 * FR-007, FR-008, FR-030; research D4-06 and "Items to verify" item 7; contract C4-9).
 *
 * Rendered through `expo-router/testing-library`: a real router and the real native
 * stack over an in-memory route map, so what is read is what the navigator would hand
 * the native header (`RNSScreenStackHeaderConfig`), not what a stand-in was told. The
 * trip screens themselves are inert here (their own suites cover their content); what is
 * under test is which screen has a header, what it carries, and that the header leaves
 * the route alone: params, history and deep links.
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { fireEvent } from '@testing-library/react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as HeroUI from 'heroui-native';
import { StyleSheet, Text } from 'react-native';

/** A node of the rendered tree (the renderer's own type is not exported by the library). */
type TestInstance = typeof screen.container;

// A cold first render of the router tree transforms every module it touches.
jest.setTimeout(60_000);

// The layout wraps its stack in the store gate; the gate has its own suite.
jest.mock('@/components/require-local-store', () => ({
  RequireLocalStore: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const COLOURS: Record<string, string> = {
  background: 'rgb(11, 22, 33)',
  accent: 'rgb(44, 55, 66)',
  foreground: 'rgb(77, 88, 99)',
  'on-photo': 'rgb(250, 251, 252)',
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

function TripIndex() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text testID="trip-index">{`trip ${id}`}</Text>;
}

/** The app's root: a headerless stack, as `src/app/_layout.tsx` has. */
function RootStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
/** With the tabs (here `index`) as the anchor, as the real root declares. */
const anchored = { default: RootStack, unstable_settings: { anchor: 'index' } };
/** Without one: a trip opened with nothing beneath it. */
const unanchored = { default: RootStack };

const SUB_SCREENS = [
  'notes',
  'expenses',
  'photos',
  'documents',
  'document-capture',
  'document-view',
  'offline-maps',
] as const;

/**
 * The sub-screens that moved to Atlas and so have a native header (004 phase 5); each is
 * asserted in its own suite. Since feature 005 (T549 to T552, F11) NONE of them is: `photos`, `notes`,
 * `expenses`, the document screens and `offline-maps` each draw their own bar (`AreaHeader`, the viewer's
 * close bar), so every native header is hidden (photos-header, notes-pictured, spending-pictured,
 * offline-maps-header and the document block below).
 */
const MIGRATED_HEADERS = new Set<string>([]);

function routes(root: object) {
  return {
    _layout: root,
    index: () => <Text>home</Text>,
    'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
    'trip/[id]/index': TripIndex,
    ...Object.fromEntries(
      SUB_SCREENS.map((name) => [`trip/[id]/${name}`, () => <Text>{name}</Text>]),
    ),
  };
}

/** Whether a node sits below the trip stack's own screen in the root stack. */
function insideTrip(node: TestInstance): boolean {
  for (let up = node.parent; up; up = up.parent) {
    if (up.type === 'RNSScreen' && String(up.props.screenId).startsWith('trip/[id]')) {
      return true;
    }
  }
  return false;
}

/** A screen's route name: its id is the name, a dash and a 21-character key. */
function routeName(scene: TestInstance | null): string {
  return String(scene?.props.screenId).replace(/-[\w-]{21}$/, '');
}

/** The header config the navigator gave each screen of the trip stack, by route name. */
function tripHeaders(): Record<string, Record<string, unknown>> {
  // The config is a child of its screen, so start above that screen: the trip's own
  // screen in the root stack is not part of the trip stack.
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

/** The scene background the navigator painted behind a trip screen. */
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

/** The router's handle is wrapped: returning it from an async function would unwrap it. */
async function openTrip(root: object, url: string) {
  const app = renderRouter(routes(root), { initialUrl: url });
  await app;
  return { app };
}

describe('trip/[id]/_layout - the header is on for the overview and the migrated screens (FR-007)', () => {
  test('the overview has a native header; so has each migrated screen, no other does yet', async () => {
    await openTrip(anchored, '/trip/abc');
    for (const name of SUB_SCREENS) {
      await act(async () => router.push(`/trip/abc/${name}`));
    }

    const headers = tripHeaders();
    expect(Object.keys(headers).sort()).toEqual(['index', ...SUB_SCREENS].sort());
    expect(headers.index?.hidden).toBe(false);
    for (const name of SUB_SCREENS) {
      expect(headers[name]?.hidden).toBe(!MIGRATED_HEADERS.has(name));
    }
  });

  test('carries no title of its own: the hero title is the content', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(tripHeaders().index?.title).toBe('');
  });

  test('draws no hairline under it', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(tripHeaders().index?.hideShadow).toBe(true);
  });

  test('is transparent: the hero picture runs under it (005 T546; FR-025)', async () => {
    await openTrip(anchored, '/trip/abc');
    const header = tripHeaders().index;
    expect(header?.translucent).toBe(true);
    // The theme's background would paint over the picture, so the bar says it paints nothing.
    expect(header?.backgroundColor).toBe('transparent');
  });

  test('takes its tint and the scene behind it from the kit tokens: white over the picture, and the background', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(tripHeaders().index?.color).toBe(COLOURS['on-photo']);
    expect(contentBackground('index')).toBe(COLOURS.background);
  });

  test('every other trip screen is painted with the same background', async () => {
    await openTrip(anchored, '/trip/abc/expenses');
    expect(contentBackground('expenses')).toBe(COLOURS.background);
  });
});

describe('trip/[id]/_layout - Back (FR-008, research "Items to verify" item 7)', () => {
  test('offers a control named "Back", whatever the previous screen is called', async () => {
    await openTrip(anchored, '/trip/abc');
    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
  });

  test('is the only Back on the screen: the native one is replaced, not added to', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    // `headerLeft` replaces the native button; only `headerBackVisible` would keep both.
    expect(tripHeaders().index?.backButtonInCustomView).toBe(false);
    expect(tripHeaders().index?.hideBackButton).toBe(false);
  });

  test('is the glass control a picture needs: the one named "Back" is the hero\'s, a round disc with no word', async () => {
    await openTrip(anchored, '/trip/abc');
    const back = screen.getByLabelText('Back');
    expect(screen.queryByText('Back')).toBeNull();
    expect(StyleSheet.flatten(back.props.style).borderRadius).toBeGreaterThanOrEqual(22);
  });

  test('goes back to where the traveller came from', async () => {
    const { app } = await openTrip(anchored, '/trip/abc');
    expect(app.getPathname()).toBe('/trip/abc');

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(app.getPathname()).toBe('/');
    expect(screen.queryByTestId('trip-index')).toBeNull();
  });

  test('goes home when the trip was opened with nothing beneath it', async () => {
    const { app } = await openTrip(unanchored, '/trip/abc');
    expect(app.getPathname()).toBe('/trip/abc');

    await fireEvent.press(screen.getByLabelText('Back'));

    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
  });
});

describe('trip/[id]/_layout - Share and More as pictured, coming soon (Q-11; UI-SPEC 6 and 10)', () => {
  const { mockToast } = jest.requireMock('heroui-native') as {
    mockToast: { show: jest.Mock };
  };

  beforeEach(() => mockToast.show.mockClear());

  test('the overview header draws Share and More at the end, as buttons named from the picture', async () => {
    await openTrip(anchored, '/trip/abc');
    for (const [id, name] of [
      ['coming-soon-trip-share', 'Share'],
      ['coming-soon-trip-more', 'More'],
    ] as const) {
      const button = screen.getByTestId(id);
      expect(button.props.accessibilityRole).toBe('button');
      expect(button.props.accessibilityLabel).toBe(name);
      expect(button.props.accessibilityHint).toBe('Not available yet');
      expect(StyleSheet.flatten(button.props.style)).toMatchObject({
        width: 44,
        height: 44,
      });
    }
  });

  test('only the overview has them: the sub-screens keep Back alone', async () => {
    await openTrip(anchored, '/trip/abc/notes');
    expect(screen.queryByTestId('coming-soon-trip-share')).toBeNull();
    expect(screen.queryByTestId('coming-soon-trip-more')).toBeNull();
  });

  test('each press is ONE toast and navigates nowhere', async () => {
    const { app } = await openTrip(anchored, '/trip/abc');
    await fireEvent.press(screen.getByTestId('coming-soon-trip-share'));
    await fireEvent.press(screen.getByTestId('coming-soon-trip-more'));
    expect(mockToast.show).toHaveBeenCalledTimes(2);
    expect(mockToast.show.mock.calls.map(([call]) => call.id)).toEqual([
      'coming-soon',
      'coming-soon',
    ]);
    expect(app.getPathname()).toBe('/trip/abc');
  });

  test('Back, Share and More are still one of each', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(screen.getAllByLabelText('Share')).toHaveLength(1);
    expect(screen.getAllByLabelText('More')).toHaveLength(1);
  });
});

describe('trip/[id]/_layout - the header leaves the route alone (FR-030)', () => {
  test('hands the screen the same params as before', async () => {
    await openTrip(anchored, '/trip/abc');
    expect(screen.getByTestId('trip-index')).toHaveTextContent('trip abc');
  });

  test('declares no anchor or initial route of its own: the root keeps deep links', () => {
    const layout = jest.requireActual('@/app/trip/[id]/_layout') as Record<
      string,
      unknown
    >;
    expect(Object.keys(layout)).toEqual(['default']);
  });

  test('a deep link to a sub-screen still opens it directly', async () => {
    const { app } = await openTrip(anchored, '/trip/abc/notes');
    expect(app.getPathname()).toBe('/trip/abc/notes');
    expect(screen.getByText('notes')).toBeTruthy();
  });
});

describe('trip/[id]/_layout - the document screens draw their own bars (005 T552; FR-044, FR-050)', () => {
  test('the list, the viewer and the camera all hide the navigator header', async () => {
    await openTrip(anchored, '/trip/abc');
    await act(async () => router.push('/trip/abc/documents'));
    await act(async () => router.push('/trip/abc/document-view?documentId=d1'));
    await act(async () => router.push('/trip/abc/document-capture'));

    const headers = tripHeaders();
    expect(headers.documents?.hidden).toBe(true);
    expect(headers['document-view']?.hidden).toBe(true);
    expect(headers['document-capture']?.hidden).toBe(true);
  });

  test('a document opened by a link keeps its params', async () => {
    const { app } = await openTrip(anchored, '/trip/abc/document-view?documentId=d9');

    expect(app.getPathname()).toBe('/trip/abc/document-view');
    expect(app.getSearchParams()).toEqual({ id: 'abc', documentId: 'd9' });
  });

  test('the scene behind them is the canvas', async () => {
    await openTrip(anchored, '/trip/abc');
    await act(async () => router.push('/trip/abc/documents'));

    expect(contentBackground('documents')).toBe(COLOURS.background);
  });
});

describe('trip/[id]/_layout - notes and spending draw their own header (F8, F9; FR-044)', () => {
  test.each(['notes', 'expenses'])(
    'the navigator’s header is hidden for %s: the screen draws the title and Back',
    async (name) => {
      await openTrip(anchored, `/trip/abc/${name}`);
      expect(tripHeaders()[name]?.hidden).toBe(true);
      expect(screen.queryAllByLabelText('Back')).toHaveLength(0);
    },
  );
});
