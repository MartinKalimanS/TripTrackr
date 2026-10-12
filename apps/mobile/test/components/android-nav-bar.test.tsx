/**
 * T527 - the Android navigation bar (feature 005, research D5-05 and D5-21, contract C5-21;
 * FR-022, FR-023, FR-028): Material 3's own shape where Android has one. Full width, 64 dp
 * plus the system inset (a minimum: it grows with the text), cream with a hairline on its top
 * edge, a 56 by 32 dp indicator behind the selected icon and the label beneath it. No blur,
 * no glass, no lift, no fade: nothing on Android is translucent chrome.
 *
 * `TabBar` is the one export the `(tabs)` layout renders and it chooses by `Platform.OS`;
 * the dispatch is asserted here, the pill by `tab-bar.test.tsx`. Like the pill, the bar keeps
 * every id and name (`tab-bar`, `tab-<name>`, `tab-mark-<name>` now on the selected indicator),
 * the `tablist` and `tab` roles and the selected state, reports its measured height (which
 * already includes the inset) so a scene can keep clear of it, and shows the selection by an
 * indicator, a filled glyph and a heavier label (never colour alone).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as fs from 'node:fs';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import { Dimensions, Platform, StyleSheet } from 'react-native';

import { AndroidNavBar } from '@/components/navigation/android-nav-bar';
import { TabBar } from '@/components/navigation/tab-bar';
import { AndroidBarMetrics } from '@/components/navigation/tab-metrics';
import { Radii, Palettes } from '@/theme';

import { appearanceOf } from '../helpers/appearance';
import { glyphsIn } from '../helpers/icons';
import { mockThemeColors } from '../helpers/theme-colors';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};
const glassModule = jest.requireMock('expo-glass-effect') as {
  isLiquidGlassAvailable: jest.Mock;
  isGlassEffectAPIAvailable: jest.Mock;
};

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

function makeProps(focusedIndex = 0, bottomInset = 24): BottomTabBarProps {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigate = jest.fn();
  return {
    state: {
      key: 'tabs',
      index: focusedIndex,
      routeNames: ROUTES.map((r) => r.name),
      routes: ROUTES.map((r) => ({ key: r.key, name: r.name })),
      type: 'tab',
      stale: false,
      history: [],
      preloadedRouteKeys: [],
    },
    descriptors: Object.fromEntries(
      ROUTES.map((route) => [
        route.key,
        {
          options: { title: route.title },
          route: { key: route.key, name: route.name },
          navigation: {},
          render: () => null,
        },
      ]),
    ),
    navigation: { emit, navigate },
    insets: { top: 24, left: 0, right: 0, bottom: bottomInset },
  } as unknown as BottomTabBarProps;
}

beforeEach(() => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  });
  useAppearance.mockReturnValue(appearanceOf('light'));
  mockThemeColors('light');
});
afterEach(() => jest.restoreAllMocks());

type Node = { props: Record<string, unknown> };
const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (node: Node) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const bar = () => screen.getByTestId('tab-bar');
const HIDDEN = { includeHiddenElements: true } as const;
const marks = () => screen.queryAllByTestId(/^tab-mark-/, HIDDEN);
const layout = (height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
});

describe('TabBar - chosen by the platform (T527)', () => {
  test('Android gets the navigation bar: edge to edge, no surface of the pill', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(styleOf(bar())).toMatchObject({ left: 0, right: 0, bottom: 0 });
    expect(screen.queryByTestId(/^tab-surface-/)).toBeNull();
  });

  test('iOS gets the pill: 16 dp from the sides, on a surface', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<TabBar {...makeProps()} />);

    expect(styleOf(bar())).toMatchObject({ left: 16, right: 16 });
    expect(screen.getByTestId(/^tab-surface-(glass|blur|solid)$/)).toBeTruthy();
  });
});

describe('<AndroidNavBar> identity - FR-023', () => {
  test('one tab per route, named by the route title; the third is "You"', async () => {
    await render(<AndroidNavBar {...makeProps()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(bar().props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab-index').props.accessibilityLabel).toBe('Globe');
    expect(screen.getByTestId('tab-trips').props.accessibilityLabel).toBe('Trips');
    expect(screen.getByTestId('tab-profile').props.accessibilityLabel).toBe('You');
  });

  test.each([0, 1, 2])(
    'exactly one tab is selected when tab %i is focused, and it alone has the mark',
    async (i) => {
      await render(<AndroidNavBar {...makeProps(i)} />);

      const selected = screen
        .getAllByRole('tab')
        .filter((tab) => tab.props.accessibilityState.selected === true);
      expect(selected).toHaveLength(1);
      expect(selected[0]!.props.testID).toBe(`tab-${ROUTES[i]!.name}`);
      expect(marks()).toHaveLength(1);
      expect(marks()[0]!.props.testID).toBe(`tab-mark-${ROUTES[i]!.name}`);
      expect(selected[0]).toContainElement(marks()[0]!);
    },
  );

  test('navigates after giving listeners a veto, and emits tabLongPress', async () => {
    const props = makeProps(0);
    await render(<AndroidNavBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: 'trips-1',
        canPreventDefault: true,
      }),
    );
    expect(props.navigation.navigate).toHaveBeenCalledWith('trips', undefined);

    await fireEvent(screen.getByLabelText('You'), 'longPress');
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabLongPress', target: 'profile-1' }),
    );
  });

  test('does not navigate when a listener prevents the press', async () => {
    const props = makeProps(0);
    (props.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await render(<AndroidNavBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });
});

describe('<AndroidNavBar> geometry - FR-022, D5-21', () => {
  test('is full width and sits on the bottom edge, 64 dp of content as a minimum', async () => {
    await render(<AndroidNavBar {...makeProps()} />);

    expect(styleOf(bar())).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
    });
    expect(AndroidBarMetrics.height).toBe(64);
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBe(AndroidBarMetrics.height);
      // 64 dp is above the 48 dp Android touch target, and a tab is a third of the width.
      expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(48);
      expect(styleOf(tab).minWidth).toBeGreaterThanOrEqual(48);
    }
    expect(styleOf(bar()).height).toBeUndefined();
    expect(styleOf(bar()).maxHeight).toBeUndefined();
  });

  test.each([0, 16, 24, 48])(
    'the system inset of %s dp is added BELOW the content, whatever it is (never a fixed number)',
    async (inset) => {
      await render(<AndroidNavBar {...makeProps(0, inset)} />);
      expect(styleOf(bar()).paddingBottom ?? 0).toBe(inset);
    },
  );

  test('is cream with ONE hairline on its top edge, and no lift, blur or fade', async () => {
    await render(<AndroidNavBar {...makeProps()} />);

    const style = styleOf(bar());
    expect(style.backgroundColor).toBe(Palettes.light.surfaceSecondary.toLowerCase());
    expect(style.borderTopWidth).toBe(StyleSheet.hairlineWidth);
    expect(style.borderTopColor).toBe(Palettes.light.hairline.toLowerCase());
    for (const key of ['borderWidth', 'borderBottomWidth', 'borderLeftWidth']) {
      expect(style[key]).toBeUndefined();
    }
    expect(style.boxShadow).toBeUndefined();
    expect(style.elevation).toBeUndefined();
    expect(style.borderRadius).toBeUndefined();
    expect(JSON.stringify(screen.toJSON())).not.toContain('ExpoBlur');
    expect(screen.queryByTestId('glass-view')).toBeNull();
  });

  test('is opaque in every appearance: reduced transparency and the contrast themes change nothing', async () => {
    glassModule.isLiquidGlassAvailable.mockReturnValue(true);
    useAppearance.mockReturnValue(
      appearanceOf('dark-contrast', { prefersLessTransparency: true }),
    );
    mockThemeColors('dark-contrast');
    await render(<AndroidNavBar {...makeProps()} />);

    expect(styleOf(bar()).backgroundColor).toBe(
      Palettes['dark-contrast'].surfaceSecondary.toLowerCase(),
    );
    glassModule.isLiquidGlassAvailable.mockReturnValue(false);
  });

  test('reports its measured height, inset included, to the navigator, again when it changes', async () => {
    const report = jest.fn();
    await render(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <AndroidNavBar {...makeProps(0, 24)} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );

    await fireEvent(bar(), 'layout', layout(88));
    await fireEvent(bar(), 'layout', layout(120));
    expect(report.mock.calls).toEqual([[88], [120]]);
  });

  test('measures without a navigator to report to', async () => {
    await render(<AndroidNavBar {...makeProps()} />);
    await fireEvent(bar(), 'layout', layout(88));
    expect(bar()).toBeTruthy();
  });
});

describe('<AndroidNavBar> the indicator - FR-022', () => {
  test('is 56 by 32 dp, a capsule, behind the icon, and tinted only on the selected tab', async () => {
    await render(<AndroidNavBar {...makeProps(1)} />);

    const [selected] = marks();
    expect(styleOf(selected!)).toMatchObject({
      width: AndroidBarMetrics.indicatorWidth,
      height: AndroidBarMetrics.indicatorHeight,
      borderRadius: Radii.full,
      backgroundColor: Palettes.light.accentTint.toLowerCase(),
    });
    expect([AndroidBarMetrics.indicatorWidth, AndroidBarMetrics.indicatorHeight]).toEqual(
      [56, 32],
    );
    // The unselected tabs have a clear indicator of the same size: nothing jumps.
    const clear = screen.getAllByTestId(/^tab-indicator-/, HIDDEN);
    expect(clear).toHaveLength(2);
    for (const indicator of clear) {
      expect(styleOf(indicator)).toMatchObject({
        width: 56,
        height: 32,
        borderRadius: Radii.full,
      });
    }
  });

  test('is decoration: hidden from assistive technology and from touches', async () => {
    await render(<AndroidNavBar {...makeProps(0)} />);
    const mark = marks()[0]!;
    expect(mark.props.pointerEvents).toBe('none');
    expect(mark.props.accessibilityElementsHidden).toBe(true);
    expect(mark.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  test('the selected tab shows a filled glyph and a heavier label; the others are regular and muted', async () => {
    await render(<AndroidNavBar {...makeProps(2)} />);

    expect(glyphsIn().map((glyph) => glyph.weight)).toEqual([
      'regular',
      'regular',
      'fill',
    ]);
    for (const glyph of glyphsIn()) {
      expect(glyph.size).toBe(AndroidBarMetrics.iconSize);
    }
    const selected = classesOf(screen.getByText('You'));
    expect(selected).toEqual(
      expect.arrayContaining(['text-foreground', 'font-body-semibold']),
    );
    for (const title of ['Globe', 'Trips']) {
      const rest = classesOf(screen.getByText(title));
      expect(rest).toContain('text-muted');
      expect(rest).not.toContain('font-body-semibold');
    }
  });

  test('the label sits beneath the indicator, wraps, and is capped at 1.3 times', async () => {
    await render(<AndroidNavBar {...makeProps(0)} />);

    for (const route of ROUTES) {
      const label = screen.getByText(route.title);
      expect(label.props.maxFontSizeMultiplier).toBe(1.3);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
    }
    // Order inside a tab: the indicator (with the glyph), then the label.
    type Json = { props?: { testID?: string }; children?: Json[] | null };
    const find = (node: Json | Json[] | null): Json | undefined => {
      if (node === null || node === undefined) return undefined;
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      if (node.props?.testID === 'tab-index') return node;
      return find(node.children ?? null);
    };
    const parts = find(screen.toJSON() as Json | Json[] | null)?.children ?? [];
    expect(parts).toHaveLength(2);
    expect(parts[0]!.props?.testID).toBe('tab-mark-index');
    expect(JSON.stringify(parts[1])).toContain('Globe');
  });
});

describe('<AndroidNavBar> imports - D5-21', () => {
  test('draws no blur or glass: neither module is imported', () => {
    const source = fs.readFileSync(
      require.resolve('@/components/navigation/android-nav-bar'),
      'utf8',
    );
    const imported = [...source.matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    expect(imported).toEqual(
      expect.arrayContaining(['@/components/ui/tappable', '@/components/ui/icon']),
    );
    for (const module of imported) {
      expect(module).not.toMatch(/expo-blur|expo-glass-effect|heroui-native|uniwind/);
    }
  });
});
