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
 * own bar until its migration (phase 5). What the overview's header carries:
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
 * The sub-screens that have moved to Atlas (notes T440, spending T441, offline maps T444,
 * photos T442, documents T443) have the same header with a title of their own, built by
 * `titled` below: a screen that is not the trip's hero has its title in the bar (FR-007;
 * the trip's name is not repeated in it, it is the first line of the page where the screen
 * shows one), with the same `HeaderBackButton` and theme. Each takes its title style from
 * `useHeaderTitleStyle` (the foreground ink in the display face; without it
 * `headerTintColor` would paint the title in the accent, which FR-003 keeps for actions,
 * the selected and the active). A standard title, not a large one: the large title is for
 * the top-level lists. `document-capture` stays headerless: it is a camera surface with
 * its own opaque bar (see that screen's header comment).
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
  const titled = (text: string) => ({
    ...theme,
    ...title,
    headerShown: true,
    title: text,
    headerLeft: renderBack,
  });

  return (
    <RequireLocalStore>
      <Stack screenOptions={{ headerShown: false, contentStyle: theme.contentStyle }}>
        <Stack.Screen
          name="index"
          options={{ ...theme, headerShown: true, title: '', headerLeft: renderBack }}
        />
        <Stack.Screen name="notes" options={titled('Notes')} />
        <Stack.Screen name="expenses" options={titled('Spending')} />
        <Stack.Screen name="photos" options={titled('Photos')} />
        <Stack.Screen name="documents" options={titled('Documents')} />
        <Stack.Screen name="document-view" options={titled('Document')} />
        <Stack.Screen name="offline-maps" options={titled('Offline maps')} />
      </Stack>
    </RequireLocalStore>
  );
}
