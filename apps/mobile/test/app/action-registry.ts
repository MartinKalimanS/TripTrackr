/**
 * The action registry — T059, US5, Acceptance Scenario 5.4.
 *
 * Scenario 5.4 promises that enabling an accessibility setting never costs the
 * traveller an action. Checking that promise needs a definition of "an action",
 * and this file is it: an explicit, per-screen list of the controls each screen
 * offers at rest.
 *
 * ## Why a registry rather than reading the tree
 *
 * Two alternatives were considered and rejected (the reasoning is preserved
 * because the trade-off is real and a future reader will want to reopen it):
 *
 *   - Walking the accessibility tree for interactive roles measures exactly
 *     what a screen-reader user can reach, but a control that is unlabelled or
 *     carries no role is invisible to it — absent under BOTH the default and
 *     the adapted render, so parity passes while the control is unreachable.
 *   - Collecting every node with an `onPress` catches those too, but sweeps in
 *     things that are not actions (scroll containers, keyboard-dismiss
 *     wrappers) and couples the assertion to how components are built, so it
 *     churns on refactors that changed no behaviour.
 *
 * A registry is unambiguous, stable under restyling, and reads as documentation
 * of what each screen promises. It is also the only one of the three whose
 * identifiers cannot drift when the styling changes — which matters here,
 * because the styling changing is the entire point of this feature.
 *
 * ## The cost, stated plainly
 *
 * A registry only checks what someone remembered to register. A control added
 * to a screen and not added here is silently outside the guarantee, and the
 * failure mode is a test that keeps passing while its coverage decays. There is
 * no clever way around that — it is the price of the approach. Two things blunt
 * it: `expectedAt Rest` is asserted to be non-empty and fully present at the
 * default render (below), so entries that rot are caught loudly; and the rule
 * for contributors is stated here rather than left to memory.
 *
 * **If you add a control to a screen, add its testID here.**
 *
 * ## What belongs in a list
 *
 * Only actions reachable *at rest* — without first performing another action.
 * The "Learn more" links inside each `<Collapsible>` are deliberately absent:
 * they are unmounted until their section is expanded, so they are missing from
 * the default and adapted renders alike, and listing them would fail every row
 * for a reason that has nothing to do with accessibility settings.
 */

/** Screen keys are the display names used by the parity suite's `describe`. */
export type ScreenName = '<HomeScreen>' | '<ExploreScreen>';

export const ActionRegistry: Record<ScreenName, readonly string[]> = {
  '<HomeScreen>': ['action-sentry-test'],
  '<ExploreScreen>': [
    'action-expo-docs',
    'action-collapsible-routing',
    'action-collapsible-platforms',
    'action-collapsible-images',
    'action-collapsible-theming',
    'action-collapsible-animations',
  ],
};
