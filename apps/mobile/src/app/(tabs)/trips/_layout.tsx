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
 * The header is the title: iOS asks for a large "Trips", Android shows a standard header
 * with the same word, both themed by `useStackHeaderOptions` (the canvas behind, the
 * accent on controls, the display face on titles). The trips screen adds the sync chip to
 * that header while changes wait; "Plan a trip" is a floating button above the tab pill on both
 * platforms (feature 005, T541), no longer a header action. The options are asserted in the
 * tests; the large title's collapse as the list scrolls is native behaviour, a device check
 * (T408).
 */
import { Stack } from 'expo-router';

import { useStackHeaderOptions } from '@/components/ui/stack-header';

export default function TripsLayout() {
  const options = useStackHeaderOptions('Trips');

  return <Stack screenOptions={options} />;
}
