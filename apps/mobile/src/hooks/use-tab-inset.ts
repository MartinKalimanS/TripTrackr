/**
 * `useTabInset()` - how much a scene keeps clear at the bottom of the screen so nothing is
 * hidden behind the floating tab bar (feature 005, contract C5-21, research D5-05; FR-023,
 * FR-024):
 *
 *   const inset = useTabInset();   // 104 on a 390 by 844 iPhone, 0 above the tabs
 *   <FlashList contentContainerStyle={{ paddingBottom: inset }} />
 *   <PlanTripFab style={{ bottom: inset }} />
 *
 * The pill (and the Android bar) floats over the scenes, so the scenes run under it. It
 * reports `height + bottomOffset` through `BottomTabBarHeightCallbackContext` (88 dp on that
 * phone: the pill's 64 and the 24 below it) and the navigator hands that to every scene as
 * `BottomTabBarHeightContext`; a list ends with at least that plus 16 dp, a button floats 16 dp
 * above it, a toast above the button. `Screen` and `ListScreen` already apply it, which is why
 * a tab scene built on them needs nothing; a scene that floats a control (the Plan a trip
 * button, the Home sheet's bottom padding) calls this.
 *
 * The tab layout publishes that height on `TabInsetContext` (`TabInsetScope`, by the navigator's
 * `screenLayout`), a context of its own so a scroll container does not import the router.
 *
 * A screen pushed above the tabs (a trip, a form) is outside the tab navigator: no context, no
 * pill, so nothing to keep clear and the answer is zero. That is why this reads the context with
 * `use()` and does not call `useBottomTabBarHeight()`, which throws outside the navigator.
 */
import { use } from 'react';

import { PillMetrics } from '@/components/navigation/tab-metrics';

import { TabInsetContext } from './tab-inset-context';

/** What a scene leaves between the bar and its content or its buttons. */
export const TAB_CLEARANCE = PillMetrics.clearance;

/** The inset for a reported bar height; zero where there is no bar. Pure. */
export function tabInsetOf(barHeight: number | undefined): number {
  return barHeight === undefined ? 0 : barHeight + TAB_CLEARANCE;
}

export function useTabInset(): number {
  return tabInsetOf(use(TabInsetContext));
}
