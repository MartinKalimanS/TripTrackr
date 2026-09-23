/**
 * Per-trip stack — notes, expenses, photos, documents, itinerary (plan.md
 * "Project Structure"). Only the overview exists yet; the sub-screens are
 * added by their user stories (US2 notes/expenses, US4 photos, US5 documents).
 *
 * Its own `Stack` rather than screens on the root, so that leaving a trip pops
 * the whole trip at once instead of one sub-screen at a time. Every screen in
 * it reads the local store, hence `RequireLocalStore` (T041).
 */
import { Stack } from 'expo-router';

import { RequireLocalStore } from '@/components/require-local-store';
import { useAppearance } from '@/hooks/use-appearance';

export default function TripLayout() {
  const { tokens } = useAppearance();

  return (
    <RequireLocalStore>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.canvas },
        }}
      />
    </RequireLocalStore>
  );
}
