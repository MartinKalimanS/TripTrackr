/**
 * `trip/[id]/_layout` - the native header of the offline maps screen (tasks.md T444;
 * 004 FR-007, FR-008, FR-030; research D4-06; contract C4-9, C4-10 rule 4).
 *
 * Rendered through `expo-router/testing-library`, as trip-layout.test.tsx does: a real
 * router and the real native stack over an in-memory route map, so what is read is what the
 * navigator would hand the native header. The route's own screen is inert here (its suite
 * is offline-maps.test.tsx); under test is that the screen has a header, the title it
 * carries, the Back control it offers, and that nothing else of the trip stack changed.
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { fireEvent } from '@testing-library/react-native';
import { Stack, router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import * as HeroUI from 'heroui-native';
import { Text } from 'react-native';

type TestInstance = typeof screen.container;

jest.setTimeout(60_000);

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

function RootStack() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

function routes() {
  return {
    _layout: { default: RootStack, unstable_settings: { anchor: 'index' } },
    index: () => <Text>home</Text>,
    'trip/[id]/_layout': require('@/app/trip/[id]/_layout'),
    'trip/[id]/index': () => <Text>overview</Text>,
    'trip/[id]/notes': () => <Text>notes</Text>,
    'trip/[id]/offline-maps': () => <Text>offline maps</Text>,
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

/** The header config the navigator gave the trip stack's screen of this route name. */
function headerOf(name: string): Record<string, unknown> | undefined {
  const config = screen.container.queryAll(
    (node) =>
      node.type === 'RNSScreenStackHeaderConfig' &&
      !!node.parent &&
      insideTrip(node.parent) &&
      String(node.parent.props.screenId).startsWith(`${name}-`),
  )[0];
  return config?.props;
}

async function openOfflineMaps() {
  const app = renderRouter(routes(), { initialUrl: '/trip/abc/offline-maps' });
  await app;
  return { app };
}

describe('trip/[id]/_layout - the offline maps screen has a native header (FR-007)', () => {
  test('shows it, titled "Offline maps", the title the screen no longer draws itself', async () => {
    await openOfflineMaps();

    const header = headerOf('offline-maps');
    expect(header?.hidden).toBe(false);
    expect(header?.title).toBe('Offline maps');
  });

  test('is painted with the kit tokens and draws no hairline, as the overview’s is', async () => {
    await openOfflineMaps();

    const header = headerOf('offline-maps');
    expect(header?.backgroundColor).toBe(COLOURS.background);
    expect(header?.color).toBe(COLOURS.accent);
    expect(header?.hideShadow).toBe(true);
  });

  test('leaves the other sub-screens as they were: no header yet', async () => {
    await openOfflineMaps();
    await act(async () => {
      router.push('/trip/abc/notes');
    });

    expect(headerOf('notes')?.hidden).toBe(true);
    expect(headerOf('offline-maps')?.hidden).toBe(false);
  });
});

describe('trip/[id]/_layout - Back on the offline maps screen (FR-008, item 7)', () => {
  test('is the one control named "Back", replacing the native one rather than adding to it', async () => {
    await openOfflineMaps();

    const back = screen.getByLabelText('Back');
    expect(back.props.accessibilityRole).toBe('button');
    expect(screen.getAllByLabelText('Back')).toHaveLength(1);
    expect(headerOf('offline-maps')?.backButtonInCustomView).toBe(false);
    expect(headerOf('offline-maps')?.hideBackButton).toBe(false);
  });

  test('goes back to the trip it was opened from', async () => {
    const { app } = await openOfflineMaps();
    await act(async () => {
      router.push('/trip/abc');
    });
    await act(async () => {
      router.push('/trip/abc/offline-maps');
    });
    expect(app.getPathname()).toBe('/trip/abc/offline-maps');

    await fireEvent.press(screen.getAllByLabelText('Back').at(-1) as never);

    expect(app.getPathname()).toBe('/trip/abc');
  });

  test('goes home when the screen was opened with nothing beneath it', async () => {
    const { app } = await openOfflineMaps();
    expect(app.getPathname()).toBe('/trip/abc/offline-maps');

    await fireEvent.press(screen.getAllByLabelText('Back').at(-1) as never);

    expect(app.getPathname()).not.toBe('/trip/abc/offline-maps');
  });
});
