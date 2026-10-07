/**
 * Trips stack — the `trips` tab as a nested stack (feature 004, research D4-06; T427,
 * FR-007).
 *
 * `(tabs)/trips` is a directory so the tab can have a native header: the same URL
 * (`/trips`), a stack of its own, and `index` as its first screen
 * (https://docs.expo.dev/router/advanced/stack.md,
 * https://docs.expo.dev/router/advanced/nesting-navigators.md). The tab navigator keeps
 * naming the route `trips`, so `Tabs.Screen name="trips"` and the `tab-trips` id are
 * untouched.
 *
 * The header is the title: iOS shows a large "Trips" that collapses as the list scrolls,
 * Android a standard header with the same word, both themed by `useStackHeaderOptions`
 * (the canvas behind, the accent on controls, the display face on titles). The trips
 * screen then adds its "Plan a trip" action to that header on iOS.
 */
import { Stack } from 'expo-router';

import { useStackHeaderOptions } from '@/components/ui/stack-header';

export default function TripsLayout() {
  const options = useStackHeaderOptions('Trips');

  return <Stack screenOptions={options} />;
}
