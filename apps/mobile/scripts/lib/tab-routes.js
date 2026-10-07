'use strict';

/**
 * The concrete tab ids (feature 004, T414; contract C4-11).
 *
 * The tab bar builds `tab-${route.name}` and `tab-mark-${route.name}` from the
 * routes of the `(tabs)` group, so the extractor only sees `tab-<param>`. The
 * Maestro flows tap `tab-trips`, `tab-index` and `tab-profile`; those are lost if
 * a route file is renamed, which no pattern comparison notices. So the route
 * names are read from `src/app/(tabs)` and the ids are expanded here.
 */

const fs = require('node:fs');
const path = require('node:path');

const { PARAM } = require('./extract-ids');

/** The tabs the app must keep: the globe (`index`), the trips and the profile. */
const REQUIRED_TAB_ROUTES = ['index', 'trips', 'profile'];

/** @param {Iterable<string>} values */
const sortedUnique = (values) => [...new Set(values)].sort();

/** @param {string} route */
const tabIdsOf = (route) => [`tab-${route}`, `tab-mark-${route}`];

/**
 * The route a directory entry of `(tabs)` stands for: `trips.tsx` and
 * `trips/index.tsx` are both `trips`. Layouts (`_layout`), special routes
 * (`+not-found`), tests and declaration files are not routes.
 * @param {fs.Dirent} entry
 * @returns {string[]}
 */
function routeOf(entry) {
  const { name } = entry;
  if (/^[_+]/.test(name) || /\.d\.ts$/.test(name) || /\.test\./.test(name)) return [];
  if (entry.isDirectory()) return [name];
  const file = /^(.+)\.(?:tsx?|jsx?)$/.exec(name);
  return file ? [file[1]] : [];
}

/**
 * The tab routes, from the files and directories of `src/app/(tabs)`.
 * @param {string} appRoot
 * @returns {string[]} sorted
 */
function discoverTabRoutes(appRoot) {
  const directory = path.join(appRoot, 'src', 'app', '(tabs)');
  if (!fs.existsSync(directory)) {
    throw new Error(
      `Cannot read the tab routes: ${directory} is missing. If the (tabs) group moved, update scripts/lib/tab-routes.js.`,
    );
  }
  return sortedUnique(
    fs.readdirSync(directory, { withFileTypes: true }).flatMap(routeOf),
  );
}

/** `tab-<route>` and `tab-mark-<route>` for each required route, sorted. */
function requiredTabIds() {
  return sortedUnique(REQUIRED_TAB_ROUTES.flatMap(tabIdsOf));
}

/**
 * The concrete tab ids of the given routes that the extracted ids produce: an id
 * (written out, or a pattern) gives `tab-trips` when `<param>` stands for `trips`.
 * @param {string[]} routes
 * @param {string[]} ids
 * @returns {string[]} sorted
 */
function presentTabIds(routes, ids) {
  return sortedUnique(
    routes.flatMap((route) =>
      tabIdsOf(route).filter((candidate) =>
        ids.some((id) => id.split(PARAM).join(route) === candidate),
      ),
    ),
  );
}

/**
 * The baseline and the current ids with the concrete tab ids added: the required
 * ones to the baseline, the ones the tree produces for its routes to the current.
 * A renamed route then shows up as missing ids, which the allowlist can excuse
 * like any other.
 * @template {{ testIDs: string[] }} B
 * @template {{ testIDs: string[] }} C
 * @param {B} baseline
 * @param {C} current
 * @param {string[]} routes
 * @returns {{ baseline: B, current: C }}
 */
function withTabIds(baseline, current, routes) {
  return {
    baseline: {
      ...baseline,
      testIDs: sortedUnique([...baseline.testIDs, ...requiredTabIds()]),
    },
    current: {
      ...current,
      testIDs: sortedUnique([
        ...current.testIDs,
        ...presentTabIds(routes, current.testIDs),
      ]),
    },
  };
}

module.exports = {
  REQUIRED_TAB_ROUTES,
  discoverTabRoutes,
  presentTabIds,
  requiredTabIds,
  withTabIds,
};
