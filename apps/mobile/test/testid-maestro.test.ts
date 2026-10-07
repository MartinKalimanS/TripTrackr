/**
 * What ties the extracted ids to the things that look them up (feature 004, T414):
 * the `id:` selectors of the Maestro flows in `e2e/`, and the concrete tab ids
 * the tab bar builds from the route files of `src/app/(tabs)`. Pinned on small
 * inputs here; `testid-parity.test.ts` runs them over the tree.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findMissing } from '../scripts/lib/extract-ids';
import {
  extractMaestroSelectors,
  findUnresolvedSelectors,
  formatUnresolvedSelectors,
  selectorResolves,
} from '../scripts/lib/e2e-ids';
import {
  REQUIRED_TAB_ROUTES,
  discoverTabRoutes,
  presentTabIds,
  requiredTabIds,
  withTabIds,
} from '../scripts/lib/tab-routes';

describe('extractMaestroSelectors', () => {
  it('reads quoted, double-quoted and bare ids, in a block and inline', () => {
    const yaml = [
      'appId: com.example.app',
      '---',
      '- tapOn:',
      "    id: 'trip-open-notes'",
      '- assertVisible:',
      '    id: "tab-bar"',
      '- tapOn:',
      '    id: welcome-screen',
      "- tapOn: { id: 'inline-id', text: 'x' }",
    ].join('\n');
    expect(extractMaestroSelectors(yaml)).toEqual([
      'trip-open-notes',
      'tab-bar',
      'welcome-screen',
      'inline-id',
    ]);
  });

  it('keeps regex and variable selectors as written', () => {
    const yaml = [
      "    id: 'document-row-.*'",
      "    id: 'trip-open-${SEGMENT}'",
      "    id: 'anchor-country:*'",
    ].join('\n');
    expect(extractMaestroSelectors(yaml)).toEqual([
      'document-row-.*',
      'trip-open-${SEGMENT}',
      'anchor-country:*',
    ]);
  });

  it('ignores system ids, comments and other keys that end in id', () => {
    const yaml = [
      "    id: 'android:id/button1'",
      "    # id: 'commented-out'",
      "    id: 'kept' # trailing words",
      '    appId: com.example.app',
      "    text: 'a sentence with id: inside'",
    ].join('\n');
    expect(extractMaestroSelectors(yaml)).toEqual(['kept']);
  });

  it('returns nothing for a flow without ids', () => {
    expect(extractMaestroSelectors('- launchApp\n- tapOn: Back\n')).toEqual([]);
  });
});

describe('selectorResolves', () => {
  it.each([
    ['tab-bar', ['tab-bar']],
    ['tab-trips', ['tab-<param>']],
    ['currency-EUR', ['currency-<param>']],
    ['stop-move-up-9f2', ['stop-move-up-<param>']],
    ['google-sign-in', ['<param>-sign-in']],
    ['tab-trips', ['tab-bar', 'tab-<param>']],
  ])('finds the concrete id %s in %j', (selector, ids) => {
    expect(selectorResolves(selector, ids)).toBe(true);
  });

  it.each([
    ['tab-trips', ['tab-bar']],
    ['tab-', ['tab-<param>']],
    ['tab-a b', ['tab-<param>']],
    ['trip-screen', ['trip-screens']],
    ['trip-screen', []],
  ])('does not find the concrete id %s in %j', (selector, ids) => {
    expect(selectorResolves(selector, ids)).toBe(false);
  });

  it.each([
    ['document-row-.*', ['document-row-<param>']],
    ['photo-thumbnail-.*', ['photo-thumbnail-<param>', 'photo-viewer']],
    ['anchor-country:*', ['anchor-<param>']],
    ['conflict-notice-notes:.*-dismiss', ['conflict-notice-<param>-dismiss']],
    ['trip-open-${SEGMENT}', ['trip-open-<param>']],
    ['city-picker-country-${COUNTRY_ISO}', ['city-picker-country-<param>']],
    ['offline-status-.*', ['offline-status-<param>']],
    ['offline-maps-screen\\.title', ['offline-maps-screen.title']],
    ['photo-.*', ['photo-viewer']],
  ])('finds the wildcard selector %s in %j', (selector, ids) => {
    expect(selectorResolves(selector, ids)).toBe(true);
  });

  it.each([
    ['document-row-.*', ['document-fields-status', 'document-row']],
    ['anchor-country:*', ['city-picker-country-<param>']],
    ['conflict-notice-notes:.*-dismiss', ['conflict-notice-<param>-open']],
    ['trip-open-${SEGMENT}', ['trip-add-stop']],
    ['photo-thumbnail-.*', ['photo-tile-<param>']],
    ['offline-maps-screen\\.title', ['offline-maps-screenxtitle']],
  ])('does not find the wildcard selector %s in %j', (selector, ids) => {
    expect(selectorResolves(selector, ids)).toBe(false);
  });
});

describe('findUnresolvedSelectors', () => {
  const entries = [
    { selector: 'tab-bar', file: 'e2e/00-smoke.yaml' },
    { selector: 'gone-id', file: 'e2e/01-account.yaml' },
    { selector: 'gone-id', file: 'e2e/02-notes.yaml' },
    { selector: 'row-.*', file: 'e2e/02-notes.yaml' },
  ];

  it('returns the entries nothing resolves, with their files', () => {
    const missing = findUnresolvedSelectors(entries, ['tab-bar']);
    expect(missing.map((entry) => `${entry.file} ${entry.selector}`)).toEqual([
      'e2e/01-account.yaml gone-id',
      'e2e/02-notes.yaml gone-id',
      'e2e/02-notes.yaml row-.*',
    ]);
  });

  it('is empty when everything resolves', () => {
    expect(
      findUnresolvedSelectors(entries, ['tab-bar', 'gone-id', 'row-<param>']),
    ).toEqual([]);
  });

  it('formats a message naming each selector once, with the flows that use it', () => {
    const message = formatUnresolvedSelectors(
      findUnresolvedSelectors(entries, ['tab-bar']),
    );
    expect(message).toContain('gone-id');
    expect(message).toContain('e2e/01-account.yaml');
    expect(message).toContain('e2e/02-notes.yaml');
    expect(message.match(/gone-id/g)).toHaveLength(1);
    expect(formatUnresolvedSelectors([])).toBe('');
  });
});

describe('tab routes', () => {
  let appRoot: string;

  const touch = (relative: string) => {
    const file = path.join(appRoot, 'src', 'app', '(tabs)', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export default null;\n');
  };

  beforeEach(() => {
    appRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-routes-'));
  });

  afterEach(() => {
    fs.rmSync(appRoot, { recursive: true, force: true });
  });

  it('names the three tabs the app must keep', () => {
    expect(REQUIRED_TAB_ROUTES).toEqual(['index', 'trips', 'profile']);
  });

  it('reads one route per file, minus the layout', () => {
    ['_layout.tsx', 'index.tsx', 'trips.tsx', 'profile.tsx'].forEach(touch);
    expect(discoverTabRoutes(appRoot)).toEqual(['index', 'profile', 'trips']);
  });

  it('reads a directory as a route, so trips.tsx and trips/index.tsx are both "trips"', () => {
    ['_layout.tsx', 'index.tsx', 'trips/index.tsx', 'trips/[id].tsx'].forEach(touch);
    touch('profile.tsx');
    touch('profile/index.tsx');
    expect(discoverTabRoutes(appRoot)).toEqual(['index', 'profile', 'trips']);
  });

  it('skips layouts, not-found routes, tests and declaration files', () => {
    ['_layout.tsx', '+not-found.tsx', 'index.tsx', 'index.test.tsx'].forEach(touch);
    ['types.d.ts', '__tests__/index.test.tsx', 'notes.md'].forEach(touch);
    expect(discoverTabRoutes(appRoot)).toEqual(['index']);
  });

  it('accepts .ts, .js and .jsx route files', () => {
    ['a.ts', 'b.js', 'c.jsx'].forEach(touch);
    expect(discoverTabRoutes(appRoot)).toEqual(['a', 'b', 'c']);
  });

  it('fails loudly when the (tabs) group is gone', () => {
    fs.mkdirSync(path.join(appRoot, 'src', 'app'), { recursive: true });
    expect(() => discoverTabRoutes(appRoot)).toThrow(/\(tabs\)/);
  });
});

describe('concrete tab ids', () => {
  const patterns = ['tab-bar', 'tab-<param>', 'tab-mark-<param>'];

  it('requires tab-<route> and tab-mark-<route> for each required route', () => {
    expect(requiredTabIds()).toEqual([
      'tab-index',
      'tab-mark-index',
      'tab-mark-profile',
      'tab-mark-trips',
      'tab-profile',
      'tab-trips',
    ]);
  });

  it('finds them when the tab bar builds ids from the route name', () => {
    expect(presentTabIds(['index', 'trips', 'profile'], patterns)).toEqual(
      requiredTabIds(),
    );
  });

  it('finds them when the ids are written out', () => {
    const written = ['tab-index', 'tab-mark-index', 'tab-trips'];
    expect(presentTabIds(['index', 'trips'], written)).toEqual([
      'tab-index',
      'tab-mark-index',
      'tab-trips',
    ]);
  });

  it('finds nothing when the bar builds no tab ids, or the route is not there', () => {
    expect(presentTabIds(['index', 'trips'], ['tab-bar'])).toEqual([]);
    expect(presentTabIds([], patterns)).toEqual([]);
  });

  describe('a renamed route', () => {
    const baseline = { testIDs: ['tab-<param>', 'tab-bar'], accessibilityLabels: [] };
    const current = { testIDs: patterns, accessibilityLabels: [] };
    const none = { testIDs: [], accessibilityLabels: [] };

    it('is missing its old ids', () => {
      const routes = ['index', 'journeys', 'profile'];
      const extended = withTabIds(baseline, current, routes);
      expect(findMissing(extended.baseline, extended.current, none).testIDs).toEqual([
        'tab-mark-trips',
        'tab-trips',
      ]);
    });

    it('can be excused by the allowlist, like any other id', () => {
      const routes = ['index', 'journeys', 'profile'];
      const extended = withTabIds(baseline, current, routes);
      const allowlist = {
        testIDs: [
          { id: 'tab-trips', reason: 'Renamed to journeys in T999' },
          { id: 'tab-mark-trips', reason: 'Renamed to journeys in T999' },
        ],
        accessibilityLabels: [],
      };
      expect(findMissing(extended.baseline, extended.current, allowlist).testIDs).toEqual(
        [],
      );
    });

    it('costs nothing when the routes are intact', () => {
      const extended = withTabIds(baseline, current, ['index', 'trips', 'profile']);
      expect(findMissing(extended.baseline, extended.current, none).testIDs).toEqual([]);
    });

    it('keeps the original lists sorted and free of duplicates', () => {
      const extended = withTabIds(baseline, current, ['index', 'trips', 'profile']);
      for (const list of [extended.baseline.testIDs, extended.current.testIDs]) {
        expect([...new Set(list)].sort()).toEqual(list);
      }
    });
  });
});
