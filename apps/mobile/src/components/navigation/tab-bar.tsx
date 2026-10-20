/**
 * The tab bar - feature 005 (contract C5-21, research D5-05 and D5-21; FR-022 to FR-024,
 * FR-028), over feature 004 (T426, contract C4-9) and feature 003 FR-013 to FR-016. The export
 * name `TabBar` is the one the `(tabs)` layout renders as its custom `tabBar`
 * (https://docs.expo.dev/router/advanced/tabs.md, "Tab bar options"); the native tab bar stays
 * unused, the module is still `unstable-` in SDK 57 (research D4-06).
 *
 * Each platform gets the bar it has a shape for, chosen by `Platform.OS` when it renders:
 * the floating `TabPill` on iOS (`tab-pill.tsx`), the Material 3 `AndroidNavBar` on Android
 * (`android-nav-bar.tsx`). The ids they keep: `tab-bar`, `tab-<route>` and `tab-mark-<route>`
 * (on the capsule behind the selected tab, or on its indicator).
 */
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { AndroidNavBar } from './android-nav-bar';
import { TabPill } from './tab-pill';

export function TabBar(props: BottomTabBarProps) {
  return Platform.OS === 'android' ? (
    <AndroidNavBar {...props} />
  ) : (
    <TabPill {...props} />
  );
}
