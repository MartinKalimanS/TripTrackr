/**
 * T426 - the `(tabs)` layout mounts the Atlas `TabBar` in the real navigator (feature 004,
 * contract C4-9; research D4-06).
 *
 * `test/components/tab-bar.test.tsx` builds the navigator's props by hand; this suite lets
 * the real JS `Tabs` navigator pass them, so what is pinned is the wiring: the bar renders
 * with its ids, moves the selection and its mark when a tab is pressed, reports its height
 * to the navigator, and the scenes it sits under are the same canvas colour the bar paints
 * (`bg-background`), so there is no seam between a screen and the strip.
 */
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

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
jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(theme: 'light' | 'dark') {
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'flat',
    tokens: Colors[theme],
  } as AppearanceContext);
}

function Home() {
  // A screen that floats a control above the bar reads the height like this.
  const height = useBottomTabBarHeight();
  return <Text testID="home-screen">{`bar-height:${height}`}</Text>;
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

/** `--background` of one theme in the generated stylesheet, which `bg-background` reads. */
function backgroundVariable(theme: 'light' | 'dark'): string {
  const css = readFileSync(
    path.resolve(__dirname, '../../src/theme/generated/theme.css'),
    'utf8',
  ).replace(/\r\n/g, '\n');
  const block = new RegExp(`@variant ${theme} \\{([\\s\\S]*?)\\n {4}\\}`).exec(css);
  return /--background:\s*([^;]+);/.exec(block?.[1] ?? '')?.[1]?.trim() ?? '';
}

beforeEach(() => mockAppearance('light'));

describe('(tabs) layout - the Atlas tab bar in the real navigator', () => {
  test('renders the bar with one tab per route, the first selected', async () => {
    await renderTabs();

    expect(await screen.findByTestId('tab-bar')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    for (const [id, title] of [
      ['tab-index', 'Globe'],
      ['tab-trips', 'Trips'],
      ['tab-profile', 'Profile'],
    ] as const) {
      expect(screen.getByTestId(id).props.accessibilityLabel).toBe(title);
    }
    expect(screen.getByTestId('tab-mark-index')).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-trips')).toBeNull();
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
    expect(screen.getByTestId('tab-mark-trips')).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-index')).toBeNull();
  });

  test('the height the bar measures reaches a screen through useBottomTabBarHeight()', async () => {
    await renderTabs();
    const bar = await screen.findByTestId('tab-bar');

    await fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 83 } },
    });

    await waitFor(() => expect(screen.getByText('bar-height:83')).toBeTruthy());
  });

  test.each(['light', 'dark'] as const)(
    'the %s scenes are painted with the canvas the bar paints: no seam above the divider',
    async (theme) => {
      mockAppearance(theme);
      await renderTabs();
      await screen.findByTestId('tab-bar');

      // The scene gets the canvas TOKEN from the layout, the bar gets the `bg-background`
      // CLASS. They name one colour: the stylesheet's `--background` is generated from the
      // palette's `canvas` (and `test/theme/theme-css-sync.test.ts` fails when it is not),
      // and `Colors[theme]` is the same palette.
      expect(sceneBackground('home-screen')).toBe(Colors[theme].canvas);
      expect(screen.getByTestId('tab-bar').props.className).toContain('bg-background');
      expect(backgroundVariable(theme).toLowerCase()).toBe(
        Colors[theme].canvas.toLowerCase(),
      );
    },
  );
});
