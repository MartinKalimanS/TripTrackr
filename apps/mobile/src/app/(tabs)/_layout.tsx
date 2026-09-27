/**
 * `(tabs)` group — globe (home), trips, profile (R009, research D-17).
 *
 * The stable JavaScript `Tabs` navigator with a custom `tabBar`
 * (https://docs.expo.dev/router/advanced/tabs.md). `expo-router/unstable-native-tabs`
 * is not used: a native bar is platform-supplied styling by definition, which
 * FR-003 forbids, and an `unstable-` module is the wrong foundation for the
 * root of a production navigation tree. `expo-router/js-tabs` is the
 * non-deprecated import path in the installed v57 router; the bare
 * `expo-router` export of `Tabs` is marked deprecated in its typings.
 *
 * Every tab reads the local store, so the navigator mounts only once the
 * store is open (`RequireLocalStore`, T041).
 */
import { Tabs } from 'expo-router/js-tabs';

import { NeumorphicTabBar } from '@/components/navigation/neumorphic-tab-bar';
import { RequireLocalStore } from '@/components/require-local-store';
import { useAppearance } from '@/hooks/use-appearance';

export default function TabsLayout() {
  const { tokens } = useAppearance();

  return (
    <RequireLocalStore>
      <Tabs
        tabBar={(props) => <NeumorphicTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: tokens.canvas },
        }}>
        <Tabs.Screen name="index" options={{ title: 'Globe' }} />
        <Tabs.Screen name="trips" options={{ title: 'Trips' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
    </RequireLocalStore>
  );
}
