/**
 * `(tabs)` group — globe (home), trips, profile (R009, research D-17, amended by
 * D4-06).
 *
 * The stable JavaScript `Tabs` navigator with a custom `tabBar`, the `TabBar` of feature 005: the
 * floating pill on both platforms (`components/navigation`;
 * https://docs.expo.dev/router/advanced/tabs.md). `expo-router/unstable-native-tabs` is not
 * used: a native bar is platform-supplied styling by definition, which the Sunrise pill (glass
 * on iOS 26, a blur before it, solid where transparency is reduced) rules out, and an
 * `unstable-` module is the wrong foundation for the root of a production navigation tree.
 * `expo-router/js-tabs` is the non-deprecated import path in the installed v57 router; the
 * bare `expo-router` export of `Tabs` is marked deprecated in its typings.
 *
 * `tabBar` is a render function: React Navigation calls it inside a context consumer's
 * callback, not as a component. The bar is therefore rendered as an element
 * (`<TabBar {...props} />`) so it keeps its own hook scope; `tabBar={TabBar}` type-checks
 * and happens to work while the bar's only hook is `use()`, but would crash at the first
 * `useState`. `test/app/tabs-layout.test.tsx` mounts this layout over the real navigator.
 *
 * The bar FLOATS (FR-022, FR-023): it is absolute, so it adds no height to the navigator's
 * column and every scene runs under it. Each scene is told where the bar's top edge is
 * (`useBottomTabBarHeight()`, the height the bar reports) and keeps its content 16 dp clear of
 * it (`useTabInset`, applied by `Screen` and `ListScreen`; `TabInsetScope` publishes the height
 * to the scene through the navigator's `screenLayout`); a fade of the scene's ground sits
 * under the pill. The scenes are painted with the canvas TOKEN (`sceneStyle`).
 *
 * The third tab is "You" (FR-023, a deliberate label change); the route, `profile`, and the
 * ids `tab-profile` and `tab-mark-profile` are unchanged.
 *
 * Every tab reads the local store, so the navigator mounts only once the
 * store is open (`RequireLocalStore`, T041) — and, on a device that has never
 * synced this account, only once the first snapshot has arrived
 * (`FirstSyncGate`, T136, FR-042): until then the traveller sees an explicit
 * "syncing your trips" state, or "you're offline", and never a set of empty
 * tabs that look like lost data.
 *
 * `FirstRunTour` (feature 007) floats over the navigator, so it can light the tab pill: it
 * starts once for a traveller with no trips, and You can replay it.
 */
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { TabInsetScope } from '@/components/navigation/tab-inset-scope';
import { RequireLocalStore } from '@/components/require-local-store';
import { FirstSyncGate } from '@/components/sync/first-sync-gate';
import { FirstRunTour } from '@/components/tour/first-run-tour';
import { useAppearance } from '@/hooks/use-appearance';

export default function TabsLayout() {
  const { tokens } = useAppearance();

  return (
    <RequireLocalStore>
      <FirstSyncGate>
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={(props) => <TabBar {...props} />}
            screenLayout={({ children }) => <TabInsetScope>{children}</TabInsetScope>}
            screenOptions={{
              headerShown: false,
              sceneStyle: { backgroundColor: tokens.canvas },
            }}>
            <Tabs.Screen name="index" options={{ title: 'Globe' }} />
            <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
            <Tabs.Screen name="profile" options={{ title: 'You' }} />
          </Tabs>
          <FirstRunTour />
        </View>
      </FirstSyncGate>
    </RequireLocalStore>
  );
}
