/**
 * Profile stack — the `profile` tab as a nested stack (feature 004, research D4-06; T427).
 *
 * `(tabs)/profile` is a directory with the same URL (`/profile`) and its own `Stack`, so
 * the tab can take a native large title when the screen is restyled (phase 6, contract
 * C4-11). Until then the header stays hidden and the screen is exactly what it was: it
 * still lays out its own title. The scene behind is the canvas, as in every other stack.
 */
import { Stack } from 'expo-router';

import { useAppearance } from '@/hooks/use-appearance';

export default function ProfileLayout() {
  const { tokens } = useAppearance();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.canvas },
      }}
    />
  );
}
