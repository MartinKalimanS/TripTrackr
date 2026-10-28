/**
 * The tab bar - feature 005 (contract C5-21, research D5-05 and D5-21; FR-022 to FR-024,
 * FR-028), over feature 004 (T426, contract C4-9) and feature 003 FR-013 to FR-016. The export
 * name `TabBar` is the one the `(tabs)` layout renders as its custom `tabBar`
 * (https://docs.expo.dev/router/advanced/tabs.md, "Tab bar options"); the native tab bar stays
 * unused, the module is still `unstable-` in SDK 57 (research D4-06).
 *
 * One bar for both platforms: the floating `TabPill` (`tab-pill.tsx`), as pictured in
 * `reference/screens/core/home-contrast.png`. The Material 3 navigation bar of D5-21 was
 * retired on 2026-10-24 (owner decision: Android gets the pill too); its surface is the opaque
 * one of `TabSurface`, since a blur on Android would be re-blurred every frame under the globe.
 * The ids they keep: `tab-bar`, `tab-<route>` and `tab-mark-<route>` (on the capsule behind
 * the selected tab).
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { TabPill } from './tab-pill';

export function TabBar(props: BottomTabBarProps) {
  return <TabPill {...props} />;
}
