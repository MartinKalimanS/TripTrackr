/**
 * Profile stack — the `profile` tab as a nested stack (feature 004, research D4-06; T427,
 * T448; FR-007; feature 005 F13, T557).
 *
 * `(tabs)/profile` is a directory with the same URL (`/profile`) and its own `Stack`, so the
 * tab keeps a native header on Android exactly as Trips has (`trips/_layout.tsx`): a standard
 * "You" header, themed by `useStackHeaderOptions` (the canvas behind, the accent on controls, the
 * display face on titles). On iOS the picture replaces the large title with the identity block
 * (UI-SPEC section 8, contract C5-32 "You"), so the header is hidden there: the options still
 * carry the title "You" (it names the screen and any back label) and the screen lays out the top
 * safe area itself. The options are asserted in the tests; the Android header is a device check
 * (T408).
 *
 * The stack sits in a `ToastZone`, as Trips does: the "coming soon" toast of the pictured Share,
 * Settings and recap controls stands 16 dp from the sides and 8 dp above the zone the tab pill
 * takes.
 */
import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { useTabZone } from '@/components/trip/use-tab-zone';
import { useStackHeaderOptions } from '@/components/ui/stack-header';
import { ToastZone } from '@/components/ui/toast-zone';

export default function ProfileLayout() {
  const options = useStackHeaderOptions('You');
  const tabZone = useTabZone();

  return (
    <ToastZone bottom={tabZone}>
      <Stack screenOptions={{ ...options, headerShown: Platform.OS !== 'ios' }} />
    </ToastZone>
  );
}
