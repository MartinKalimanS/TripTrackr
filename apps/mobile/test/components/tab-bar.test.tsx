/**
 * T526 - the floating tab pill on iOS (feature 005, contract C5-21, research D5-05; FR-022,
 * FR-023, FR-024, FR-027, FR-071; Q-1, Q-10). It replaces the flat Atlas strip of feature 004
 * (T426) and keeps what a traveller and a test rely on: every route is a reachable, named
 * tab inside a `tablist`; the selected one is announced as selected; the ids are the same.
 *
 * What is new, and asserted here: the geometry of the contract (absolute, 16 dp from the
 * sides, 64 dp tall as a MINIMUM, padding 6, gap 4, a capsule, `bottom = max(inset - 10, 12)`);
 * the one capsule that sits behind the selected tab (`tab-mark-<name>`, `translateX` by
 * `index x tabWidth`, the sheet spring, a jump under reduced motion); the selection shown by
 * a capsule, a FILLED glyph and a HEAVIER label, so it survives greyscale; labels that wrap
 * and a pill that grows (the label is capped at 1.3 times, Q-1); the height the pill reports
 * to the navigator, `height + bottomOffset` (88 dp on a 390 by 844 phone), which scenes use
 * to keep their content clear of it; and that nothing in it animates an opacity (an opacity
 * of 0 on the glass or an ancestor makes it vanish).
 *
 * Jest has no layout engine, so a size is arithmetic over `PillMetrics` and the layout
 * events a test fires. The kit's text is a plain node that forwards its props and a Phosphor
 * glyph is read back by registry key (`test/helpers/icons.ts`), so colours are the semantic
 * classes and tones the pill ASKS for, never values. The props are the `BottomTabBarProps`
 * shape the JS `Tabs` navigator passes to a custom `tabBar`, built by hand;
 * `test/app/tabs-layout.test.tsx` mounts the real navigator.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as fs from 'node:fs';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';
import * as HeroUI from 'heroui-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';
import { withSpring } from 'react-native-reanimated';

import { TabBar } from '@/components/navigation/tab-bar';
import {
  PillMetrics,
  capsuleLayout,
  pillBottomOffset,
} from '@/components/navigation/tab-metrics';
import { Motion, Palettes, Radii, FocusRing } from '@/theme';

import { appearanceOf } from '../helpers/appearance';
import { glyphsIn } from '../helpers/icons';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

/** The glyph each tab asks for (a registry key): `regular` at rest, `fill` when selected. */
const ICONS = { index: 'globe', trips: 'suitcase-rolling', profile: 'user' } as const;

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

beforeEach(() => {
  mockFontScale(1);
  useAppearance.mockReturnValue(appearanceOf('light'));
  jest.mocked(withSpring).mockClear();
});
afterEach(() => jest.restoreAllMocks());

type Node = { props: Record<string, unknown> };
const styleOf = (node: Node) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
const classesOf = (node: Node) =>
  String(node.props.className ?? '')
    .split(/\s+/)
    .filter(Boolean);
/** The pill's surface, whichever of the three it is (the tint of the blur is not one). */
const SURFACE = /^tab-surface-(glass|blur|solid)$/;
const bar = () => screen.getByTestId('tab-bar');
const labelOf = (text: string) => screen.getByText(text);
const layout = (width: number, height: number) => ({
  nativeEvent: { layout: { x: 16, y: 0, width, height } },
});
/** The capsule is decoration, hidden from assistive technology: queries must ask for it. */
const HIDDEN = { includeHiddenElements: true } as const;
/** The capsule under the selected tab: the one node whose id starts `tab-mark-`. */
const capsule = () =>
  screen.getByTestId(/^tab-mark-/, HIDDEN) as unknown as Node & {
    props: { testID: string };
  };

