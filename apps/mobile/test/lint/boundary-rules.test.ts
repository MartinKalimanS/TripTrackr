/**
 * ESLint boundary rules (feature 004, T425; FR-036, contracts C4-1 and C4-6).
 *
 * Runs the real `eslint.config.js` through ESLint's Node API on inline sources, so
 * the rules are pinned by behaviour and not by reading the config:
 *
 * - an arbitrary-value colour class (`bg-[#fff]`, `text-[rgb(1,2,3)]`) is rejected
 *   in `src/app` and `src/components`, next to the colour literals the config
 *   already rejected;
 * - `heroui-native` and `uniwind` are importable only from `src/components/ui/**`,
 *   tests, the root layout and the appearance hook.
 *
 * Starting ESLint (config, TypeScript parser, plugins) takes several seconds on a
 * cold cache, hence the generous timeouts.
 */
import path from 'node:path';

import { ESLint } from 'eslint';

import { readWorkingTreeSources } from '../../scripts/lib/extract-ids';

const root = path.resolve(__dirname, '../..');
const STARTUP_TIMEOUT = 120_000;
const LINT_TIMEOUT = 60_000;

let eslint: ESLint;

beforeAll(() => {
  // The real config, handed over as an object: ESLint would load the file with a
  // dynamic `import()`, which Jest's module sandbox refuses without
  // `--experimental-vm-modules`. `require` is what Jest does support.
  const config = require('../../eslint.config.js');
  eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config });
}, STARTUP_TIMEOUT);

async function messagesFor(code: string, file: string, ruleId: string) {
  const [result] = await eslint.lintText(code, { filePath: path.join(root, file) });
  // An ignored file reports one warning and nothing else; "no violations" would
  // then be vacuous, so refuse to answer.
  const ignored = result.messages.find((message) => /ignored/i.test(message.message));
  if (ignored) throw new Error(`${file} is not linted: ${ignored.message}`);
  return result.messages.filter((message) => message.ruleId === ruleId);
}

const colourMessages = (code: string, file: string) =>
  messagesFor(code, file, 'no-restricted-syntax');

const importMessages = (code: string, file: string) =>
  messagesFor(code, file, 'no-restricted-imports');

const COLOUR_FILES = ['src/components/x.tsx', 'src/app/screen.tsx'];

describe('colour literals (C4-1)', () => {
  it.each(COLOUR_FILES)(
    'still rejects a hex, rgb and hsl string literal in %s',
    async (file) => {
      const code = [
        "export const a = '#ff0000';",
        "export const b = 'rgba(0, 0, 0, 0.5)';",
        "export const c = 'hsl(10 20% 30%)';",
      ].join('\n');
      const messages = await colourMessages(code, file);
      expect(messages.map((message) => message.line)).toEqual([1, 2, 3]);
    },
    LINT_TIMEOUT,
  );

  it.each(COLOUR_FILES)(
    'rejects an arbitrary-value colour class in a className string in %s',
    async (file) => {
      const code = 'export const A = () => <View className="bg-[#fff] p-2" />;';
      const messages = await colourMessages(code, file);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('C4-1');
      expect(messages[0].message).toContain(
        'specs/004-app-ui-redesign/contracts/design-tokens.md',
      );
    },
    LINT_TIMEOUT,
  );

  it.each([
    'bg-[#fff]',
    'bg-[#ffff]',
    'text-[#a1b2c3]',
    'border-[#a1b2c3d4]',
    'text-[rgb(1,2,3)]',
    'bg-[rgba(0,0,0,0.5)]',
    'text-[hsl(10_20%_30%)]',
    'bg-[hsla(10,20%,30%,0.5)]',
    'border-[oklch(0.7_0.1_200)]',
    'bg-[oklab(0.5_0.1_0.1)]',
    'text-[lab(50%_40_59)]',
    'text-[lch(50%_40_59)]',
    'bg-[color(display-p3_1_0_0)]',
    'dark:hover:bg-[rgb(var(--x))]',
  ])(
    'rejects %s as a string and inside a template literal',
    async (utility) => {
      const file = 'src/components/x.tsx';
      const asString = await colourMessages(`export const a = "p-2 ${utility}";`, file);
      const asTemplate = await colourMessages(
        `export const a = \`flex ${utility} \${size}\`;`,
        file,
      );
      expect(asString).toHaveLength(1);
      expect(asTemplate).toHaveLength(1);
    },
    LINT_TIMEOUT,
  );

  it.each([
    'bg-primary',
    'rounded-[12px]',
    'p-[4px]',
    'w-[calc(100%-8px)]',
    'bg-[var(--surface)]',
  ])(
    'accepts %s',
    async (utility) => {
      const code = [
        `export const a = "${utility}";`,
        `export const b = \`${utility} \${size}\`;`,
        `export const C = () => <View className="${utility}" />;`,
      ].join('\n');
      for (const file of COLOUR_FILES) {
        expect(await colourMessages(code, file)).toEqual([]);
      }
    },
    LINT_TIMEOUT,
  );

  it(
    'does not apply to tests or to the token layer',
    async () => {
      const code = 'export const a = "bg-[#fff]"; export const b = "#123456";';
      expect(await colourMessages(code, 'src/components/x.test.tsx')).toEqual([]);
      expect(await colourMessages(code, 'src/app/screen.test.tsx')).toEqual([]);
      expect(await colourMessages(code, 'src/theme/palette.ts')).toEqual([]);
    },
    LINT_TIMEOUT,
  );
});

