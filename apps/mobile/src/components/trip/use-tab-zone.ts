/**
 * `useTabZone` - the height the tab bar takes at the bottom of a tab screen, in dp (feature
 * 005, T541; FR-024; contract C5-21). The floating pill reports `its height + its offset`
 * through React Navigation's context (88 dp on a 390 by 844 phone), which is what a screen that
 * floats a control above it, or pads a list past it, needs ("Nothing MUST be hidden behind the
 * pill": lists end with at least its height plus 16 dp, buttons float 16 dp above it).
 *
 * `useBottomTabBarHeight()` (https://docs.expo.dev/router/advanced/tabs) reads the very same
 * context but THROWS outside a bottom-tab navigator; a screen drawn in a component test, or
 * on a route that is not in one, wants 0 and no crash, so this reads the context itself.
 *
 * The pill reports `height + offset` (88 dp on that phone) and floats over the scene; a button floats
 * 16 dp above that zone. A list does not need it: `ListScreen` already ends above the pill
 * (`useTabInset`).
 */
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { use } from 'react';

export function useTabZone(): number {
  return use(BottomTabBarHeightContext) ?? 0;
}