describe('<TabBar> identity - C5-21, FR-023', () => {
  test('renders one tab per route, named by the route title (the third is "You")', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(labelOf(route.title)).toBeTruthy();
      expect(screen.getByLabelText(route.title).props.accessibilityRole).toBe('tab');
    }
  });

  test('keeps the ids the Maestro flows use, and the tablist role on the bar', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(bar().props.accessibilityRole).toBe('tablist');
    expect(screen.getByTestId('tab-index').props.accessibilityLabel).toBe('Globe');
    expect(screen.getByTestId('tab-trips').props.accessibilityLabel).toBe('Trips');
    // The id stays `tab-profile`; only the label became "You" (FR-023).
    expect(screen.getByTestId('tab-profile').props.accessibilityLabel).toBe('You');
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

  test('announces the focused tab as selected and no other (FR-022)', async () => {
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
    expect(glyphsIn()).toHaveLength(ROUTES.length);
  });
});

describe('<TabBar> one bar for both platforms - owner decision 2026-10-24', () => {
  test('on Android it is the same floating pill, on the opaque surface', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(<TabBar {...makeProps()} />);

    expect(screen.getByTestId('tab-bar')).toBeTruthy();
    expect(screen.getByTestId('tab-surface-solid')).toBeTruthy();
    expect(
      screen.getByTestId('tab-mark-index', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(styleOf(screen.getByTestId('tab-bar'))).toMatchObject({
      position: 'absolute',
      left: PillMetrics.sideMargin,
      right: PillMetrics.sideMargin,
    });
  });
});

describe('<TabBar> geometry - C5-21, FR-022', () => {
  test('floats: absolute, 16 dp from both sides, and passes touches through around the pill', async () => {
    await render(<TabBar {...makeProps()} />);

    expect(styleOf(bar())).toMatchObject({
      position: 'absolute',
      left: PillMetrics.sideMargin,
      right: PillMetrics.sideMargin,
    });
    expect(PillMetrics.sideMargin).toBe(16);
    expect(bar().props.pointerEvents).toBe('box-none');
  });

  test.each([
    [34, 24],
    [47, 37],
    [20, 12],
    [22, 12],
    [0, 12],
  ])(
    'clears the home indicator: an inset of %s dp gives a bottom edge of %s dp',
    async (inset, bottom) => {
      expect(pillBottomOffset(inset)).toBe(bottom);
      await render(<TabBar {...makeProps(0, inset)} />);
      expect(styleOf(bar()).bottom).toBe(bottom);
    },
  );

  test('is a capsule, 64 dp tall at least, padded 6 with 4 between the tabs', async () => {
    await render(<TabBar {...makeProps()} />);
    const surface = screen.getByTestId(SURFACE);

    expect(styleOf(surface)).toMatchObject({
      minHeight: PillMetrics.height,
      padding: PillMetrics.padding,
      gap: PillMetrics.gap,
      flexDirection: 'row',
      borderRadius: Radii.full,
    });
    expect([PillMetrics.height, PillMetrics.padding, PillMetrics.gap]).toEqual([
      64, 6, 4,
    ]);
    // A minimum, never a height: the pill grows with the text (FR-074).
    expect(styleOf(surface).height).toBeUndefined();
    expect(styleOf(surface).maxHeight).toBeUndefined();
  });

  test('every tab is at least the platform touch target tall and wide', async () => {
    await render(<TabBar {...makeProps()} />);

    // 64 - 2 x 6 = 52 dp inside the pill: above 44 pt and 48 dp (FR-071).
    expect(PillMetrics.tabMinHeight).toBe(PillMetrics.height - 2 * PillMetrics.padding);
    expect(PillMetrics.tabMinHeight).toBeGreaterThanOrEqual(48);
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBe(PillMetrics.tabMinHeight);
      expect(styleOf(tab).minWidth).toBeGreaterThanOrEqual(48);
    }
  });

  test('reports its height PLUS the bottom offset to the navigator, again when it changes', async () => {
    const report = jest.fn();
    await render(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <TabBar {...makeProps(0, 34)} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );

    await fireEvent(bar(), 'layout', layout(358, 64));
    await fireEvent(bar(), 'layout', layout(358, 96));
    // 64 + 24 = 88 dp on a 390 by 844 phone: the zone scenes keep clear.
    expect(report.mock.calls).toEqual([[88], [120]]);
  });

  test('measures without a navigator to report to', async () => {
    await render(<TabBar {...makeProps()} />);
    await fireEvent(bar(), 'layout', layout(358, 64));
    expect(bar()).toBeTruthy();
  });
});

