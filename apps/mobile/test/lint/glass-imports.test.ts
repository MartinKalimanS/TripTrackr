/**
 * The glass boundary read from the files themselves (feature 005, T527; contract C5-13): the
 * glass module is imported by the adapter layer and the navigation chrome only
 * (`src/components/ui/**`, `src/components/navigation/**`) and by tests, so a screen cannot
 * come to depend on it and a failed device check (V4) switches the pill to blur or solid
 * without touching a screen. `eslint.config.js` restricts the kit (`heroui-native`,
 * `uniwind`), which the navigation chrome does not import; this reads every other source file
 * for a reference to the glass module, `require()` and dynamic `import()` included.
 */
import path from 'node:path';

import { readWorkingTreeSources } from '../../scripts/lib/extract-ids';

const root = path.resolve(__dirname, '../..');

const GLASS_REFERENCE =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]expo-glass-effect(?:\/[^'"]*)?['"]/;
const GLASS_ALLOWED = [/^src\/components\/ui\//, /^src\/components\/navigation\//];

describe('the glass module (C5-13)', () => {
  it.each([
    "import { GlassView } from 'expo-glass-effect';",
    'import { isLiquidGlassAvailable } from "expo-glass-effect";',
    "export { GlassContainer } from 'expo-glass-effect';",
    "const glass = require('expo-glass-effect');",
    "const glass = await import('expo-glass-effect');",
  ])('recognises %s as a reference', (line) => {
    expect(GLASS_REFERENCE.test(line)).toBe(true);
  });

  it.each([
    "import { BlurView } from 'expo-blur';",
    "const label = 'powered by expo-glass-effect';",
    "import { x } from 'expo-glass-effect-utils';",
  ])('does not mistake %s for one', (line) => {
    expect(GLASS_REFERENCE.test(line)).toBe(false);
  });

  it('is imported by the adapters and the navigation chrome only', () => {
    const offenders = readWorkingTreeSources(root)
      .filter((file) => !GLASS_ALLOWED.some((allowed) => allowed.test(file.path)))
      .filter((file) => GLASS_REFERENCE.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it('is imported by the tab surface, which is where the glass lives', () => {
    const importers = readWorkingTreeSources(root)
      .filter((file) => GLASS_REFERENCE.test(file.text))
      .map((file) => file.path);
    expect(importers).toContain('src/components/navigation/tab-surface.tsx');
  });
});
