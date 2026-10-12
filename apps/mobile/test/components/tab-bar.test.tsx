/**
 * T426 - the Atlas tab bar (feature 004, contract C4-9; FR-010, FR-025, FR-026, FR-029,
 * FR-030; research D4-06; feature 003 FR-013 to FR-016).
 *
 * The bar is a flat strip painted with the canvas colour, one hairline divider on its top
 * edge, and one `Tappable` per route. What is asserted here is what a traveller relies on:
 * every route is a reachable, labelled tab; the selected one is announced as selected and
 * shown by more than colour (a filled icon, a heavier label and a mark that survives
 * greyscale); the touch target respects the platform minimum; the content stays inside
 * 56 dp at the default text size and is left free to grow, unclipped, at a larger one; and
 * the bar clears the home indicator.
 *
 * Jest has no layout engine, so the 56 dp budget is arithmetic over the constants the bar
 * renders with (`TabMetrics`), and the rendered styles are asserted to BE those constants.
 * The kit's text and `expo-symbols` are plain nodes that forward their props, so colours
 * are the semantic classes and tones the bar ASKS for, never values.
 *
 * The props are the `BottomTabBarProps` shape the JS `Tabs` navigator passes to a custom
 * `tabBar`, built by hand so the component's own behaviour is tested without mounting a
 * navigator; `test/app/tabs-layout.test.tsx` mounts the real one.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as fs from 'node:fs';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet } from 'react-native';

import { TabBar, TabContentHeight, TabMetrics } from '@/components/navigation/tab-bar';
import { BorderHairline, MinTouchTarget } from '@/constants/theme';
import { FocusRing, TextRoles } from '@/theme';

// `expo-symbols` is replaced by a view that carries the props it was given, so the test
// reads the symbol each tab asked for (both platform names), its size and its tint.
jest.mock('expo-symbols', () => {
  const { View } = require('react-native');
  return {
    SymbolView: (props: Record<string, unknown>) => <View testID="symbol" {...props} />,
  };
});

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'Profile' },
] as const;

/** The symbols each tab asks for: the outline at rest, the filled one when selected. */
const ICONS = {
  index: {
    rest: 'globe.europe.africa',
    filled: 'globe.europe.africa.fill',
    android: 'globe',
  },
  trips: { rest: 'suitcase', filled: 'suitcase.fill', android: 'luggage' },
  profile: {
    rest: 'person.crop.circle',
    filled: 'person.crop.circle.fill',
    android: 'account_circle',
  },
} as const;

/** The most a bar's content may be at the default text size, above the inset. */
const BUDGET = 56;

function makeProps(focusedIndex = 0, bottomInset = 34): BottomTabBarProps {
  const emit = jest.fn(() => ({ defaultPrevented: false }));
  const navigate = jest.fn();
  const descriptors = Object.fromEntries(
    ROUTES.map((route) => [
      route.key,
      {
        options: { title: route.title },
        route: { key: route.key, name: route.name },
        navigation: {},
        render: () => null,
      },
    ]),
  );

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
    descriptors,
    navigation: { emit, navigate },
    insets: { top: 47, left: 0, right: 0, bottom: bottomInset },
  } as unknown as BottomTabBarProps;
}

/** The same props with one more route, whose options the caller chooses. */
function withExtraRoute(options: Record<string, unknown>): BottomTabBarProps {
  const base = makeProps();
  return {
    ...base,
    state: {
      ...base.state,
      routes: [...base.state.routes, { key: 'extra-1', name: 'extra' }],
      routeNames: [...base.state.routeNames, 'extra'],
    },
    descriptors: {
      ...base.descriptors,
      'extra-1': { options, route: { key: 'extra-1', name: 'extra' } },
    },
  } as unknown as BottomTabBarProps;
}

/** Sets the window font scale `useWindowDimensions` (and so `Tappable`) reports. */
function mockFontScale(fontScale: number) {
  jest.spyOn(Dimensions, 'get').mockReturnValue({
    width: 390,
    height: 844,
    scale: 3,
    fontScale,
  });
}

