/**
 * The kit boundary read from the files themselves (feature 004, T425; contract
 * C4-6).
 *
 * `boundary-rules.test.ts` pins the ESLint rule, which sees static `import` and
 * `export … from` only. This reads every source file outside the adapter folder
 * for any reference to the kit, so a `require()` or a dynamic `import()` fails
 * too. It needs no ESLint, so it is quick.
 */
import path from 'node:path';

import { readWorkingTreeSources } from '../../scripts/lib/extract-ids';

const root = path.resolve(__dirname, '../..');

const KIT_REFERENCE =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"](?:heroui-native|uniwind)(?:\/[^'"]*)?['"]/;
const KIT_ALLOWED = [
  /^src\/components\/ui\//,
  /^src\/app\/_layout\.tsx$/,
  /^src\/hooks\/use-appearance\.ts$/,
];

describe('the sources outside the adapter folder (C4-6)', () => {
  it.each([
    "import { A } from 'heroui-native';",
    'import { B } from "uniwind";',
    "export { C } from 'uniwind/types';",
    "import 'heroui-native';",
    "const d = require('heroui-native');",
    "const e = await import('uniwind');",
  ])('recognises %s as a kit reference', (line) => {
    expect(KIT_REFERENCE.test(line)).toBe(true);
  });

  it.each([
    "import { View } from 'react-native';",
    "import { x } from 'uniwind-utils';",
    "const label = 'powered by heroui-native';",
  ])('does not mistake %s for one', (line) => {
    expect(KIT_REFERENCE.test(line)).toBe(false);
  });

  it('none imports the kit', () => {
    const offenders = readWorkingTreeSources(root)
      .filter((file) => !KIT_ALLOWED.some((allowed) => allowed.test(file.path)))
      .filter((file) => KIT_REFERENCE.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
