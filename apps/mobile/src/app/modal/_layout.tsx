/**
 * Modal group - add-trip, add-expense, paywall (plan.md "Project Structure"); form sheets
 * since feature 004 (tasks.md T427 modal part, T434; FR-009; research D4-06).
 *
 * The root layout presents the group's route with `formSheetOptions` (a form sheet as tall
 * as its contents, with a grabber): presentation belongs to the screen that is presented,
 * and that screen is the root stack's `modal`, which is why the options are not set here.
 * The group renders its route with a `Slot`, not a nested `Stack`: the v57 modals guide
 * (https://docs.expo.dev/router/advanced/modals.md, "Android limitations") says a form sheet
 * supports neither native headers nor nested stack navigators there, and asks for the title
 * and the actions to be rendered as part of the sheet's content. Each route therefore draws
 * its own title and its own Cancel and Save (`FormSheet`); there is no native header or Back
 * inside a sheet, and the sheet's handle, the Cancel button and a swipe down are the ways
 * out (FR-009).
 *
 * No `unstable_settings` and no `initialParams` here: the root layout keeps the anchor
 * (`(tabs)`), so a deep link to a sheet still has the tabs beneath it
 * (https://docs.expo.dev/router/advanced/modals.md, "Handle deep-linked modals").
 * The sheets write to the local store, hence `RequireLocalStore` (T041).
 */
import { Slot } from 'expo-router';

import { RequireLocalStore } from '@/components/require-local-store';

export default function ModalLayout() {
  return (
    <RequireLocalStore>
      <Slot />
    </RequireLocalStore>
  );
}