/**
 * The platform minimum touch target on `os`. `MinTouchTarget` is read once, when
 * `@/constants/theme` loads, so it is loaded again under that platform in an isolated
 * module registry (`Platform.select` and `Platform.OS` both answer for `os`).
 */
function minTouchTargetOn(os: 'ios' | 'android'): number {
  let target = 0;
  jest.isolateModules(() => {
    const { Platform } = require('react-native') as typeof import('react-native');
    jest.replaceProperty(Platform, 'OS', os);
    jest
      .spyOn(Platform, 'select')
      .mockImplementation(((spec: Record<string, unknown>) => spec[os]) as never);
    target = (require('@/constants/theme') as typeof import('@/constants/theme'))
      .MinTouchTarget;
  });
  return target;
}

beforeEach(() => mockFontScale(1));
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
type Node = { props: Record<string, unknown> };
const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<
    string,
    number | string | boolean
  >;
const classesOf = (node: Node) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
const barStyle = () => styleOf(screen.getByTestId('tab-bar'));
const symbols = () => screen.getAllByTestId('symbol', hidden);
const labelOf = (text: string) => screen.getByText(text);

describe('<TabBar> identity - C4-9, FR-030', () => {
  test('renders one tab per route, named by the route title', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(labelOf(route.title)).toBeTruthy();
      expect(screen.getByLabelText(route.title).props.accessibilityRole).toBe('tab');
    }
  });

  test('keeps the ids the Maestro flows use, and the tablist role on the bar', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(screen.getByTestId('tab-bar').props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab-index').props.accessibilityLabel).toBe('Globe');
    expect(screen.getByTestId('tab-trips').props.accessibilityLabel).toBe('Trips');
    expect(screen.getByTestId('tab-profile').props.accessibilityLabel).toBe('Profile');
  });

  test('a route may name its own button id, label and accessible name', async () => {
    await render(
      <TabBar
        {...withExtraRoute({
          title: 'Extra',
          tabBarLabel: 'More',
          tabBarAccessibilityLabel: 'More options',
          tabBarButtonTestID: 'custom-tab',
        })}
      />,
    );

    expect(screen.getByTestId('custom-tab').props.accessibilityLabel).toBe(
      'More options',
    );
    expect(labelOf('More')).toBeTruthy();
  });

  test('a route with no title is named by its route name', async () => {
    await render(<TabBar {...withExtraRoute({})} />);
    expect(screen.getByLabelText('extra')).toBeTruthy();
    expect(screen.getByTestId('tab-extra')).toBeTruthy();
  });

  test('announces the focused tab as selected and no other (FR-025)', async () => {
    await render(<TabBar {...makeProps(1)} />);

    const [globe, trips, profile] = screen.getAllByRole('tab');
    expect(trips!.props.accessibilityState).toMatchObject({ selected: true });
    expect(globe!.props.accessibilityState).toMatchObject({ selected: false });
    expect(profile!.props.accessibilityState).toMatchObject({ selected: false });
  });

  test.each([0, 1, 2])(
    'exactly one tab is selected when tab %i is focused',
    async (i) => {
      await render(<TabBar {...makeProps(i)} />);
      const selected = screen
        .getAllByRole('tab')
        .filter((tab) => tab.props.accessibilityState.selected === true);
      expect(selected).toHaveLength(1);
      expect(selected[0]!.props.testID).toBe(`tab-${ROUTES[i]!.name}`);
    },
  );

  test('a route without a registered icon still gets a labelled, reachable tab', async () => {
    await render(<TabBar {...withExtraRoute({ title: 'Extra' })} />);
    expect(screen.getByLabelText('Extra')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length + 1);
    expect(symbols()).toHaveLength(ROUTES.length);
  });
});

