/**
 * @jest-environment node
 *
 * T412 / T411 — the generated theme defines every variable the kit's themes define.
 *
 * `heroui-native/styles` declares the variables a theme must set (`--background`,
 * `--surface`, `--field-border`, ...) once for `light` and once for `dark`, and derives its
 * other colours from them in `theme.css`. Uniwind requires every registered theme to define
 * the same variables as the kit's two, and the kit reads them everywhere, so a variable the
 * kit starts to need and `theme/generated/theme.css` lacks is a colour that silently falls
 * back, in one theme or all four.
 *
 * `theme-css-sync.test.ts` knows the set from a table written in the generator. This test
 * reads the set from the kit's own stylesheets instead, so a kit upgrade that adds a
 * variable fails the build here, and so does a typo in the generator's table (a variable
 * name the kit has never heard of).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const KIT_STYLES = path.join(
  path.dirname(require.resolve('heroui-native/package.json')),
  'src',
  'styles',
);
const GENERATED = path.resolve(
  __dirname,
  '..',
  '..',
  'src',
  'theme',
  'generated',
  'theme.css',
);

/** Variables the app adds beside the kit's: their names are ours, not the kit's. */
const APP_VARIABLE = /^--(?:status-|pending$)/;

const read = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

/** The text between the braces of the first block that starts with `opener`, or ''. */
function blockOf(css: string, opener: string, from = 0): string {
  const start = css.indexOf(opener, from);
  if (start < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  return '';
}

/** Every `--name:` declared in `css`. */
const declaredIn = (css: string) =>
  new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));

/** Every `var(--name` referenced in `css`, fallbacks included. */
const referencedIn = (css: string) =>
  new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]));

/**
 * The variables a theme must define, read from the kit: what its `@variant light` and
 * `@variant dark` blocks declare, plus any variable `theme.css` reads that neither
 * `theme.css` nor the kit's `@theme` primitives declare (a theme variable the kit moved).
 */
function kitThemeVariables(variablesCss: string, themeCss: string): Set<string> {
  const layer = blockOf(variablesCss, '@layer theme');
  const fromVariants = ['light', 'dark'].flatMap((name) => [
    ...declaredIn(blockOf(layer, `@variant ${name}`)),
  ]);
  const primitives = declaredIn(blockOf(variablesCss, '@theme'));
  const derived = declaredIn(themeCss);
  const read = [...referencedIn(themeCss)].filter(
    (name) => !primitives.has(name) && !derived.has(name),
  );
  return new Set([...fromVariants, ...read]);
}

/** The variables each of our themes declares, keyed by theme name. */
function generatedThemes(css: string): Record<string, Set<string>> {
  const root = blockOf(blockOf(css, '@layer theme'), ':root');
  const names = [...root.matchAll(/@variant ([a-z-]+)\s*\{/g)].map((match) => match[1]);
  return Object.fromEntries(
    names.map((name) => [name, declaredIn(blockOf(root, `@variant ${name} {`))]),
  );
}

const missingFrom = (required: Set<string>, defined: Set<string>) =>
  [...required].filter((name) => !defined.has(name)).sort();

const variablesCss = read(path.join(KIT_STYLES, 'variables.css'));
const themeCss = read(path.join(KIT_STYLES, 'theme.css'));
const generatedCss = read(GENERATED);
const kit = kitThemeVariables(variablesCss, themeCss);
const themes = generatedThemes(generatedCss);

describe('the kit’s themeable variables, read from its own stylesheets', () => {
  test('finds the variables the spike counted: 35 in light and dark', () => {
    // 32 colours (31 + --backdrop) and three shadows; a parse that finds none would make
    // every other test in this file vacuous.
    expect(kit.size).toBe(35);
    for (const name of [
      '--background',
      '--accent',
      '--field-border',
      '--surface-shadow',
    ]) {
      expect(kit.has(name)).toBe(true);
    }
  });

  test('does not count the kit’s fixed primitives as theme variables', () => {
    for (const name of ['--white', '--eclipse', '--radius', '--border-width']) {
      expect(kit.has(name)).toBe(false);
    }
  });

  test('the kit’s light and dark themes declare the same variables', () => {
    const layer = blockOf(variablesCss, '@layer theme');
    const light = declaredIn(blockOf(layer, '@variant light'));
    const dark = declaredIn(blockOf(layer, '@variant dark'));
    expect([...light].sort()).toEqual([...dark].sort());
  });
});

describe('theme/generated/theme.css against the kit', () => {
  test('defines the four Atlas themes', () => {
    expect(Object.keys(themes)).toEqual([
      'light',
      'dark',
      'light-contrast',
      'dark-contrast',
    ]);
  });

  test.each(['light', 'dark', 'light-contrast', 'dark-contrast'])(
    '%s defines every variable the kit’s themes define',
    (name) => {
      expect(missingFrom(kit, themes[name])).toEqual([]);
    },
  );

  test.each(['light', 'dark', 'light-contrast', 'dark-contrast'])(
    '%s defines no variable the kit does not know, apart from the app’s own',
    (name) => {
      const unknown = [...themes[name]]
        .filter((variable) => !kit.has(variable) && !APP_VARIABLE.test(variable))
        .sort();
      expect(unknown).toEqual([]);
    },
  );

  test('overrides only kit primitives that exist, so a renamed one cannot rot unnoticed', () => {
    const shared = declaredIn(blockOf(generatedCss, '@theme {'));
    const primitives = declaredIn(blockOf(variablesCss, '@theme'));
    expect([...shared].filter((name) => !primitives.has(name))).toEqual([]);
  });

  test('exposes the app variables as Tailwind colours, none of them a kit name', () => {
    const inline = declaredIn(blockOf(generatedCss, '@theme inline static'));
    const kitColours = declaredIn(themeCss);
    for (const name of inline) expect(kitColours.has(name)).toBe(false);
  });
});

describe('the checks can fail (they are not vacuous)', () => {
  test('a variable the kit adds to its themes is reported as missing', () => {
    const upgraded = variablesCss.replace(
      '--link: var(--foreground);',
      '--link: var(--foreground);\n      --ring: oklch(50% 0 0);',
    );
    expect(upgraded).not.toBe(variablesCss);

    const required = kitThemeVariables(upgraded, themeCss);

    expect(missingFrom(required, themes.light)).toEqual(['--ring']);
  });

  test('a variable the kit reads in theme.css but declares nowhere is reported as missing', () => {
    const upgraded = `${themeCss}\n@theme inline static { --color-halo: var(--halo); }`;

    expect(missingFrom(kitThemeVariables(variablesCss, upgraded), themes.dark)).toEqual([
      '--halo',
    ]);
  });

  test('a variable our theme lacks is reported, whichever theme it is missing from', () => {
    const without = new Set([...themes['dark-contrast']].filter((n) => n !== '--focus'));

    expect(missingFrom(kit, without)).toEqual(['--focus']);
  });

  test('a misspelt variable in our theme is not a kit variable', () => {
    expect(kit.has('--surfce')).toBe(false);
    expect(kit.has('--surface')).toBe(true);
  });
});
