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
};

beforeEach(() => {
  jest
    .spyOn(HeroUI, 'useThemeColor')
    .mockImplementation(((token: string) => COLOURS[token] ?? '#808080') as never);
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

/** The document screens that have turned their native header on (004 T443). */
const DOCUMENT_HEADERS = new Set<string>(['documents', 'document-view']);

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

describe('trip/[id]/_layout - the header is on for the overview only (FR-007)', () => {
  test('the overview has a native header; no other trip screen does yet', async () => {
    await openTrip(anchored, '/trip/abc');
    for (const name of SUB_SCREENS) {
      await act(async () => router.push(`/trip/abc/${name}`));
    }

    const headers = tripHeaders();
    expect(Object.keys(headers).sort()).toEqual(['index', ...SUB_SCREENS].sort());
    expect(headers.index?.hidden).toBe(false);
    for (const name of SUB_SCREENS) {
      expect(headers[name]?.hidden).toBe(!DOCUMENT_HEADERS.has(name));
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

  test('takes its colours from the kit tokens: background for the bar and the scene, accent for the tint', async () => {
    await openTrip(anchored, '/trip/abc');
    const header = tripHeaders().index;
    expect(header?.backgroundColor).toBe(COLOURS.background);
    expect(header?.color).toBe(COLOURS.accent);
    expect(contentBackground('index')).toBe(COLOURS.background);
  });

  test('every other trip screen is painted with the same background', async () => {
    await openTrip(anchored, '/trip/abc/notes');
    expect(contentBackground('notes')).toBe(COLOURS.background);
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

describe('trip/[id]/_layout - the document screens (004 T443; FR-007, FR-008, FR-033)', () => {
  const DOC_COLOURS: Record<string, string> = {
    ...COLOURS,
    foreground: 'rgb(77, 88, 99)',
  };

  beforeEach(() => {
    // The title face reads a THEME list (`useThemeColor([...])`); answer it by name too.
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string | string[]) =>
        Array.isArray(token)
          ? token.map((name) => DOC_COLOURS[name] ?? '#808080')
          : (DOC_COLOURS[token] ?? '#808080')) as never);
  });

  async function openDocuments() {
    const { app } = await openTrip(anchored, '/trip/abc');
    await act(async () => router.push('/trip/abc/documents'));
    return { app };
  }

  test('the list and the viewer have a native header titled for them; the camera keeps its own bar', async () => {
    await openTrip(anchored, '/trip/abc');
    await act(async () => router.push('/trip/abc/documents'));
    await act(async () => router.push('/trip/abc/document-view?documentId=d1'));
    await act(async () => router.push('/trip/abc/document-capture'));

    const headers = tripHeaders();
    expect(headers.documents?.hidden).toBe(false);
    expect(headers.documents?.title).toBe('Documents');
    expect(headers['document-view']?.hidden).toBe(false);
    expect(headers['document-view']?.title).toBe('Document');
    // A camera surface: its own bar, with the Back and the title the flows know.
    expect(headers['document-capture']?.hidden).toBe(true);
  });

  test('carry the tokens: canvas for the bar and the scene, accent tint, ink title in the display face, no hairline', async () => {
    await openDocuments();

    const header = tripHeaders().documents;
    expect(header?.hideShadow).toBe(true);
    expect(header?.backgroundColor).toBe(COLOURS.background);
    expect(header?.color).toBe(COLOURS.accent);
    expect(header?.titleColor).toBe(DOC_COLOURS.foreground);
    expect(contentBackground('documents')).toBe(COLOURS.background);
  });

  test('Back on the list is the one control named "Back" on top, and goes to the overview', async () => {
    const { app } = await openDocuments();
    expect(app.getPathname()).toBe('/trip/abc/documents');

    const backs = screen.getAllByLabelText('Back');
    expect(backs.at(-1)?.props.accessibilityRole).toBe('button');
    await fireEvent.press(backs.at(-1) as TestInstance);

    expect(app.getPathname()).toBe('/trip/abc');
    expect(screen.getByTestId('trip-index')).toBeTruthy();
  });

  test('Back on the viewer goes to the list, whatever it is called', async () => {
    const { app } = await openDocuments();
    await act(async () => router.push('/trip/abc/document-view?documentId=d1'));
    expect(app.getPathname()).toBe('/trip/abc/document-view');

    await fireEvent.press(screen.getAllByLabelText('Back').at(-1) as TestInstance);

    expect(app.getPathname()).toBe('/trip/abc/documents');
  });

  test('a document opened by a link keeps its params and its header', async () => {
    const { app } = await openTrip(anchored, '/trip/abc/document-view?documentId=d9');

    expect(app.getPathname()).toBe('/trip/abc/document-view');
    expect(app.getSearchParams()).toEqual({ id: 'abc', documentId: 'd9' });
    expect(tripHeaders()['document-view']?.hidden).toBe(false);
  });
});
