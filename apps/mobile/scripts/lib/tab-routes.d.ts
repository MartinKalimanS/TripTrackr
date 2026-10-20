/** Types for `tab-routes.js`. */

/** The tabs the app must keep. */
export const REQUIRED_TAB_ROUTES: readonly ['index', 'trips', 'profile'];

/** The routes of `src/app/(tabs)`, sorted. Throws if the group is missing. */
export function discoverTabRoutes(appRoot: string): string[];

/** `tab-<route>` and `tab-mark-<route>` for each required route, sorted. */
export function requiredTabIds(): string[];

/** The concrete tab ids of `routes` that `ids` produce, sorted. */
export function presentTabIds(
  routes: readonly string[],
  ids: readonly string[],
): string[];

/** The baseline and current ids with the concrete tab ids added. */
export function withTabIds<
  B extends { testIDs: string[] },
  C extends { testIDs: string[] },
>(baseline: B, current: C, routes: readonly string[]): { baseline: B; current: C };
