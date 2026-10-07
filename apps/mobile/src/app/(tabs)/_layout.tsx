/**
 * `(tabs)` group — globe (home), trips, profile (R009, research D-17, amended by
 * D4-06).
 *
 * The stable JavaScript `Tabs` navigator with a custom `tabBar`, the Atlas `TabBar`
 * (https://docs.expo.dev/router/advanced/tabs.md). `expo-router/unstable-native-tabs`
 * is not used: a native bar is platform-supplied styling by definition, which the
 * flat strip of feature 003 FR-013 to FR-016 and feature 004 FR-010 rules out, and an
 * `unstable-` module is the wrong foundation for the root of a production navigation
 * tree. `expo-router/js-tabs` is the non-deprecated import path in the installed v57
 * router; the bare `expo-router` export of `Tabs` is marked deprecated in its typings.
 *
 * `tabBar` is a render function: React Navigation calls it inside a context consumer's
 * callback, not as a component. The bar is therefore rendered as an element
 * (`<TabBar {...props} />`) so it keeps its own hook scope; `tabBar={TabBar}` type-checks
 * and happens to work while the bar's only hook is `use()`, but would crash at the first
 * `useState`. `test/app/tabs-layout.test.tsx` mounts this layout over the real navigator.
 * The scenes are painted with the canvas TOKEN and the bar with the `bg-background` class:
 * one colour, because the generated stylesheet's `--background` is the palette's `canvas`
 * (pinned by `test/theme/theme-css-sync.test.ts` and, for this pair, by the same suite).
 *
 * Every tab reads the local store, so the navigator mounts only once the
 * store is open (`RequireLocalStore`, T041) — and, on a device that has never
 * synced this account, only once the first snapshot has arrived
 * (`FirstSyncGate`, T136, FR-042): until then the traveller sees an explicit
 * "syncing your trips" state, or "you're offline", and never a set of empty
 * tabs that look like lost data.
 */
import { Tabs } from 'expo-router/js-tabs';

import { TabBar } from '@/components/navigation/tab-bar';
import { RequireLocalStore } from '@/components/require-local-store';
import { FirstSyncGate } from '@/components/sync/first-sync-gate';
import { useAppearance } from '@/hooks/use-appearance';

export default function TabsLayout() {
  const { tokens } = useAppearance();

  return (
    <RequireLocalStore>
      <FirstSyncGate>
        <Tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: tokens.canvas },
          }}>
          <Tabs.Screen name="index" options={{ title: 'Globe' }} />
          <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
          <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
        </Tabs>
      </FirstSyncGate>
    </RequireLocalStore>
  );
}
