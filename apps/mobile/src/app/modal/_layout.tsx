/**
 * Modal group — add-trip, add-expense, paywall (plan.md "Project Structure").
 *
 * The root layout presents this whole group with `presentation: 'modal'`
 * (https://docs.expo.dev/router/advanced/modals.md), so each screen here is a
 * sheet over the tabs. The group has its own `Stack` so that a multi-step
 * modal (the planner, later) can push within the sheet without leaving it.
 * The sheets write to the local store, hence `RequireLocalStore` (T041).
 */
import { Stack } from 'expo-router';

import { RequireLocalStore } from '@/components/require-local-store';
import { useAppearance } from '@/hooks/use-appearance';

export default function ModalLayout() {
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