const KITS = ['heroui-native', 'uniwind'] as const;
const FORBIDDEN_FILES = [
  'src/app/(tabs)/trips.tsx',
  'src/components/trip/trip-card.tsx',
  'src/features/globe/globe-stats.ts',
  'src/hooks/use-other.ts',
];
const ALLOWED_FILES = [
  'src/components/ui/button.tsx',
  'src/components/ui/nested/adapter.ts',
  'src/app/_layout.tsx',
  'src/hooks/use-appearance.ts',
  'src/components/trip/trip-card.test.tsx',
  'src/app/(tabs)/trips.test.tsx',
  'test/components/trip-card.test.tsx',
];

describe.each(KITS)('importing %s (C4-6)', (kit) => {
  const code = `import { Thing } from '${kit}';\nexport const x = Thing;`;

  it.each(FORBIDDEN_FILES)(
    'is rejected in %s, citing the adapter contract',
    async (file) => {
      const messages = await importMessages(code, file);
      expect(messages).toHaveLength(1);
      expect(messages[0].message).toContain('C4-6');
      expect(messages[0].message).toContain('contracts/components.md');
    },
    LINT_TIMEOUT,
  );

  it.each(ALLOWED_FILES)(
    'is allowed in %s',
    async (file) => {
      expect(await importMessages(code, file)).toEqual([]);
    },
    LINT_TIMEOUT,
  );

  it(
    'is rejected in every import form, subpaths included',
    async () => {
      const forms = [
        `import Default from '${kit}';`,
        `import * as All from '${kit}';`,
        `import type { Props } from '${kit}';`,
        `import '${kit}';`,
        `import { deep } from '${kit}/lib/deep';`,
        `export { Thing } from '${kit}';`,
        `export * from '${kit}';`,
      ];
      for (const form of forms) {
        const messages = await importMessages(form, 'src/components/trip/trip-card.tsx');
        expect(`${form} -> ${messages.length}`).toBe(`${form} -> 1`);
      }
    },
    LINT_TIMEOUT,
  );

  it(
    'leaves a package that merely starts with the name alone',
    async () => {
      const lookalike = `import { x } from '${kit}-utils';`;
      const messages = await importMessages(
        lookalike,
        'src/components/trip/trip-card.tsx',
      );
      expect(messages).toEqual([]);
    },
    LINT_TIMEOUT,
  );
});

describe('other imports (C4-6)', () => {
  it(
    'are untouched',
    async () => {
      const code = "import { View } from 'react-native';\nexport const x = View;";
      expect(await importMessages(code, 'src/components/trip/trip-card.tsx')).toEqual([]);
    },
    LINT_TIMEOUT,
  );
});

/**
 * The lint rule sees static `import` and `export … from` only. This is the same
 * boundary read from the files themselves, so a `require()` or a dynamic
 * `import()` of the kit outside the adapter folder fails too.
 */
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