describe('<TabBar> the strip - feature 003 FR-014, C4-9', () => {
  test('is painted with the canvas colour through the semantic class, not a value', async () => {
    await render(<TabBar {...makeProps()} />);
    const bar = screen.getByTestId('tab-bar');
    expect(classesOf(bar)).toContain('bg-background');
    expect(styleOf(bar).backgroundColor).toBeUndefined();
  });

  test('has ONE divider: the border token as colour, a hairline as the only width, on the top edge', async () => {
    await render(<TabBar {...makeProps()} />);
    const classes = classesOf(screen.getByTestId('tab-bar'));
    const style = barStyle();

    // The colour is the class; the width is the style, so the two cannot disagree.
    expect(classes).toContain('border-border');
    const widthClasses = classes.filter((c) =>
      /^border(-[trblxyse])?(-\d+|-\[.*\])?$/.test(c),
    );
    expect(widthClasses).toEqual([]);
    expect(style.borderTopWidth).toBe(BorderHairline);
    expect(style.borderTopWidth).toBeGreaterThan(0);
    for (const key of [
      'borderWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'borderRightWidth',
    ]) {
      expect(style[key]).toBeUndefined();
    }
  });

  test('no tab carries a raised, recessed or bordered surface (never a fill or an edge at rest)', async () => {
    await render(<TabBar {...makeProps(0)} />);

    for (const tab of screen.getAllByRole('tab')) {
      const style = styleOf(tab);
      expect(style.boxShadow).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
      expect(style.backgroundColor).toBeUndefined();
      expect(style.outlineWidth).toBeUndefined();
      const surfaceClasses = classesOf(tab).filter((c) =>
        /^(bg-|border|shadow|ring|outline)/.test(c),
      );
      expect(surfaceClasses).toEqual([]);
    }
  });
});

describe('<TabBar> selection - FR-010, FR-025', () => {
  test.each([0, 1, 2])('only the selected tab has a mark (tab %i)', async (i) => {
    await render(<TabBar {...makeProps(i)} />);
    for (const [index, route] of ROUTES.entries()) {
      const mark = screen.queryByTestId(`tab-mark-${route.name}`);
      expect(mark === null).toBe(index !== i);
    }
  });

  test('the mark is a short accent bar above the icon that costs the bar no height', async () => {
    await render(<TabBar {...makeProps(0)} />);
    const mark = screen.getByTestId('tab-mark-index');
    const style = styleOf(mark);

    expect(classesOf(mark)).toContain('bg-accent');
    expect(style.width).toBe(TabMetrics.markWidth);
    expect(style.height).toBe(TabMetrics.markHeight);
    expect(TabMetrics.markHeight).toBeGreaterThanOrEqual(3);
    expect(TabMetrics.markHeight).toBeLessThanOrEqual(4);
    expect(TabMetrics.markWidth).toBeGreaterThanOrEqual(20);
    expect(TabMetrics.markWidth).toBeLessThanOrEqual(28);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(0);
    // Inside the selected tab, so it sits above that tab's icon and no other.
    expect(screen.getByTestId('tab-index')).toContainElement(mark);
  });

  test('the selected label is accent ink (Sunrise: accentText) and heavier than the others, which are muted', async () => {
    await render(<TabBar {...makeProps(1)} />);

    const selected = classesOf(labelOf('Trips'));
    expect(selected).toEqual(expect.arrayContaining(['text-accent-text', 'font-bold']));
    for (const title of ['Globe', 'Profile']) {
      const rest = classesOf(labelOf(title));
      expect(rest).toContain('text-muted');
      expect(rest).not.toContain('font-bold');
      expect(rest).not.toContain('text-accent-text');
    }
  });

  test.each(Object.entries(ICONS))(
    'the %s tab shows its filled symbol only while selected',
    async (name, icon) => {
      const index = ROUTES.findIndex((route) => route.name === name);
      await render(<TabBar {...makeProps(index)} />);
      const selected = symbols()[index]!.props.name as { ios: string; android: string };
      expect(selected).toEqual({ ios: icon.filled, android: icon.android });
      expect(selected.ios).toMatch(/\.fill$/);

      await render(<TabBar {...makeProps((index + 1) % ROUTES.length)} />);
      const rest = symbols().at(index - ROUTES.length)!.props.name as {
        ios: string;
        android: string;
      };
      expect(rest).toEqual({ ios: icon.rest, android: icon.android });
      expect(rest.ios).not.toMatch(/\.fill$/);
    },
  );

  test('tints the selected icon with the accent and the others with the muted ink', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `themed:${token}`) as never);
    await render(<TabBar {...makeProps(2)} />);

    const tints = symbols().map((symbol) => symbol.props.tintColor);
    expect(tints).toEqual(['themed:muted', 'themed:muted', 'themed:accent']);
  });
});

