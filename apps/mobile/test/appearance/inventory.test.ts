/**
 * T562 - the sweep covers every route (feature 005; FR-073, FR-078, FR-079, SC-008). The route
 * inventory is read from `src/app/**` (layouts and the dev gallery are not screens: the gallery
 * has its own suite, `test/dev/`, and the layouts theirs), and each screen file must be imported
 * by one of the sweep suites, so a new route cannot be added without its four themes and the
 * two reduced-transparency renderings.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.resolve(__dirname, '../../src/app');
const SWEEPS = readdirSync(__dirname).filter((name) =>
  /^screens-.*\.test\.tsx$/.test(name),
);

/** Every route file below `directory`, as an `@/app/...` module path without the extension. */
function routes(directory: string, prefix = '@/app'): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return routes(path.join(directory, entry.name), file);
    return /\.tsx$/.test(entry.name) ? [file.replace(/\.tsx$/, '')] : [];
  });
}

const SCREENS = routes(APP).filter(
  (route) => !/\/_layout$/.test(route) && !route.startsWith('@/app/(dev)/'),
);

describe('the route inventory', () => {
  test('has the screens this feature built', () => {
    expect(SCREENS).toHaveLength(20);
  });

  test('is swept: every screen is rendered by a sweep suite', () => {
    const text = SWEEPS.map((name) =>
      readFileSync(path.join(__dirname, name), 'utf8'),
    ).join('\n');
    // A nested route is imported by its folder (`@/app/(tabs)/trips`) or by its file.
    const missing = SCREENS.filter(
      (route) =>
        ![route, route.replace(/\/index$/, '')].some((name) =>
          text.includes(`from '${name}'`),
        ),
    );
    expect(missing).toEqual([]);
  });
});