describe('<TabBar> the capsule - C5-21, FR-022, FR-027', () => {
  test.each([0, 1, 2])(
    'only the selected tab has a mark, and it is the capsule (tab %i)',
    async (i) => {
      await render(<TabBar {...makeProps(i)} />);

      const marks = screen.queryAllByTestId(/^tab-mark-/, HIDDEN);
      expect(marks).toHaveLength(1);
      expect(marks[0]!.props.testID).toBe(`tab-mark-${ROUTES[i]!.name}`);
      // It sits behind the tabs, as a sibling of them: no tab holds it.
      for (const tab of screen.getAllByRole('tab')) {
        expect(tab).not.toContainElement(marks[0]!);
      }
    },
  );

  test('is a tinted capsule, decorative and out of the way of touches', async () => {
    await render(<TabBar {...makeProps(0)} />);
    const mark = capsule();

    expect(mark.props.pointerEvents).toBe('none');
    expect(mark.props.accessibilityElementsHidden).toBe(true);
    expect(mark.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(styleOf(mark)).toMatchObject({
      position: 'absolute',
      borderRadius: Radii.full,
      top: PillMetrics.padding,
      bottom: PillMetrics.padding,
      left: PillMetrics.padding,
    });
  });

  test('is one third of the pill less the padding and gaps, and sits under the selected tab', async () => {
    await render(<TabBar {...makeProps(1)} />);
    await fireEvent(bar(), 'layout', layout(358, 64));

    const { tabWidth, offsetOf } = capsuleLayout(358, 3);
    expect(tabWidth).toBeCloseTo((358 - 2 * 6 - 2 * 4) / 3, 5);
    expect(styleOf(capsule()).width).toBeCloseTo(tabWidth, 5);
    expect(styleOf(capsule()).transform).toEqual([{ translateX: offsetOf(1) }]);
    expect(offsetOf(1)).toBeCloseTo(tabWidth + PillMetrics.gap, 5);
  });

  test('moves by translateX alone, with the sheet spring, when the selection changes', async () => {
    const { rerender } = await render(<TabBar {...makeProps(0)} />);
    await fireEvent(bar(), 'layout', layout(358, 64));
    jest.mocked(withSpring).mockClear();

    await rerender(<TabBar {...makeProps(2)} />);

    const { offsetOf } = capsuleLayout(358, 3);
    expect(withSpring).toHaveBeenCalledWith(offsetOf(2), Motion.sheetSpring);
    expect(styleOf(capsule()).transform).toEqual([{ translateX: offsetOf(2) }]);
    expect(capsule().props.testID).toBe('tab-mark-profile');
    // Movement only (FR-027): nothing else of the capsule is animated.
    const keys = Object.keys(styleOf(capsule()));
    expect(keys).not.toContain('opacity');
  });

  test('jumps to the destination under reduced motion: no spring is asked for', async () => {
    useAppearance.mockReturnValue(appearanceOf('light', { prefersLessMotion: true }));
    const { rerender } = await render(<TabBar {...makeProps(0)} />);
    await fireEvent(bar(), 'layout', layout(358, 64));

    await rerender(<TabBar {...makeProps(2)} />);

    const { offsetOf } = capsuleLayout(358, 3);
    expect(withSpring).not.toHaveBeenCalled();
    expect(styleOf(capsule()).transform).toEqual([{ translateX: offsetOf(2) }]);
  });

  test('has a width before the first layout, so it never flashes at nothing', async () => {
    await render(<TabBar {...makeProps(0)} />);
    expect(styleOf(capsule()).width).toBeGreaterThan(0);
  });
});

describe('<TabBar> selection - FR-022', () => {
  // `home.png` and the prototype's `.tab` (font 600 on every tab): the label is semibold in
  // every state, so the selection is the capsule, the filled glyph and the ink.
  test('the selected label is the ink; the others are muted; all are semibold', async () => {
    await render(<TabBar {...makeProps(1)} />);

    expect(classesOf(labelOf('Trips'))).toContain('text-foreground');
    for (const title of ['Globe', 'Trips', 'You']) {
      expect(classesOf(labelOf(title))).toContain('font-body-semibold');
    }
    for (const title of ['Globe', 'You']) {
      expect(classesOf(labelOf(title))).toContain('text-muted');
    }
  });

  test.each(Object.entries(ICONS))(
    'the %s tab shows its filled glyph only while selected, at 24 dp',
    async (name, glyph) => {
      const index = ROUTES.findIndex((route) => route.name === name);
      await render(<TabBar {...makeProps(index)} />);
      expect(glyphsIn()[index]).toMatchObject({
        name: glyph,
        weight: 'fill',
        size: PillMetrics.iconSize,
      });

      await render(<TabBar {...makeProps((index + 1) % ROUTES.length)} />);
      expect(glyphsIn().at(index - ROUTES.length)).toMatchObject({
        name: glyph,
        weight: 'regular',
        size: PillMetrics.iconSize,
      });
    },
  );

  test('tints the selected icon with the ink and the others with the muted ink', async () => {
    jest.spyOn(HeroUI, 'useThemeColor').mockImplementation(((
      token: string | string[],
    ) => {
      const ink = (name: string) => (name === 'foreground' ? '#aa0000' : '#00aa00');
      return Array.isArray(token) ? token.map(ink) : ink(token);
    }) as never);
    await render(<TabBar {...makeProps(2)} />);

    expect(glyphsIn().map((glyph) => glyph.color)).toEqual([
      '#00aa00',
      '#00aa00',
      '#aa0000',
    ]);
  });
});

describe('<TabBar> large text - FR-074, Q-1', () => {
  test.each([1, 1.3, 2, 3.1])(
    'at font scale %s a tab is the inside of the pill at least, not scaled with the font',
    async (fontScale) => {
      mockFontScale(fontScale);
      await render(<TabBar {...makeProps()} />);

      for (const tab of screen.getAllByRole('tab')) {
        expect(styleOf(tab).minHeight).toBe(PillMetrics.tabMinHeight);
      }
    },
  );

  test('the content decides the height at a large size: nothing caps, pins or clips it', async () => {
    mockFontScale(2);
    await render(<TabBar {...makeProps()} />);

    const surface = screen.getByTestId(SURFACE);
    for (const node of [bar(), surface, ...screen.getAllByRole('tab')]) {
      expect(styleOf(node).height).toBeUndefined();
      expect(styleOf(node).maxHeight).toBeUndefined();
    }
    // A clip with no fixed height cuts nothing; the tabs and the bar clip nothing at all.
    for (const node of [bar(), ...screen.getAllByRole('tab')]) {
      expect(styleOf(node).overflow).not.toBe('hidden');
    }
  });

  test('a label wraps, and is capped at 1.3 times: not a line, not shrunk, not clamped', async () => {
    mockFontScale(2);
    await render(<TabBar {...makeProps()} />);

    for (const route of ROUTES) {
      const label = labelOf(route.title);
      expect(label.props.maxFontSizeMultiplier).toBe(1.3);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.ellipsizeMode).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).toBeUndefined();
      expect(label.props.allowFontScaling).not.toBe(false);
      const style = styleOf(label);
      for (const key of ['height', 'maxHeight', 'overflow']) {
        expect(style[key]).toBeUndefined();
      }
    }
  });
});