describe('<TabBar> the 56 dp budget - feature 003 FR-013', () => {
  test('a tab holds an icon, a gap, one caption line and its padding: the constants it renders with', async () => {
    await render(<TabBar {...makeProps(0)} />);

    expect(TabMetrics.captionLineHeight).toBe(TextRoles.caption.lineHeight);
    expect(TabContentHeight).toBe(
      TabMetrics.iconSize +
        TabMetrics.gap +
        TabMetrics.captionLineHeight +
        2 * TabMetrics.paddingY,
    );
    for (const symbol of symbols()) expect(symbol.props.size).toBe(TabMetrics.iconSize);
    for (const route of ROUTES) {
      expect(classesOf(labelOf(route.title))).toContain(
        `leading-[${TabMetrics.captionLineHeight}px]`,
      );
    }
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab)).toMatchObject({
        gap: TabMetrics.gap,
        paddingVertical: TabMetrics.paddingY,
        paddingHorizontal: TabMetrics.paddingX,
      });
    }
    expect(barStyle().paddingTop ?? 0).toBe(0);
    expect(barStyle().marginTop ?? 0).toBe(0);
  });

  test.each([
    ['ios', 44],
    ['android', 48],
  ] as const)(
    'is at most 56 dp on %s: the divider plus the larger of the touch target and the content',
    (os, floor) => {
      const target = minTouchTargetOn(os);
      expect(target).toBe(floor);

      const tab = Math.max(target, TabContentHeight);
      expect(tab + BorderHairline).toBeLessThanOrEqual(BUDGET);
      // The content on its own fits too, so a one-line caption is never what grows it.
      expect(TabContentHeight + BorderHairline).toBeLessThanOrEqual(BUDGET);
    },
  );

  test('the rendered tab is never shorter than the platform touch target, nor narrower', async () => {
    await render(<TabBar {...makeProps()} />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
      expect(styleOf(tab).minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    }
  });

  test('reports its measured height to the navigator, again when it changes', async () => {
    const report = jest.fn();
    await render(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <TabBar {...makeProps()} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );
    const layout = (height: number) => ({
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
    });

    await fireEvent(screen.getByTestId('tab-bar'), 'layout', layout(96));
    await fireEvent(screen.getByTestId('tab-bar'), 'layout', layout(140));
    expect(report.mock.calls).toEqual([[96], [140]]);
  });

  test('measures without a navigator to report to', async () => {
    await render(<TabBar {...makeProps()} />);
    await fireEvent(screen.getByTestId('tab-bar'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 96 } },
    });
    expect(screen.getByTestId('tab-bar')).toBeTruthy();
  });

  test('clears the home indicator with the safe-area bottom inset, outside the budget', async () => {
    await render(<TabBar {...makeProps(0, 34)} />);
    expect(barStyle().paddingBottom).toBe(34);
  });

  test('adds no bottom padding on a device with no inset', async () => {
    await render(<TabBar {...makeProps(0, 0)} />);
    expect(barStyle().paddingBottom ?? 0).toBe(0);
  });
});

