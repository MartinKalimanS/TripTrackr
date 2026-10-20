/** Types for `e2e-ids.js`. */

export type MaestroSelector = { selector: string; file: string };

/** The `id:` selectors of one Maestro flow, as written. */
export function extractMaestroSelectors(yaml: string): string[];

/** Every selector of every flow under `<appRoot>/e2e`. */
export function readMaestroSelectors(appRoot: string): MaestroSelector[];

/** Whether some extracted id (or `<param>` pattern) can be matched by the selector. */
export function selectorResolves(selector: string, ids: readonly string[]): boolean;

/** The entries whose selector no extracted id serves. */
export function findUnresolvedSelectors(
  entries: readonly MaestroSelector[],
  ids: readonly string[],
): MaestroSelector[];

/** A readable report, or '' when there are none. */
export function formatUnresolvedSelectors(unresolved: readonly MaestroSelector[]): string;
