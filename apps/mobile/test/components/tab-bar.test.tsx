/**
 * T426 - the Atlas tab bar (feature 004, contract C4-9; FR-010, FR-025, FR-026, FR-029,
 * FR-030; research D4-06; feature 003 FR-013 to FR-016).
 *
 * The bar is a flat strip painted with the canvas colour, one hairline divider on its top
 * edge, and one `Tappable` per route. What is asserted here is what a traveller relies on:
 * every route is a reachable, labelled tab; the selected one is announced as selected and
 * shown by more than colour (a filled icon, a heavier label and a mark that survives
 * greyscale); the touch target respects the platform minimum whatever the text size; the
 * content stays inside 56 dp at the default size and grows with the font scale; and the bar
 * clears the home indicator.
 *
 * Jest renders the kit's text and `expo-symbols` as plain nodes that forward their props,
 * so colours are asserted as the semantic classes and tones the bar ASKS for, never as
 * values. The props are the `BottomTabBarProps` shape the JS `Tabs` navigator passes to a
 * custom `tabBar`, built by hand so the component's own behaviour is tested without
 * mounting a navigator.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import * as HeroUI from 'heroui-native';
import { Dimensions, StyleSheet } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { BorderHairline, MinTouchTarget } from '@/constants/theme';
import { FocusRing } from '@/theme';

// `expo-symbols` is replaced by a view that carries the props it was given, so the test
// reads the symbol each tab asked for (both platform names) and its tint.
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

beforeEach(() => mockFontScale(1));
afterEach(() => jest.restoreAllMocks());

const hidden = { includeHiddenElements: true };
type Node = { props: Record<string, unknown> };
const styleOf = (node: Node) =>
  StyleSheet.flatten(node.props.style as never) as Record<string, number | string>;
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

    const tab = screen.getByTestId('custom-tab');
    expect(tab.props.accessibilityLabel).toBe('More options');
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
});

describe('<TabBar> the strip - feature 003 FR-014, C4-9', () => {
  test('is painted with the canvas colour through the semantic class', async () => {
    await render(<TabBar {...makeProps()} />);
    const classes = classesOf(screen.getByTestId('tab-bar'));
    expect(classes).toContain('bg-background');
    expect(styleOf(screen.getByTestId('tab-bar')).backgroundColor).toBeUndefined();
  });

  test('has ONE divider: a hairline on the top edge, in the border token (3:1)', async () => {
    await render(<TabBar {...makeProps()} />);
    const classes = classesOf(screen.getByTestId('tab-bar'));

    expect(classes).toEqual(expect.arrayContaining(['border-t', 'border-border']));
    // No other edge, and no all-round border, which would be a second divider.
    for (const other of ['border', 'border-b', 'border-l', 'border-r', 'border-x']) {
      expect(classes).not.toContain(other);
    }
    // A hairline, not Tailwind's 1 px, and on the top edge only.
    const style = barStyle();
    expect(style.borderTopWidth).toBe(BorderHairline);
    expect(style.borderTopWidth).toBeGreaterThan(0);
    for (const key of ['borderWidth', 'borderBottomWidth', 'borderLeftWidth']) {
      expect(style[key]).toBeUndefined();
    }
  });

  test('draws no shadow or elevation under the divider', async () => {
    await render(<TabBar {...makeProps()} />);
    const style = barStyle();
    expect(style.boxShadow).toBeUndefined();
    expect(style.elevation).toBeUndefined();
    expect(
      classesOf(screen.getByTestId('tab-bar')).filter((c) => /shadow/.test(c)),
    ).toEqual([]);
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

  test('a route without a registered icon still gets a labelled, reachable tab', async () => {
    await render(<TabBar {...withExtraRoute({ title: 'Extra' })} />);
    expect(screen.getByLabelText('Extra')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length + 1);
    expect(symbols()).toHaveLength(ROUTES.length);
  });
});

describe('<TabBar> selection - FR-010, FR-025', () => {
  test('only the selected tab has a mark', async () => {
    await render(<TabBar {...makeProps(1)} />);

    expect(screen.getByTestId('tab-mark-trips')).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-index')).toBeNull();
    expect(screen.queryByTestId('tab-mark-profile')).toBeNull();
  });

  test.each([0, 1, 2])('the mark follows the selection (tab %i)', async (i) => {
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
    expect(style.height).toBeGreaterThanOrEqual(3);
    expect(style.height).toBeLessThanOrEqual(4);
    expect(style.width).toBeGreaterThanOrEqual(20);
    expect(style.width).toBeLessThanOrEqual(28);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(0);
    // Inside the selected tab, so it sits above that tab's icon and no other.
    expect(screen.getByTestId('tab-index')).toContainElement(mark);
  });

  test('the selected label is accent ink and heavier than the others, which are muted', async () => {
    await render(<TabBar {...makeProps(1)} />);

    const selected = classesOf(labelOf('Trips'));
    expect(selected).toEqual(expect.arrayContaining(['text-[12px]', 'text-accent']));
    expect(selected).toContain('font-bold');
    for (const title of ['Globe', 'Profile']) {
      const rest = classesOf(labelOf(title));
      expect(rest).toEqual(expect.arrayContaining(['text-[12px]', 'text-muted']));
      expect(rest).not.toContain('font-bold');
      expect(rest).not.toContain('text-accent');
    }
  });

  test('a label wraps instead of being cut off at a large text size', async () => {
    await render(<TabBar {...makeProps(0)} />);
    for (const route of ROUTES) {
      expect(labelOf(route.title).props.numberOfLines).toBeUndefined();
    }
  });

  test.each(Object.entries(ICONS))(
    'the %s tab shows its filled symbol only while selected',
    async (name, icon) => {
      const index = ROUTES.findIndex((route) => route.name === name);
      await render(<TabBar {...makeProps(index)} />);
      expect(symbols()[index]!.props.name).toEqual({
        ios: icon.filled,
        android: icon.android,
      });

      await render(<TabBar {...makeProps((index + 1) % ROUTES.length)} />);
      expect(symbols().at(index - ROUTES.length)!.props.name).toEqual({
        ios: icon.rest,
        android: icon.android,
      });
    },
  );

  test('every symbol is named for both platforms, and the filled one is an SF .fill', async () => {
    await render(<TabBar {...makeProps(0)} />);
    for (const symbol of symbols()) {
      const name = symbol.props.name as { ios: string; android: string };
      expect(name.ios).toBeTruthy();
      expect(name.android).toBeTruthy();
    }
    for (const icon of Object.values(ICONS)) {
      expect(icon.filled).toBe(`${icon.rest}.fill`);
    }
  });

  test('tints the selected icon with the accent and the others with the muted ink', async () => {
    jest
      .spyOn(HeroUI, 'useThemeColor')
      .mockImplementation(((token: string) => `themed:${token}`) as never);
    await render(<TabBar {...makeProps(2)} />);

    const tints = symbols().map((symbol) => symbol.props.tintColor);
    expect(tints).toEqual(['themed:muted', 'themed:muted', 'themed:accent']);
  });

  test('icons are decorative: the tab name is the label, not an image', async () => {
    await render(<TabBar {...makeProps(0)} />);
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length);
  });
});

describe('<TabBar> size - feature 003 FR-013, FR-016; FR-026, FR-029', () => {
  test('adds a hairline and nothing else around the touch targets, so it stays within 56 dp', async () => {
    await render(<TabBar {...makeProps()} />);

    const bar = barStyle();
    const [tab] = screen.getAllByRole('tab');
    expect(bar.paddingTop ?? 0).toBe(0);
    expect(bar.marginTop ?? 0).toBe(0);
    expect(
      (bar.borderTopWidth as number) + (styleOf(tab!).minHeight as number),
    ).toBeLessThanOrEqual(56);
  });

  test('every tab meets the platform minimum touch target', async () => {
    await render(<TabBar {...makeProps()} />);

    for (const tab of screen.getAllByRole('tab')) {
      const style = styleOf(tab);
      expect(style.minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
      expect(style.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    }
  });

  test('puts no fixed height or cap on the bar or a tab, so nothing can clip', async () => {
    await render(<TabBar {...makeProps()} />);

    for (const style of [barStyle(), ...screen.getAllByRole('tab').map(styleOf)]) {
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
      expect(style.overflow).not.toBe('hidden');
    }
  });

  test('grows the touch target with the traveller’s text size', async () => {
    mockFontScale(2);
    await render(<TabBar {...makeProps()} />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(MinTouchTarget * 2);
    }
    expect(barStyle().height).toBeUndefined();
    expect(barStyle().maxHeight).toBeUndefined();
  });

  test('never shrinks below the minimum when the text is made smaller', async () => {
    mockFontScale(0.8);
    await render(<TabBar {...makeProps()} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBe(MinTouchTarget);
    }
  });

  test('clears the home indicator with the safe-area bottom inset', async () => {
    await render(<TabBar {...makeProps(0, 34)} />);
    expect(barStyle().paddingBottom).toBe(34);
  });

  test('adds no bottom padding on a device with no inset', async () => {
    await render(<TabBar {...makeProps(0, 0)} />);
    expect(barStyle().paddingBottom ?? 0).toBe(0);
  });

  test('reports its measured height so useBottomTabBarHeight() is accurate', async () => {
    const report = jest.fn();
    await render(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <TabBar {...makeProps()} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );

    await fireEvent(screen.getByTestId('tab-bar'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 96 } },
    });
    expect(report).toHaveBeenCalledWith(96);
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
    const tab = screen.getByLabelText('Trips');

    await fireEvent(tab, 'focus');
    expect(styleOf(screen.getByLabelText('Trips'))).toMatchObject({
      outlineWidth: FocusRing.width,
      outlineOffset: FocusRing.offset,
    });

    await fireEvent(screen.getByLabelText('Trips'), 'blur');
    expect(styleOf(screen.getByLabelText('Trips')).outlineWidth).toBeUndefined();
  });
});

describe('<TabBar> source - C4-1, review rules', () => {
  const source = () =>
    jest
      .requireActual('fs')
      .readFileSync(require.resolve('@/components/navigation/tab-bar'), 'utf8') as string;

  test('contains no raw colour literal: every value comes from a token class or tone', () => {
    expect(source()).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source()).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });

  test('is built on the Atlas adapters, not on a surface or the kit', () => {
    const imports = source()
      .split('\n')
      .filter((line) => /^\s*(import|} from)\b/.test(line) || /from '/.test(line))
      .join('\n');

    expect(imports).toMatch(/@\/components\/ui\/tappable/);
    expect(imports).toMatch(/@\/components\/ui\/icon/);
    expect(imports).toMatch(/@\/components\/ui\/text/);
    expect(imports).not.toMatch(/pressable-surface|PressableSurface/);
    expect(imports).not.toMatch(/components\/ui\/surface|\bSurface\b/);
    expect(imports).not.toMatch(/heroui-native/);
    expect(imports).not.toMatch(/use-appearance/);
    expect(imports).not.toMatch(/themed-text|themed-view/);
  });
});