describe('<TabBar> the fade under the pill - FR-022', () => {
  const fade = () => screen.getByTestId('tab-fade', HIDDEN) as unknown as Node;

  test('is 48 dp of the ground across the bottom edge, behind the pill, and takes no touch', async () => {
    await render(<TabBar {...makeProps(1)} />);

    expect(PillMetrics.fadeHeight).toBe(48);
    expect(styleOf(fade())).toMatchObject({
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: PillMetrics.fadeHeight,
    });
    expect(fade().props.pointerEvents).toBe('none');
    // Drawn BEFORE the pill, so the pill is above it.
    const order = JSON.stringify(screen.toJSON());
    expect(order.indexOf('tab-fade')).toBeLessThan(order.indexOf('"tab-bar"'));
  });

  test('is the canvas the lists are painted with, and the surface of the sheet on Home', async () => {
    const ground = () => {
      const [layer] = styleOf(fade()).experimental_backgroundImage as {
        colorStops: { color: string }[];
      }[];
      return layer.colorStops[1]!.color;
    };
    await render(<TabBar {...makeProps(1)} />);
    expect(ground()).toBe(Palettes.light.canvas.toUpperCase());
    await render(<TabBar {...makeProps(0)} />);
    expect(ground()).toBe(Palettes.light.surface.toUpperCase());
  });

  test('does not take the pill off the screen readers or add a node to the tablist', async () => {
    await render(<TabBar {...makeProps(0)} />);
    expect(screen.getAllByRole('tab')).toHaveLength(ROUTES.length);
    expect(screen.queryByTestId('tab-fade')).toBeNull();
  });
});

