/**
 * Modal group — add-trip, add-expense, paywall (plan.md "Project Structure").
 *
 * The root layout presents this whole group with `presentation: 'modal'`
 * (https://docs.expo.dev/router/advanced/modals.md), so each screen here is a
 * sheet over the tabs. The group has its own `Stack` so that a multi-step
 * modal (the planner, later) can push within the sheet without leaving it.
 */
import { Stack } from 'expo-router';

import { useAppearance } from '@/hooks/use-appearance';

export default function ModalLayout() {
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
