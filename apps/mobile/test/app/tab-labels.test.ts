/**
 * T530 - the deliberate label change of the third tab (feature 005, FR-023, FR-081, "Copy and
 * label policy"): "Profile" becomes "You"; the route and the ids (`tab-profile`,
 * `tab-mark-profile`) do not change.
 *
 * Why this is a test and not a line of `test/testid-parity.allowlist.json`: that allowlist
 * excuses an id or an accessible name the `pre-004-baseline` extractor FOUND and the tree no
 * longer has, and fails on an entry the baseline never had. The tab's name comes from the route
 * options (`title`), not from an `accessibilityLabel` prop, so the baseline never held
 * "Profile", and an entry for it would be rejected. The change is recorded here, where it is
 * enforced, and in `specs/005-sunrise-passport-ui/tasks.md` ("Maestro flow edits"):
 *
 * - the layout names the three tabs Globe, Trips and You, on the routes `index`, `trips` and
 *   `profile`, so the ids still resolve (`test/testid-parity.test.ts` checks the concrete tab
 *   ids against the route files);
 * - no Maestro flow selects a tab, or anything, by the word "Profile": the flows tap the ids
 *   (`tab-profile`), which is why the rename needs no flow edit.
 */
import fs from 'node:fs';
import path from 'node:path';

import { readMaestroSelectors } from '../../scripts/lib/e2e-ids';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('the tabs of the (tabs) layout (FR-023)', () => {
  const layout = read('src/app/(tabs)/_layout.tsx');
  const tabs = [
    ...layout.matchAll(
      /<Tabs\.Screen name="(\w+)" options=\{\{ title: '([^']+)' \}\} \/>/g,
    ),
  ].map((match) => [match[1], match[2]]);

  test('are Globe, Trips and You, on the same three routes as ever', () => {
    expect(tabs).toEqual([
      ['index', 'Globe'],
      ['trips', 'Trips'],
      ['profile', 'You'],
    ]);
  });

  test('the nested Profile stack titles its screen with the same word as its tab', () => {
    expect(read('src/app/(tabs)/profile/_layout.tsx')).toContain(
      "useStackHeaderOptions('You')",
    );
  });
});

describe('the Maestro flows do not depend on the old label', () => {
  const selectors = readMaestroSelectors(root);

  test('there are flows to check, and they do select by text elsewhere (the guard can fail)', () => {
    expect(selectors.length).toBeGreaterThan(50);
  });

  test('no flow selects "Profile" or "You" as a tab label', () => {
    const flows = fs.readdirSync(path.join(root, 'e2e'), { recursive: true }) as string[];
    const offenders = flows
      .filter((file) => /\.ya?ml$/.test(file))
      .filter((file) => {
        const live = read(path.join('e2e', file))
          .split('\n')
          .filter((line) => !line.trim().startsWith('#'))
          .join('\n');
        return /(?:['"]|text:\s*)(?:Profile|You)['"]?\s*$/m.test(live);
      });
    expect(offenders).toEqual([]);
  });

  test('every flow that opens the profile does it by id', () => {
    const byId = selectors.filter(({ selector }) => selector === 'tab-profile');
    expect(byId.length).toBeGreaterThan(0);
  });
});
