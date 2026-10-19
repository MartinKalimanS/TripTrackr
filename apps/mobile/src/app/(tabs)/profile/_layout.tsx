/**
 * Profile stack — the `profile` tab as a nested stack (feature 004, research D4-06; T427,
 * T448; FR-007).
 *
 * `(tabs)/profile` is a directory with the same URL (`/profile`) and its own `Stack`, so
 * the tab has a native header, exactly as Trips has (`trips/_layout.tsx`): iOS asks for a
 * large "Profile", Android shows a standard header with the same word, both themed by
 * `useStackHeaderOptions` (the canvas behind, the accent on controls, the display face on
 * titles). The screen therefore lays out no title of its own. The options are asserted in
 * the tests; that the large title collapses as the screen scrolls is native behaviour, a
 * device check (T408).
 */
import { Stack } from 'expo-router';

import { useStackHeaderOptions } from '@/components/ui/stack-header';

export default function ProfileLayout() {
  const options = useStackHeaderOptions('You');

  return <Stack screenOptions={options} />;
}
