/**
 * The props the JS `Tabs` navigator hands a custom `tabBar`, built by hand (feature 005, T562;
 * not a test file): three routes, the first one focused, on a phone with a 34 dp home
 * indicator. The same shape `test/components/tab-bar.test.tsx` uses.
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';

const ROUTES = [
  { key: 'index-1', name: 'index', title: 'Globe' },
  { key: 'trips-1', name: 'trips', title: 'Trips' },
  { key: 'profile-1', name: 'profile', title: 'You' },
] as const;

export function tabBarProps(): BottomTabBarProps {
  return {
    state: {
      key: 'tabs',
      index: 0,
      routeNames: ROUTES.map((route) => route.name),
      routes: ROUTES.map((route) => ({ key: route.key, name: route.name })),
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
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
      navigate: jest.fn(),
    },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  } as unknown as BottomTabBarProps;
}
