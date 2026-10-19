/**
 * T426, T526 - the `(tabs)` layout mounts the floating tab pill in the real navigator
 * (feature 005, contract C5-21; features 004 C4-9 and research D4-06 before it).
 *
 * `test/components/tab-bar.test.tsx` builds the navigator's props by hand; this suite lets
 * the real JS `Tabs` navigator pass them, so what is pinned is the wiring: the pill renders
 * with its ids, moves the selection and its capsule when a tab is pressed, reports its height
 * to the navigator, and the scenes it floats over are painted with the canvas token.
 */
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { StyleSheet, Text } from 'react-native';

import { pillBottomOffset } from '@/components/navigation/tab-metrics';
import { Colors } from '@/constants/theme';
import { useTabInset } from '@/hooks/use-tab-inset';
import type { AppearanceContext } from '@/hooks/use-appearance';
import { PaletteNames, type PaletteName } from '@/theme/palette';

import { backgroundVariable } from '../helpers/theme-css';

// The first render of a whole router tree pays for transforming every module it touches.
jest.setTimeout(60_000);

jest.mock('@/hooks/use-appearance');
// The gates in front of the tabs have suites of their own; here the tabs are the subject.
jest.mock('@/components/require-local-store', () => ({
  RequireLocalStore: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/components/sync/first-sync-gate', () => ({
  FirstSyncGate: ({ children }: { children: unknown }) => children,
}));
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(themeName: PaletteName) {
  useAppearance.mockReturnValue({
    theme: themeName.startsWith('dark') ? 'dark' : 'light',
    themeName,
    prefersMoreContrast: themeName.endsWith('-contrast'),
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    tokens: Colors[themeName],
  } as AppearanceContext);
}

/** The capsule is decoration, hidden from assistive technology: queries must ask for it. */
const HIDDEN = { includeHiddenElements: true } as const;

function Home() {
  // A screen that floats a control above the bar reads the height like this.
  const height = useBottomTabBarHeight();
  // A scroll container reads the clearance like this: the height plus 16 dp.
  const inset = useTabInset();
  return <Text testID="home-screen">{`bar-height:${height} inset:${inset}`}</Text>;
}

function renderTabs() {
  return renderRouter({
    '(tabs)/_layout': require('@/app/(tabs)/_layout'),
    '(tabs)/index': Home,
    '(tabs)/trips': () => <Text testID="trips-screen">trips</Text>,
    '(tabs)/profile': () => <Text testID="profile-screen">profile</Text>,
  });
}

/** The canvas of the nearest ancestor that paints one: the navigator's scene. */
function sceneBackground(testID: string): unknown {
  for (let node = screen.getByTestId(testID).parent; node; node = node.parent) {
    const { backgroundColor } = StyleSheet.flatten(node.props.style as never) ?? {};
    if (backgroundColor !== undefined) return backgroundColor;
  }
  return undefined;
}

beforeEach(() => mockAppearance('light'));

describe('(tabs) layout - the tab pill in the real navigator', () => {
  test('renders the bar with one tab per route, the first selected', async () => {
    await renderTabs();

    expect(await screen.findByTestId('tab-bar')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    for (const [id, title] of [
      ['tab-index', 'Globe'],
      ['tab-trips', 'Trips'],
      ['tab-profile', 'You'],
    ] as const) {
      expect(screen.getByTestId(id).props.accessibilityLabel).toBe(title);
    }
    expect(screen.getByTestId('tab-mark-index', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-trips', HIDDEN)).toBeNull();
  });

  test('pressing a tab opens its screen and moves the selection and the mark', async () => {
    await renderTabs();
    await screen.findByTestId('tab-bar');

    await fireEvent.press(screen.getByTestId('tab-trips'));

    await waitFor(() => expect(screen.getByTestId('trips-screen')).toBeTruthy());
    expect(screen.getByTestId('tab-trips').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(screen.getByTestId('tab-index').props.accessibilityState).toMatchObject({
      selected: false,
    });
    expect(screen.getByTestId('tab-mark-trips', HIDDEN)).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-index', HIDDEN)).toBeNull();
  });

  test('the pill reports its height plus its bottom offset to a screen through useBottomTabBarHeight()', async () => {
    await renderTabs();
    const bar = await screen.findByTestId('tab-bar');

    // The test renderer has no home indicator: the pill sits 12 dp from the bottom, so a
    // screen is told where the pill's top edge is, 64 + 12 dp from the bottom of the screen.
    await fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 16, y: 0, width: 358, height: 64 } },
    });

    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`^bar-height:${64 + pillBottomOffset(0)} `)),
      ).toBeTruthy(),
    );
  });

  test('every scene is told how much to keep clear: the reported height plus 16 dp, through useTabInset()', async () => {
    await renderTabs();
    const bar = await screen.findByTestId('tab-bar');
    const reported = 96 + pillBottomOffset(0);

    await fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 16, y: 0, width: 358, height: 96 } },
    });

    await waitFor(() =>
      expect(
        screen.getByText(`bar-height:${reported} inset:${reported + 16}`),
      ).toBeTruthy(),
    );
  });

  test.each(PaletteNames)(
    'the %s scenes are painted with the canvas token, under the floating pill',
    async (theme) => {
      mockAppearance(theme);
      await renderTabs();
      await screen.findByTestId('tab-bar');

      // The scene gets the canvas TOKEN from the layout. The stylesheet's `--background` is
      // generated from the palette's `canvas` (`test/theme/theme-css-sync.test.ts` fails
      // when it is not), and `Colors[theme]` is the same palette, increased contrast
      // included. The pill floats over the scene: it paints its own surface, not the canvas.
      expect(sceneBackground('home-screen')).toBe(Colors[theme].canvas);
      expect(backgroundVariable(theme).toLowerCase()).toBe(
        Colors[theme].canvas.toLowerCase(),
      );
    },
  );
});
