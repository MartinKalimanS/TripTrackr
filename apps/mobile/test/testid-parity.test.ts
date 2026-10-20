/**
 * testID and accessible-name parity guard (feature 004, T414; FR-037, SC-003).
 *
 * The redesign rebuilds every screen's markup but must not rename or drop a
 * `testID` (the Maestro flows and the Jest suites find controls by it) or a
 * static accessible name (assistive-technology output is unchanged, FR-030).
 * `test/fixtures/testid-baseline.json` is the set extracted from the
 * `pre-004-baseline` tag by `scripts/testid-baseline.mjs`, with the tag's commit
 * recorded in its `source`. This suite compares the working tree with it and
 * fails when:
 *
 * - a baseline testID or accessible name is gone, unless the allowlist excuses it;
 * - a concrete tab id (`tab-<route>`, `tab-mark-<route>` for index, trips and
 *   profile) is gone: the tab bar builds those from the route files of
 *   `src/app/(tabs)`, so a route rename loses them, and the allowlist can excuse
 *   that too;
 * - an `id:` selector of a Maestro flow in `e2e/` no longer matches any id;
 * - the number of id-bearing props the extractor cannot read changes without
 *   `test/fixtures/testid-unresolved-count.json` changing with it (a prop that
 *   forwards `testID={testID}` hides the real id from the guard).
 *
 * The extractor, the comparison and the Maestro and tab-route readers are pinned
 * on small inputs in `testid-extractor.test.ts`, `testid-checks.test.ts` and
 * `testid-maestro.test.ts`; this file runs them over the tree.
 *
 * Allowlist schema (`test/testid-parity.allowlist.json`; JSON has no comments, so
 * it is described here). Both lists are required, nothing else is allowed, and
 * an entry is an object:
 *
 *   {
 *     "testIDs": [{ "id": "trip-card-<param>", "reason": "Dropped with X, T432" }],
 *     "accessibilityLabels": [{ "id": "Plan a trip", "reason": "Reworded, T433" }]
 *   }
 *
 * `id` is an item exactly as the baseline spells it (templates read
 * `trip-card-<param>`; concrete tab ids read `tab-trips`). `reason` must say why,
 * name the task (`T` and three digits) and point at the `tasks.md` note and the
 * Maestro edit that FR-037 requires. An `id` listed twice, one the baseline never
 * had, or one the tree carries again fails the suite: an exception must not
 * outlive its cause.
 *
 * Regenerating the baseline (only if the extractor itself changes; the tag is
 * the source of truth, never the working tree, and only that tag is accepted):
 *
 *   node scripts/testid-baseline.mjs --from pre-004-baseline \
 *     --write test/fixtures/testid-baseline.json
 *
 * The same checks run from the shell with
 * `node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json`.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  analyseSources,
  compareUnresolved,
  findMissing,
  formatMissing,
  readWorkingTreeSources,
  validateAllowlist,
  validateBaseline,
} from '../scripts/lib/extract-ids';
import {
  findUnresolvedSelectors,
  formatUnresolvedSelectors,
  readMaestroSelectors,
} from '../scripts/lib/e2e-ids';
import {
  REQUIRED_TAB_ROUTES,
  discoverTabRoutes,
  withTabIds,
} from '../scripts/lib/tab-routes';

type Entry = { id: string; reason: string };

describe('parity with the pre-004 baseline', () => {
  const root = path.resolve(__dirname, '..');
  const readJson = (file: string): unknown =>
    JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

  const baseline = readJson('test/fixtures/testid-baseline.json') as {
    source: { ref: string; sha: string };
    testIDs: string[];
    accessibilityLabels: string[];
  };
  const allowlist = readJson('test/testid-parity.allowlist.json') as {
    testIDs: Entry[];
    accessibilityLabels: Entry[];
  };
  const storedUnresolved = readJson('test/fixtures/testid-unresolved-count.json') as {
    testIDs: number;
    accessibilityLabels: number;
  };
  const { ids: current, unresolved } = analyseSources(readWorkingTreeSources(root));
  const extended = withTabIds(baseline, current, discoverTabRoutes(root));

  it('has a baseline taken from the pre-004-baseline tag, by commit', () => {
    expect(baseline.source.ref).toBe('pre-004-baseline');
    expect(baseline.source.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(validateBaseline(baseline)).toEqual([]);
  });

  it('has a baseline that is not trivially small', () => {
    expect(baseline.testIDs.length).toBeGreaterThan(100);
    expect(baseline.accessibilityLabels.length).toBeGreaterThan(30);
  });

  it('sees the ids the Maestro flows and the tab bar rely on', () => {
    expect(current.testIDs).toEqual(
      expect.arrayContaining([
        'tab-bar',
        'tab-<param>',
        'tab-mark-<param>',
        'trip-card-<param>',
        'add-trip-cancel',
        'add-trip-save',
        'home-screen',
      ]),
    );
  });

  it('keeps the allowlist honest', () => {
    expect(validateAllowlist(allowlist, extended.baseline, extended.current)).toEqual([]);
  });

  it('still carries every baseline testID and accessible name', () => {
    const missing = findMissing(extended.baseline, extended.current, allowlist);
    const message = formatMissing(missing);
    if (message) throw new Error(message);
  });

  it('has a route file for every tab the app must keep', () => {
    // A rename shows as missing tab ids above; this names the cause.
    const routes = discoverTabRoutes(root);
    const gone = REQUIRED_TAB_ROUTES.filter((route) => !routes.includes(route));
    const excused = new Set(allowlist.testIDs.map((entry) => entry.id));
    const unexcused = gone.filter((route) => !excused.has(`tab-${route}`));
    expect(unexcused).toEqual([]);
  });

  describe('the Maestro flows', () => {
    const selectors = readMaestroSelectors(root);

    it('are read (a broken reader would pass vacuously)', () => {
      expect(selectors.length).toBeGreaterThan(80);
      expect(selectors.map((entry) => entry.selector)).toEqual(
        expect.arrayContaining(['tab-bar', 'tab-trips', 'document-row-.*']),
      );
    });

    it('only look for ids the tree still builds', () => {
      const message = formatUnresolvedSelectors(
        findUnresolvedSelectors(selectors, current.testIDs),
      );
      if (message) throw new Error(message);
    });
  });

  it('reads as many id-bearing props as it did when the count was stored', () => {
    const message = compareUnresolved(storedUnresolved, unresolved);
    if (message) throw new Error(message);
  });
});
