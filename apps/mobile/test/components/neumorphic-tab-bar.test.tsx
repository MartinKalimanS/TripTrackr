/**
 * R009 / feature 002 T076 — the custom tab bar (research D-17).
 *
 * FR-003 forbids platform-supplied styling on any tab, so the bar is composed
 * from `PressableSurface` rather than themed over React Navigation's default.
 * Feature 003 (US3) makes it a flat strip: the screen's own colour, one divider,
 * no per-tab surface. What is asserted here is what a traveller relies on:
 * every route is a reachable, labelled tab; the focused one is announced as
 * selected and marked by more than colour; the touch target respects the
 * platform minimum whatever the text size; and the bar clears the home
 * indicator.
 *
 * The props are the `BottomTabBarProps` shape the JS `Tabs` navigator passes
 * to a custom `tabBar` — built by hand so the component's own behaviour is
 * tested without mounting a navigator.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from 'expo-router/js-tabs';

import { NeumorphicTabBar } from '@/components/navigation/neumorphic-tab-bar';
import { Colors, MinTouchTarget } from '@/constants/theme';
import type { AppearanceContext } from '@/hooks/use-appearance';

jest.mock('@/hooks/use-appearance');

const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock<AppearanceContext, []>;
};

function mockAppearance(overrides: Partial<AppearanceContext> = {}) {
  const theme = overrides.theme ?? 'light';
  useAppearance.mockReturnValue({
    theme,
    prefersMoreContrast: false,
    prefersLessMotion: false,
    prefersLessTransparency: false,
    ready: true,
    fontScale: 1,
    elevationProfile: 'full',
    tokens: Colors[theme],
    ...overrides,
  } as AppearanceContext);
}

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'Profile' },
] as const;

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

function styleOf(node: { props: Record<string, unknown> }) {
  return Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
}

beforeEach(() => mockAppearance());

describe('<NeumorphicTabBar> — D-17, FR-003', () => {
  test('renders one tab per route, labelled from the route title', async () => {
    await render(<NeumorphicTabBar {...makeProps()} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      expect(screen.getByText(route.title)).toBeTruthy();
      expect(screen.getByLabelText(route.title)).toBeTruthy();
    }
  });

  test('announces the focused tab as selected and no other (FR-017)', async () => {
    await render(<NeumorphicTabBar {...makeProps(1)} />);

    const [globe, trips, profile] = screen.getAllByRole('tab');
    expect(trips.props.accessibilityState).toMatchObject({ selected: true });
    expect(globe.props.accessibilityState).toMatchObject({ selected: false });
    expect(profile.props.accessibilityState).toMatchObject({ selected: false });
  });

  test('no tab carries a raised, recessed or bordered surface: the bar is one flat strip (feature 003 FR-014)', async () => {
    await render(<NeumorphicTabBar {...makeProps(0)} />);

    for (const tab of screen.getAllByRole('tab')) {
      const style = styleOf(tab);
      expect(style.boxShadow).toBeUndefined();
      expect(style.borderWidth).toBeUndefined();
      expect(style.backgroundColor).toBeUndefined();
    }
  });

  test.each(['light', 'dark'] as const)(
    'is separated from the screen by one %s divider that meets the 3:1 boundary (feature 003 FR-014)',
    async (theme) => {
      mockAppearance({ theme });
      await render(<NeumorphicTabBar {...makeProps()} />);

      const bar = styleOf(screen.getByTestId('tab-bar'));
      expect(bar.borderTopWidth).toBeGreaterThan(0);
      expect(bar.borderTopColor).toBe(Colors[theme].border);
    },
  );

  test('marks the selected tab by more than colour: a heavier label and a mark above its icon (feature 003 FR-015)', async () => {
    await render(<NeumorphicTabBar {...makeProps(1)} />);

    expect(screen.getByTestId('tab-mark-trips')).toBeTruthy();
    expect(screen.queryByTestId('tab-mark-index')).toBeNull();
    expect(screen.queryByTestId('tab-mark-profile')).toBeNull();
    expect(styleOf(screen.getByTestId('tab-mark-trips')).backgroundColor).toBe(
      Colors.light.accent,
    );

    const weight = (label: string) => styleOf(screen.getByText(label)).fontWeight;
    expect(weight('Trips')).toBeGreaterThan(weight('Globe'));
    expect(weight('Trips')).toBeGreaterThan(weight('Profile'));
  });

  test('adds a hairline and nothing else around the touch targets, so it stays within 56 dp (feature 003 FR-013)', async () => {
    await render(<NeumorphicTabBar {...makeProps()} />);

    const bar = styleOf(screen.getByTestId('tab-bar'));
    const [tab] = screen.getAllByRole('tab');
    expect(bar.paddingTop ?? 0).toBe(0);
    expect((bar.borderTopWidth as number) + styleOf(tab!).minHeight).toBeLessThanOrEqual(
      56,
    );
  });

  test('every tab meets the platform minimum touch target (FR-011)', async () => {
    await render(<NeumorphicTabBar {...makeProps()} />);

    for (const tab of screen.getAllByRole('tab')) {
      const style = styleOf(tab);
      expect(style.minHeight).toBeGreaterThanOrEqual(MinTouchTarget);
      expect(style.minWidth).toBeGreaterThanOrEqual(MinTouchTarget);
    }
  });

  test('grows the touch target with the traveller’s text size (FR-016)', async () => {
    mockAppearance({ fontScale: 2 });
    await render(<NeumorphicTabBar {...makeProps()} />);

    for (const tab of screen.getAllByRole('tab')) {
      expect(styleOf(tab).minHeight).toBeGreaterThanOrEqual(MinTouchTarget * 2);
    }
  });

  test('clears the home indicator with the safe-area bottom inset', async () => {
    await render(<NeumorphicTabBar {...makeProps(0, 34)} />);
    expect(styleOf(screen.getByTestId('tab-bar')).paddingBottom).toBeGreaterThanOrEqual(
      34,
    );
  });

  test('navigates to a tab when it is pressed, after giving listeners a veto', async () => {
    const props = makeProps(0);
    await render(<NeumorphicTabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));

    const emit = props.navigation.emit as jest.Mock;
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tabPress',
        target: 'trips-1',
        canPreventDefault: true,
      }),
    );
    // Params are forwarded (undefined here) so a tab that carries an href
    // object keeps it — the same call shape as React Navigation's own bar.
    expect(props.navigation.navigate).toHaveBeenCalledWith('trips', undefined);
  });

  test('does not navigate when a tabPress listener prevents it', async () => {
    const props = makeProps(0);
    (props.navigation.emit as jest.Mock).mockReturnValue({ defaultPrevented: true });
    await render(<NeumorphicTabBar {...props} />);

    await fireEvent.press(screen.getByLabelText('Trips'));

    expect(props.navigation.navigate).not.toHaveBeenCalled();
  });

  test('paints the canvas, never a platform default (FR-023)', async () => {
    mockAppearance({ theme: 'dark' });
    await render(<NeumorphicTabBar {...makeProps()} />);
    expect(styleOf(screen.getByTestId('tab-bar')).backgroundColor).toBe(
      Colors.dark.canvas,
    );
  });

  test('reports its measured height so useBottomTabBarHeight() is accurate for floating controls', async () => {
    const report = jest.fn();
    await render(
      <BottomTabBarHeightCallbackContext.Provider value={report}>
        <NeumorphicTabBar {...makeProps()} />
      </BottomTabBarHeightCallbackContext.Provider>,
    );

    await fireEvent(screen.getByTestId('tab-bar'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 96 } },
    });
    expect(report).toHaveBeenCalledWith(96);
  });

  test('a route without a registered icon still gets a labelled, reachable tab', async () => {
    const base = makeProps();
    const props = {
      ...base,
      state: {
        ...base.state,
        routes: [...base.state.routes, { key: 'extra-1', name: 'extra' }],
        routeNames: [...base.state.routeNames, 'extra'],
      },
      descriptors: {
        ...base.descriptors,
        'extra-1': {
          options: { title: 'Extra' },
          route: { key: 'extra-1', name: 'extra' },
        },
      },
    } as unknown as BottomTabBarProps;

    await render(<NeumorphicTabBar {...props} />);
    expect(screen.getByLabelText('Extra')).toBeTruthy();
  });

  test('emits tabLongPress on a long press, as the default bar does', async () => {
    const props = makeProps();
    await render(<NeumorphicTabBar {...props} />);

    await fireEvent(screen.getByLabelText('Trips'), 'longPress');
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabLongPress', target: 'trips-1' }),
    );
  });

  test('contains no raw colour literal — every value comes from the token layer (C1)', () => {
    const source = jest
      .requireActual('fs')
      .readFileSync(
        require.resolve('@/components/navigation/neumorphic-tab-bar'),
        'utf8',
      ) as string;
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(?:rgba?|hsla?)\(/);
  });
});
