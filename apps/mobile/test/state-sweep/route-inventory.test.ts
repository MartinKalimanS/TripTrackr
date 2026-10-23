/**
 * T559 - the route inventory is complete and honest (FR-064, FR-066): every screen under
 * `src/app` has a row, every state it claims to handle is pinned by a test that still exists and
 * still says the words, and a state that does not apply says why. A new route with no row, or a
 * test deleted from under a row, fails here.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  EXCLUDED_ROUTES,
  LAYOUT_ROUTES,
  ROUTE_INVENTORY,
  type Cell,
} from './route-inventory';

const appRoot = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(appRoot, file), 'utf8');

function routeFiles(directory: string): string[] {
  return fs
    .readdirSync(path.join(appRoot, directory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return routeFiles(relative);
      return /\.tsx$/.test(entry.name) ? [relative] : [];
    });
}

const cellsOf = (row: (typeof ROUTE_INVENTORY)[number]): [string, Cell][] => [
  ['loading', row.loading],
  ['empty', row.empty],
  ['error', row.error],
  ...(row.extra ?? []).map((extra): [string, Cell] => [extra.name, extra.cell]),
];

describe('the route inventory', () => {
  it('has a row, a layout entry or an exclusion for every file under src/app', () => {
    const known = new Set([
      ...ROUTE_INVENTORY.map((row) => row.route),
      ...LAYOUT_ROUTES,
      ...EXCLUDED_ROUTES,
    ]);
    const missing = routeFiles('src/app').filter((file) => !known.has(file));
    expect(missing).toEqual([]);
  });

  it('names only files that exist', () => {
    const listed = [
      ...ROUTE_INVENTORY.map((row) => row.route),
      ...LAYOUT_ROUTES,
      ...EXCLUDED_ROUTES,
    ];
    expect(listed.filter((file) => !fs.existsSync(path.join(appRoot, file)))).toEqual([]);
  });

  it('lists no route twice', () => {
    const routes = ROUTE_INVENTORY.map((row) => row.route);
    expect(routes.filter((route, index) => routes.indexOf(route) !== index)).toEqual([]);
  });

  it('gives every route one primary action, said in words', () => {
    expect(ROUTE_INVENTORY.filter((row) => row.primary.trim() === '')).toEqual([]);
  });

  it.each(ROUTE_INVENTORY.map((row) => [row.route, row] as const))(
    '%s: each state is pinned by a test that still says it, or says why it does not apply',
    (_route, row) => {
      for (const [name, cell] of cellsOf(row)) {
        if ('na' in cell) {
          expect({ name, reason: cell.na.trim().length > 10 }).toEqual({
            name,
            reason: true,
          });
          continue;
        }
        expect({ name, pinned: cell.pins.length > 0 }).toEqual({ name, pinned: true });
        for (const [file, needle] of cell.pins) {
          expect({ name, file, found: read(file).includes(needle) }).toEqual({
            name,
            file,
            found: true,
          });
        }
      }
    },
  );

  it('names for every route a runtime sweep that exists and renders its screen', () => {
    const problems = ROUTE_INVENTORY.flatMap((row) => {
      if (!fs.existsSync(path.join(appRoot, row.sweep))) {
        return [`${row.route}: ${row.sweep} does not exist`];
      }
      const module = '@/' + row.route.replace(/^src\//, '').replace(/\.tsx$/, '');
      const text = read(row.sweep);
      // The Home suites reach their screen through the shared harness.
      const rendersIt =
        text.includes(module) ||
        text.includes(module.replace(/\/index$/, '')) ||
        text.includes('-harness');
      return rendersIt ? [] : [`${row.route} is not rendered by ${row.sweep}`];
    });
    expect(problems).toEqual([]);
  });

  it('keeps the gallery out of the sweep and the gates in it', () => {
    expect(EXCLUDED_ROUTES.every((file) => file.includes('(dev)'))).toBe(true);
    const routes = ROUTE_INVENTORY.map((row) => row.route);
    expect(routes).toContain('src/components/require-local-store.tsx');
    expect(routes).toContain('src/components/sync/first-sync-gate.tsx');
  });
});
