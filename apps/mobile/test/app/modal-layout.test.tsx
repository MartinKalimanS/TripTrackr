/**
 * `modal/_layout` and how the root presents it (tasks.md T427 modal part, T434; FR-007,
 * FR-008, FR-009, FR-030; research D4-06; contract C4-11).
 *
 * Rendered through `expo-router/testing-library`: a real router and the real native stack
 * over an in-memory route map, so what is read is what the navigator hands the native
 * screen (`RNSScreen`), not what a stand-in was told.
 *
 * Why the layout is not a `Stack` any more: presentation is an option of the screen that is
 * presented, and that screen is the root stack's `modal`. Expo's modals guide says that on
 * Android a form sheet supports neither native headers nor nested stack navigators ("render
 * [the title and actions] as part of the sheet content instead"), so the group is its own
 * `Slot`: the route's screen IS the sheet's content, the sheet draws its own title and its
 * Cancel (`FormSheet`), and there is no native header or Back inside a sheet (FR-009's
 * explicit Cancel is the way back; FR-008's Back is for pushed screens).
 *
 * NOT colocated in `src/app/`: expo-router treats every file there as a route.
 */
import { act, fireEvent } from '@testing-library/react-native';
import { Stack, router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { Pressable, Text } from 'react-native';

import { formSheetOptions } from '@/components/ui/form-sheet';

// A cold first render of the router tree transforms every module it touches.
jest.setTimeout(60_000);

// The layout wraps its route in the store gate; the gate has its own suite.
jest.mock('@/components/require-local-store', () => ({
  RequireLocalStore: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

/** A node of the rendered tree (the renderer's own type is not exported by the library). */
type TestInstance = typeof screen.container;

/** The app's root as `src/app/_layout.tsx` has it for the modal group. */
function RootStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="modal" options={formSheetOptions} />
    </Stack>
  );
}
const anchored = { default: RootStack, unstable_settings: { anchor: 'index' } };

function Sheet() {
  return (
    <Pressable testID="sheet-cancel" onPress={() => router.back()}>
      <Text>sheet</Text>
    </Pressable>
  );
}

function routes() {
  return {
    _layout: anchored,
    index: () => <Text>home</Text>,
    'modal/_layout': require('@/app/modal/_layout'),
    'modal/add-trip': Sheet,
    'modal/add-expense': () => <Text>expense</Text>,
  };
}

/** The router's handle is wrapped: returning it from an async function would unwrap it. */
async function open(url: string) {
  const app = renderRouter(routes(), { initialUrl: url });
  await app;
  return { app };
}

/** The native screens of the root stack, by route name (a modal is a `RNSModalScreen`). */
function nativeScreens(): Record<string, TestInstance> {
  const screens = screen.container.queryAll(
    (node) => node.type === 'RNSScreen' || node.type === 'RNSModalScreen',
  );
  return Object.fromEntries(
    screens.map((node) => [String(node.props.screenId).replace(/-[\w-]{21}$/, ''), node]),
  );
}

describe('modal/_layout - the presented route is a form sheet (FR-009)', () => {
  test('the root presents the modal group as a form sheet as tall as its contents, with a grabber', async () => {
    await open('/modal/add-trip');

    const modal = nativeScreens().modal;
    expect(modal?.props.stackPresentation).toBe('formSheet');
    // `fitToContents`, as the native screen encodes it (react-native-screens: -1).
    expect(modal?.props.sheetAllowedDetents).toEqual([-1]);
    expect(modal?.props.sheetGrabberVisible).toBe(true);
  });

  test('has no header of its own: the sheet draws its title, and Cancel is the way back', async () => {
    await open('/modal/add-trip');

    const headers = screen.container.queryAll(
      (node) => node.type === 'RNSScreenStackHeaderConfig',
    );
    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) expect(header.props.hidden).toBe(true);
  });

  test('has no navigator of its own inside the sheet (Android supports none there)', async () => {
    await open('/modal/add-trip');

    // The root stack's one screen container; a nested stack would add a second.
    expect(
      screen.container.queryAll((node) => node.type === 'RNSScreenStack'),
    ).toHaveLength(1);
    expect(screen.getByText('sheet')).toBeTruthy();
  });

  test('renders every route of the group as the sheet content', async () => {
    await open('/modal/add-expense');
    expect(screen.getByText('expense')).toBeTruthy();
  });
});

describe('modal/_layout - the anchor and the way out are untouched', () => {
  test('a deep link lands on the sheet with the anchor beneath it, and Cancel returns to it', async () => {
    const { app } = await open('/modal/add-trip');
    expect(app.getPathname()).toBe('/modal/add-trip');

    await fireEvent.press(screen.getByTestId('sheet-cancel'));

    expect(app.getPathname()).toBe('/');
    expect(screen.getByText('home')).toBeTruthy();
  });

  test('opening the sheet from the app and dismissing it leaves the screen beneath as it was', async () => {
    const { app } = await open('/');
    await act(async () => router.push('/modal/add-trip'));
    expect(app.getPathname()).toBe('/modal/add-trip');

    await act(async () => router.back());
    expect(app.getPathname()).toBe('/');
  });

  test('the layout declares no anchor or initial route of its own: the root keeps deep links', () => {
    const layout = jest.requireActual('@/app/modal/_layout') as Record<string, unknown>;
    expect(Object.keys(layout)).toEqual(['default']);
  });
});

describe('src/app/_layout - the real root hands the modal route the same options', () => {
  test('applies formSheetOptions to the `modal` screen, inside the signed-in guard, and nothing else', () => {
    const source = readFileSync(require.resolve('@/app/_layout'), 'utf8');
    expect(source).toMatch(/formSheetOptions/);
    expect(source).toMatch(
      /<Stack\.Screen name="modal" options=\{formSheetOptions\} \/>/,
    );
    // Untouched: the guard, the anchor and the other signed-in screens.
    expect(source).toMatch(/<Stack\.Protected guard=\{status === 'signed-in'\}>/);
    expect(source).toMatch(/anchor: '\(tabs\)'/);
    expect(source).toMatch(/<Stack\.Screen name="trip\/\[id\]" \/>/);
    expect(source).not.toMatch(/presentation: 'modal'/);
  });
});
