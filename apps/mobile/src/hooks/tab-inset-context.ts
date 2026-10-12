/**
 * The height of the tab bar as a scene sees it, on a context with no dependencies (feature 005,
 * T530; FR-024). The `(tabs)` layout provides it (`TabInsetScope`, by the navigator's
 * `screenLayout`) from `useBottomTabBarHeight()`; `useTabInset()` reads it. It is its own module
 * so `Screen` and `ListScreen`, which nearly every screen is built on, can read the clearance
 * without importing the router: `expo-router/js-tabs` loads the whole navigation stack, which
 * a plain scroll container must not pay for.
 *
 * `undefined` means "not in the tab navigator": no bar is drawn, nothing is kept clear.
 */
import { createContext } from 'react';

export const TabInsetContext = createContext<number | undefined>(undefined);