describe('<TabBar> large text - feature 003 FR-016, FR-029', () => {
  test.each([1, 1.3, 2, 3.1])(
    'at font scale %s the tab minimum is the touch target, not the touch target times the scale',
    async (fontScale) => {
      mockFontScale(fontScale);
      await render(<TabBar {...makeProps()} />);

      for (const tab of screen.getAllByRole('tab')) {
        expect(styleOf(tab).minHeight).toBe(MinTouchTarget);
      }
    },
  );

  test.each([0.5, 0.8, 1])(
    'at font scale %s a tab never goes below the touch target',
    async (fontScale) => {
      mockFontScale(fontScale);
      await render(<TabBar {...makeProps()} />);

      for (const tab of screen.getAllByRole('tab')) {
        expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
        expect(styleOf(tab).minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
      }
    },
  );

  test('the content decides the height at a large size: the caption line grows, nothing caps or clips it', async () => {
    mockFontScale(2);
    await render(<TabBar {...makeProps()} />);

    // The platform scales a line height with the font, so at scale 2 the one caption
    // line is twice as tall and the tab has to hold that: more than the touch target.
    const grown =
      TabMetrics.iconSize +
      TabMetrics.gap +
      TabMetrics.captionLineHeight * 2 +
      2 * TabMetrics.paddingY;
    expect(grown).toBeGreaterThan(TabContentHeight);
    expect(grown).toBeGreaterThan(MinTouchTarget);

    for (const style of [barStyle(), ...screen.getAllByRole('tab').map(styleOf)]) {
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
      expect(style.overflow).not.toBe('hidden');
    }
  });

  test('a label is left to wrap: not capped to a line, shrunk to fit, clamped or pinned to a height', async () => {
    mockFontScale(2);
    await render(<TabBar {...makeProps()} />);

    for (const route of ROUTES) {
      const label = labelOf(route.title);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.ellipsizeMode).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      expect(label.props.maxFontSizeMultiplier).toBeUndefined();
      expect(label.props.allowFontScaling).not.toBe(false);
      const style = styleOf(label);
      for (const key of ['height', 'maxHeight', 'lineHeight', 'overflow']) {
        expect(style[key]).toBeUndefined();
      }
    }
  });
});

describe('<TabBar> press and focus - FR-026, C4-9', () => {
  test('navigates to a tab when it is pressed, after giving listeners a veto', async () => {
    const props = makeProps(0);
    await render(<TabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));

    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: 'trips-1',
        canPreventDefault: true,
      }),
    );
    // Params are forwarded (undefined here) so a tab that carries an href object keeps
    // it: the same call shape as React Navigation's own bar.
    expect(props.navigation.navigate).toHaveBeenCalledWith('trips', undefined);
  });

  test('does not navigate when a tabPress listener prevents it', async () => {
    const props = makeProps(0);
    (props.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await render(<TabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));

    expect(props.navigation.emit).toHaveBeenCalledTimes(1);
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  test('emits tabLongPress on a long press, as the default bar does', async () => {
    const props = makeProps();
    await render(<TabBar {...props} />);

    await fireEvent(screen.getByLabelText('Trips'), 'longPress');
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabLongPress', target: 'trips-1' }),
    );
    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  test('draws the focus ring on a focused tab and drops it on blur (through Tappable)', async () => {
    await render(<TabBar {...makeProps()} />);

    await fireEvent(screen.getByLabelText('Trips'), 'focus');
    expect(styleOf(screen.getByLabelText('Trips'))).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
    });

    await fireEvent(screen.getByLabelText('Trips'), 'blur');
    expect(styleOf(screen.getByLabelText('Trips')).outlineWidth).toBeUndefined();
  });
});

describe('<TabBar> imports - review rules', () => {
  // Colour literals and kit imports outside `components/ui/**` are lint errors
  // (`no-restricted-syntax`, `no-restricted-imports`); what lint cannot say is which
  // building blocks the bar is made from.
  const imported = [
    ...fs
      .readFileSync(require.resolve('@/components/navigation/tab-bar'), 'utf8')
      .matchAll(/from '([^']+)'/g),
  ].map((match) => match[1]!);

  test('is built from the Atlas adapters', () => {
    expect(imported).toEqual(
      expect.arrayContaining([
        '@/components/ui/tappable',
        '@/components/ui/icon',
        '@/components/ui/text',
      ]),
    );
  });

  test('does not import a surface, useAppearance or the kit', () => {
    for (const module of imported) {
      expect(module).not.toMatch(/pressable-surface/);
      expect(module).not.toMatch(/components\/ui\/surface/);
      expect(module).not.toMatch(/use-appearance/);
      expect(module).not.toMatch(/heroui-native/);
    }
  });
});
