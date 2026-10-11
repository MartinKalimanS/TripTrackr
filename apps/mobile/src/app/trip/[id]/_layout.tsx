/**
 * Per-trip stack — notes, expenses, photos, documents, itinerary (plan.md
 * "Project Structure"). Only the overview exists yet; the sub-screens are
 * added by their user stories (US2 notes/expenses, US4 photos, US5 documents).
 *
 * Its own `Stack` rather than screens on the root, so that leaving a trip pops
 * the whole trip at once instead of one sub-screen at a time. Every screen in
 * it reads the local store, hence `RequireLocalStore` (T041).
 *
 * The overview has a NATIVE header (feature 004, tasks.md T427; FR-007, FR-008;
 * research D4-06; https://docs.expo.dev/router/advanced/stack.md, "Available header
 * options"); every other screen of the stack keeps `headerShown: false` and draws its
 * own bar until its migration (phase 5), except the two named below. What the overview's
 * header carries:
 *
 * - `headerLeft` is the `HeaderBackButton` adapter, so the control is named "Back" on
 *   both platforms whatever the previous screen is called (the native label would be that
 *   screen's title, and Android's arrow has the platform's own description); the Maestro
 *   flows say `tapOn: 'Back'`. The props React Navigation passes to `headerLeft` are not
 *   forwarded: `canGoBack` is false for a trip opened with nothing beneath it, and the
 *   button then goes home instead of vanishing.
 * - `title: ''`: the hero title is the screen's content (FR-007 exempts it) and a second
 *   copy in the bar would be read twice.
 * - The colours, and no hairline, come from `useHeaderTheme` (tokens, never a literal).
 *
 * Notes and Spending (004 T440, T441; FR-007, FR-008) have the same header with a TITLE
 * ("Notes", "Spending") in the foreground ink and the display face (`useHeaderTitleStyle`:
 * a title that sets no colour takes the accent tint), and the same Back control; their
 * screens no longer draw a bar of their own. The title is static: the trip's name is not
 * repeated in it (the traveller has just left the screen that is that trip). Photos,
 * documents, document capture and viewer, and offline maps keep `headerShown: false` and
 * their own bars until their migration.
 *
 * No `unstable_settings` and no `initialParams` here: the root layout keeps the anchor
 * (`(tabs)`) and the route's params and deep links are exactly what they were.
 */
import { Stack } from 'expo-router';

import { RequireLocalStore } from '@/components/require-local-store';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { useHeaderTheme } from '@/components/ui/header-theme';
import { useHeaderTitleStyle } from '@/components/ui/header-title-style';

const renderBack = () => <HeaderBackButton />;

export default function TripLayout() {
  const theme = useHeaderTheme();
  const title = useHeaderTitleStyle();

  return (
    <RequireLocalStore>
      <Stack screenOptions={{ headerShown: false, contentStyle: theme.contentStyle }}>
        <Stack.Screen
          name="index"
          options={{ ...theme, headerShown: true, title: '', headerLeft: renderBack }}
        />
        <Stack.Screen
          name="notes"
          options={{
            ...theme,
            ...title,
            headerShown: true,
            title: 'Notes',
            headerLeft: renderBack,
          }}
        />
        <Stack.Screen
          name="expenses"
          options={{
            ...theme,
            ...title,
            headerShown: true,
            title: 'Spending',
            headerLeft: renderBack,
          }}
        />
      </Stack>
    </RequireLocalStore>
  );
}
