/**
 * `TabInsetScope` - publishes the tab bar's height to the scene it wraps (feature 005, T530;
 * FR-024). The `(tabs)` layout hands it to the navigator as the `screenLayout` of every tab:
 *
 *   <Tabs screenLayout={({ children }) => <TabInsetScope>{children}</TabInsetScope>} />
 *
 * `screenLayout` wraps what a route renders, which the navigator renders INSIDE its
 * `BottomTabBarHeightContext` (verified in the installed navigator, `BottomTabView`: the
 * provider wraps `descriptor.render()`), so `useBottomTabBarHeight()` answers here with the
 * height the bar reported (`height + bottomOffset`). The scene reads it from `TabInsetContext`
 * through `useTabInset()`, without importing the router.
 */
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import type { ReactNode } from 'react';

import { TabInsetContext } from '@/hooks/tab-inset-context';

export function TabInsetScope({ children }: { children: ReactNode }) {
  return (
    <TabInsetContext.Provider value={useBottomTabBarHeight()}>
      {children}
    </TabInsetContext.Provider>
  );
}
