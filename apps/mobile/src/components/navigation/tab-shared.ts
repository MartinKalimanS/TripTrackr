/**
 * What the two tab bars (the iOS pill and the Android navigation bar) share: the icon of each
 * route, the name of a tab and the press behaviour of React Navigation's own bar (feature
 * 005, contract C5-21; feature 004 C4-9).
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import type { IconName } from '@/components/ui/icon';

export type TabRoute = BottomTabBarProps['state']['routes'][number];
export type TabOptions = BottomTabBarProps['descriptors'][string]['options'];
export type TabNavigation = BottomTabBarProps['navigation'];

/**
 * The icon of each tab route, a registry key: drawn `regular` at rest and `fill` when
 * selected (Phosphor has the weight on both platforms). A route missing here gets a label but
 * no icon rather than a crash.
 */
export const TAB_ICONS: Record<string, IconName> = {
  index: 'globe',
  trips: 'suitcase-rolling',
  profile: 'user',
};

/** The tab's name: a string `tabBarLabel`, else the route's title, else its route name. */
export function tabLabel(options: TabOptions, routeName: string): string {
  return typeof options.tabBarLabel === 'string'
    ? options.tabBarLabel
    : (options.title ?? routeName);
}

export interface TabPressHandlers {
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * Mirrors React Navigation's default bar (`BottomTabBar`): `tabPress` first, so a listener may
 * veto it (a screen with unsaved edits, for instance), then navigate unless the tab is the
 * focused one; `tabLongPress` on a long press. The focused tab still emits `tabPress`, which a
 * stack nested in the tab answers by popping to its root, and dispatches nothing: a
 * `navigate` to the tab that is already there would race that pop and could re-push a deep
 * link carried in the route's params. `onNavigate` runs just before the navigation, and only
 * then (the pill plays its selection haptic from it).
 */
export function tabPressHandlers(
  route: TabRoute,
  navigation: TabNavigation,
  focused: boolean,
  onNavigate?: () => void,
): TabPressHandlers {
  return {
    onPress: () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        onNavigate?.();
        navigation.navigate(route.name, route.params);
      }
    },
    onLongPress: () => {
      navigation.emit({ type: 'tabLongPress', target: route.key });
    },
  };
}