describe('<TabBar> no opacity - the glass renders nothing under an opacity-0 ancestor', () => {
  type Json = { props?: Record<string, unknown>; children?: Json[] | null } | string;

  function opacities(node: Json | null | Json[]): unknown[] {
    if (node === null || typeof node === 'string') return [];
    if (Array.isArray(node)) return node.flatMap(opacities);
    const own = StyleSheet.flatten(node.props?.style as never) as
      Record<string, unknown> | undefined;
    return [
      ...(own && 'opacity' in own ? [own.opacity] : []),
      ...opacities(node.children ?? []),
    ];
  }

  test.each([0, 1, 2])(
    'no node of the pill carries an opacity (tab %i selected)',
    async (i) => {
      await render(<TabBar {...makeProps(i)} />);
      expect(opacities(screen.toJSON() as Json)).toEqual([]);
    },
  );

  test('a selection change animates a transform, never an opacity', async () => {
    const { rerender } = await render(<TabBar {...makeProps(0)} />);
    await rerender(<TabBar {...makeProps(1)} />);
    expect(opacities(screen.toJSON() as Json)).toEqual([]);
  });
});

describe('<TabBar> press and focus - C4-9, FR-071', () => {
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

  test('a press on the focused tab still emits tabPress but dispatches nothing', async () => {
    // As the default bar: a stack nested in the tab pops to its root on that event, and a
    // `navigate` to the tab that is already there would race it (and re-push a deep link).
    const props = makeProps(1);
    await render(<TabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));

    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: 'trips-1',
        canPreventDefault: true,
      }),
    );
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

  test('a held press is a capsule too, not the 12 dp corner of a plain control', async () => {
    await render(<TabBar {...makeProps()} />);
    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).borderRadius).toBe(Radii.full);
    }
  });
});

describe('<TabBar> imports - review rules', () => {
  const importsOf = (module: string) =>
    [...fs.readFileSync(require.resolve(module), 'utf8').matchAll(/from '([^']+)'/g)].map(
      (match) => match[1]!,
    );

  test('the pill is built from the adapters and its own surface and capsule', () => {
    expect(importsOf('@/components/navigation/tab-pill')).toEqual(
      expect.arrayContaining([
        '@/components/ui/tappable',
        '@/components/ui/icon',
        '@/components/ui/text',
        './tab-surface',
        './tab-capsule',
      ]),
    );
  });

  test('no navigation file imports the kit, a legacy surface or a gradient', () => {
    for (const file of ['tab-pill', 'tab-surface', 'tab-capsule', 'tab-bar']) {
      for (const module of importsOf(`@/components/navigation/${file}`)) {
        expect(module).not.toMatch(/heroui-native|uniwind/);
        expect(module).not.toMatch(/pressable-surface|components\/ui\/surface/);
      }
    }
  });
});
