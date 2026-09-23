/**
 * `(auth)` group — welcome, login, register (R009).
 *
 * Access is decided by the root layout's `Stack.Protected`, which only admits
 * this group while `status === 'signed-out'` and removes it — history and all
 * — the moment a session appears. Nothing here needs to check the session
 * again; a second check would be a second place for the rule to drift.
 */
import { Stack } from 'expo-router';

import { useAppearance } from '@/hooks/use-appearance';

/**
 * The group has no `index`, so the first screen must be named or the router
 * would pick one for us (https://docs.expo.dev/router/advanced/modals.md,
 * "Handle deep-linked modals" — the same `anchor` mechanism). A deep link to
 * `/login` still lands on login; this only decides where "(auth)" itself opens.
 */
export const unstable_settings = {
  anchor: 'welcome',
};

export default function AuthLayout() {
  const { tokens } = useAppearance();

  return (
    <Stack
      screenOptions={{
        // Every screen composes its own heading from the primitives (FR-003);
        // a native header would be platform-supplied styling.
        headerShown: false,
        contentStyle: { backgroundColor: tokens.canvas },
      }}
    />
  );
}
