/**
 * T412 (generator part) — contract C4-5.
 *
 * `src/theme/generated/theme.css` is a pure function of the palette and the variable map
 * in `scripts/theme-css.js`. Two failures this guards against:
 *
 *   1. A stale file: the palette is retuned, nobody regenerates, and the kit renders
 *      colours the gate never measured. The committed file must equal the generator's
 *      output.
 *   2. A theme missing a variable another theme defines: the kit and Uniwind require
 *      identical variable sets, and a missing one falls back silently in production.
 *
 * It also pins the one non-colour override the file carries: the kit ships
 * `--field-border-width: 0px`, so its fields have no boundary, and the kit reads that
 * variable in its own `@theme inline static` block. Left alone, the field border that
 * FR-024 requires would never be drawn.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PaletteNames, Palettes, type Palette, type PaletteName } from '@/theme/palette';

import { buildThemeCss } from '../../scripts/theme-css';
import {
  DECORATIVE_GENERATED_VARIABLES,
  DECORATIVE_PALETTE_KEYS,
  SHARED_NON_COLOUR_VARIABLES,
} from './gate-exemptions';
import { buildPairs, coveredKeys } from './palette-gate-support';

const CSS_PATH = path.resolve(__dirname, '../../src/theme/generated/theme.css');

/** Every HeroUI Native variable, and where the palette supplies it. Written out in full. */
const KIT_COLOUR_VARIABLES: Record<string, keyof Palette> = {
  '--background': 'canvas',
  '--foreground': 'ink',
  '--surface': 'surface',
  '--surface-foreground': 'ink',
  '--surface-secondary': 'surfaceSecondary',
  '--surface-secondary-foreground': 'ink',
  '--surface-tertiary': 'surfaceTertiary',
  '--surface-tertiary-foreground': 'ink',
  '--overlay': 'overlay',
  '--overlay-foreground': 'ink',
  '--backdrop': 'backdrop',
  '--muted': 'muted',
  '--default': 'surfaceSecondary',
  '--default-foreground': 'ink',
  '--accent': 'accent',
  '--accent-foreground': 'accentInk',
  '--field-background': 'surfaceSecondary',
  '--field-foreground': 'ink',
  '--field-placeholder': 'placeholder',
  '--field-border': 'border',
  '--success': 'success',
  '--success-foreground': 'successInk',
  '--warning': 'warning',
  '--warning-foreground': 'warningInk',
  '--danger': 'danger',
  '--danger-foreground': 'dangerInk',
  '--segment': 'overlay',
  '--segment-foreground': 'ink',
  '--border': 'border',
  '--separator': 'separator',
  '--focus': 'focus',
  '--link': 'link',
};

/** The app's own variables, and the Tailwind colour each is exposed as. */
const APP_VARIABLES: Record<string, { key: keyof Palette; colour: string }> = {
  '--status-planning': { key: 'statusPlanning', colour: '--color-status-planning' },
  '--status-planning-ink': {
    key: 'statusPlanningInk',
    colour: '--color-status-planning-ink',
  },
  '--status-active': { key: 'statusActive', colour: '--color-status-active' },
  '--status-past': { key: 'statusPast', colour: '--color-status-past' },
  '--pending': { key: 'pending', colour: '--color-pending' },
};

const SHADOWS = DECORATIVE_GENERATED_VARIABLES as readonly string[];

const SHARED = SHARED_NON_COLOUR_VARIABLES as readonly string[];

const REQUIRED_VARIABLES = [
  ...Object.keys(KIT_COLOUR_VARIABLES),
  ...SHADOWS,
  ...Object.keys(APP_VARIABLES),
].sort();

const NO_SHADOW = '0 0 0 0 transparent inset';

/** The file carries hex lowercase (Prettier's form); the palette keeps it uppercase. */
const lowercase = (hex: string) => hex.toLowerCase();

function committedCss(): string {
  // The repository stores LF; a Windows checkout with autocrlf must not fail the gate.
  return readFileSync(CSS_PATH, 'utf8').replace(/\r\n/g, '\n');
}

/** The variables of the plain, non-themed `@theme { ... }` block (shared by all themes). */
function parseSharedTheme(css: string): Record<string, string> {
  const block = /^@theme \{([\s\S]*?)\n\}/m.exec(css);
  const variables: Record<string, string> = {};
  for (const [, variable, value] of (block?.[1] ?? '').matchAll(
    /(--[a-z0-9-]+):\s*([^;]*);/g,
  )) {
    variables[variable] = value.trim();
  }
  return variables;
}

/** Variables per `@variant` block, in file order. */
function parseThemes(css: string): Record<string, Record<string, string>> {
  const themes: Record<string, Record<string, string>> = {};
  const block = /@variant ([a-z-]+) \{([\s\S]*?)\n {4}\}/g;
  for (const [, name, body] of css.matchAll(block)) {
    const variables: Record<string, string> = {};
    for (const [, variable, value] of body.matchAll(/(--[a-z0-9-]+):\s*([^;]*);/g)) {
      variables[variable] = value.replace(/\s+/g, ' ').trim();
    }
    themes[name] = variables;
  }
  return themes;
}

describe('buildThemeCss', () => {
  test('is pure: the same palette gives the same stylesheet', () => {
    expect(buildThemeCss(Palettes)).toBe(buildThemeCss(Palettes));
  });

  test('does not mutate the palette it is given', () => {
    const copy = JSON.parse(JSON.stringify(Palettes));
    buildThemeCss(copy);
    expect(copy).toEqual(JSON.parse(JSON.stringify(Palettes)));
  });

  test('opens with the generated-file header', () => {
    expect(buildThemeCss(Palettes)).toMatch(
      /^\/\* GENERATED by scripts\/build-theme-css\.mjs - do not edit/,
    );
  });

  test('writes LF line endings and ends with a newline', () => {
    const css = buildThemeCss(Palettes);
    expect(css).not.toContain('\r');
    expect(css.endsWith('\n')).toBe(true);
  });

  test('puts every theme under @layer theme > :root > @variant, in palette order', () => {
    const css = buildThemeCss(Palettes);
    expect(css).toContain('@layer theme {\n  :root {\n    @variant light {');
    const order = [...css.matchAll(/@variant ([a-z-]+) \{/g)].map((m) => m[1]);
    expect(order).toEqual([...PaletteNames]);
  });

  test('a changed palette value reaches exactly the variables mapped from it', () => {
    const changed = {
      ...Palettes,
      dark: { ...Palettes.dark, accentInk: '#123456' },
    };
    const themes = parseThemes(buildThemeCss(changed));
    expect(themes.dark['--accent-foreground']).toBe('#123456');
    expect(themes.light['--accent-foreground']).toBe(lowercase(Palettes.light.accentInk));
  });

  test('fails loudly, naming the theme and key, when a palette lacks a key', () => {
    const { focus: _focus, ...withoutFocus } = Palettes['dark-contrast'];
    expect(() =>
      buildThemeCss({ ...Palettes, 'dark-contrast': withoutFocus } as never),
    ).toThrow(/dark-contrast.*focus/);
  });

  test('refuses a value that is not a hex colour, so no CSS can be injected', () => {
    const bad = { ...Palettes, dark: { ...Palettes.dark, accent: 'red; }' } };
    expect(() => buildThemeCss(bad)).toThrow(/dark.*accent.*hex/);
  });

  test('keeps hex lowercase, the form Prettier writes, so format:check passes', () => {
    expect(buildThemeCss(Palettes)).not.toMatch(/#[0-9a-f]*[A-F][0-9a-fA-F]*;/);
  });

  test('derives the themes from the palette data, in data order', () => {
    const extended = { ...Palettes, sepia: { ...Palettes.light } };
    const names = [...buildThemeCss(extended).matchAll(/@variant ([a-z-]+) \{/g)].map(
      (m) => m[1],
    );
    expect(names).toEqual([...Object.keys(Palettes), 'sepia']);
  });

  test('a theme removed from the data is removed from the stylesheet', () => {
    const { dark: _dark, ...withoutDark } = Palettes;
    const names = [...buildThemeCss(withoutDark).matchAll(/@variant ([a-z-]+) \{/g)].map(
      (m) => m[1],
    );
    expect(names).toEqual(['light', 'light-contrast', 'dark-contrast']);
  });

  test('refuses palettes that hold no theme', () => {
    expect(() => buildThemeCss({})).toThrow(/no theme/i);
  });

  test('refuses a theme name that is not a safe CSS identifier', () => {
    const bad = { ...Palettes, 'x { } @import "evil"; y': Palettes.light };
    expect(() => buildThemeCss(bad as never)).toThrow(/theme name/i);
  });

  test('only the backdrop may carry an alpha channel (8-digit hex)', () => {
    const withAlpha = { ...Palettes, dark: { ...Palettes.dark, ink: '#F4F1ECCC' } };
    expect(() => buildThemeCss(withAlpha)).toThrow(/dark.*ink.*hex/);
    const translucent = {
      ...Palettes,
      dark: { ...Palettes.dark, backdrop: '#04080E99' },
    };
    expect(() => buildThemeCss(translucent)).not.toThrow();
    expect(parseThemes(buildThemeCss(translucent)).dark['--backdrop']).toBe('#04080e99');
  });

  test('refuses an 8-digit hex on every non-backdrop key, not just ink', () => {
    for (const key of Object.keys(Palettes.dark) as (keyof Palette)[]) {
      if (key === 'backdrop') continue;
      const bad = { ...Palettes, dark: { ...Palettes.dark, [key]: '#11223344' } };
      expect(() => buildThemeCss(bad)).toThrow(new RegExp(`dark.*${key}.*hex`));
    }
  });

  test('declares the shared field border width once, outside every theme', () => {
    const declarations = buildThemeCss(Palettes).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations.match(/--field-border-width:/g)).toHaveLength(1);
  });
});

describe('generated/theme.css — contract C4-5', () => {
  test('equals what the generator produces from the palette (not stale)', () => {
    expect(committedCss()).toBe(buildThemeCss(Palettes));
  });

  test('defines every theme in the palette data, and no other', () => {
    expect(Object.keys(parseThemes(committedCss()))).toEqual(Object.keys(Palettes));
    expect(Object.keys(Palettes)).toEqual([...PaletteNames]);
  });

  describe('the kit field border width override', () => {
    test("is declared in the shared @theme block, in the kit's own form", () => {
      expect(Object.keys(parseSharedTheme(committedCss()))).toEqual([...SHARED]);
    });

    test('is a visible width, not the kit default of 0 / 0px', () => {
      const width = parseSharedTheme(committedCss())['--field-border-width'];
      expect(width).toBeDefined();
      expect(width).not.toMatch(/^0(px)?$/);
      expect(width).toMatch(/^[1-9][0-9]*(\.[0-9]+)?px$/);
      expect(width).toBe('1px');
    });

    test('is not repeated inside a theme, so no theme can switch it back off', () => {
      for (const variables of Object.values(parseThemes(committedCss()))) {
        expect(Object.keys(variables)).not.toContain('--field-border-width');
      }
    });
  });

  test.each(PaletteNames)('%s defines exactly the required variable set', (name) => {
    const defined = Object.keys(parseThemes(committedCss())[name]).sort();
    expect(defined).toEqual(REQUIRED_VARIABLES);
  });

  test('every theme defines the identical variable set (kit and Uniwind require it)', () => {
    const themes = parseThemes(committedCss());
    const [first, ...rest] = PaletteNames.map((name) => Object.keys(themes[name]).sort());
    for (const other of rest) expect(other).toEqual(first);
  });

  test.each(PaletteNames)(
    '%s maps each kit colour variable from its palette key',
    (name) => {
      const variables = parseThemes(committedCss())[name];
      const wrong = Object.entries(KIT_COLOUR_VARIABLES)
        .filter(
          ([variable, key]) => variables[variable] !== lowercase(Palettes[name][key]),
        )
        .map(([variable]) => variable);
      expect(wrong).toEqual([]);
    },
  );

  test.each(PaletteNames)('%s defines the app status and pending variables', (name) => {
    const variables = parseThemes(committedCss())[name];
    for (const [variable, { key }] of Object.entries(APP_VARIABLES)) {
      expect({ variable, value: variables[variable] }).toEqual({
        variable,
        value: lowercase(Palettes[name][key]),
      });
    }
  });

  test('exposes the app variables to Tailwind in an @theme inline static block', () => {
    // The kit's own form (heroui-native/src/styles/theme.css): inline, so the utility
    // reads the variable the active theme sets, and static, so it is always emitted.
    const css = committedCss();
    const inline = css.slice(css.indexOf('@theme inline static {'));
    expect(inline.startsWith('@theme inline static {')).toBe(true);
    expect(css).not.toMatch(/@theme inline \{/);
    for (const [variable, { colour }] of Object.entries(APP_VARIABLES)) {
      expect(inline).toContain(`${colour}: var(${variable});`);
    }
  });

  test('holds no colour that is not a palette value or a derived shadow', () => {
    const themes = parseThemes(committedCss());
    for (const name of PaletteNames) {
      const allowed = new Set<string>(Object.values(Palettes[name]).map(lowercase));
      const unknown = Object.entries(themes[name])
        .filter(([variable]) => !SHADOWS.includes(variable))
        .filter(([, value]) => !allowed.has(value))
        .map(([variable]) => `${name} ${variable}`);
      expect(unknown).toEqual([]);
    }
  });

  describe('every generated variable is classified (gate-exemptions.ts)', () => {
    const decorativeKeys = new Set<string>(DECORATIVE_PALETTE_KEYS);
    const mapped: Record<string, keyof Palette> = {
      ...KIT_COLOUR_VARIABLES,
      ...Object.fromEntries(
        Object.entries(APP_VARIABLES).map(([variable, { key }]) => [variable, key]),
      ),
    };

    test.each(PaletteNames)(
      '%s: each colour variable maps to a palette key the gate measures or allowlists',
      (name) => {
        const measured = coveredKeys(buildPairs(Palettes[name], name));
        const unclassified = Object.entries(mapped)
          .filter(([, key]) => !measured.has(key) && !decorativeKeys.has(key))
          .map(([variable]) => variable);
        expect(unclassified).toEqual([]);
      },
    );

    test.each(PaletteNames)(
      '%s: every variable in the file is a mapped colour, a named shadow or a named shared variable',
      (name) => {
        const defined = Object.keys(parseThemes(committedCss())[name]);
        const known = new Set<string>([...Object.keys(mapped), ...SHADOWS]);
        expect(defined.filter((variable) => !known.has(variable))).toEqual([]);
        const shared = Object.keys(parseSharedTheme(committedCss()));
        expect(shared.filter((variable) => !SHARED.includes(variable))).toEqual([]);
      },
    );
  });

  describe('shadows (research D4-11)', () => {
    const shadowsOf = (name: PaletteName) => {
      const variables = parseThemes(committedCss())[name];
      return SHADOWS.map((variable) => variables[variable]);
    };

    test('the light theme has very soft shadows on surfaces and overlays', () => {
      const [surface, overlay] = shadowsOf('light');
      for (const shadow of [surface, overlay]) {
        expect(shadow).not.toContain('transparent');
        const alphas = [...shadow.matchAll(/rgba\([^)]*,\s*([0-9.]+)\)/g)].map((m) =>
          Number(m[1]),
        );
        expect(alphas.length).toBeGreaterThan(0);
        expect(Math.max(...alphas)).toBeLessThanOrEqual(0.08);
      }
    });

    test.each(['dark', 'light-contrast', 'dark-contrast'] as const)(
      '%s has no shadow at all',
      (name) => {
        for (const shadow of shadowsOf(name)) expect(shadow).toBe(NO_SHADOW);
      },
    );

    test('fields never carry a shadow, in any theme', () => {
      for (const name of PaletteNames) expect(shadowsOf(name)[2]).toBe(NO_SHADOW);
    });

    test('the soft shadows are tinted with the theme ink, not a literal black', () => {
      const [r, g, b] = [1, 3, 5].map((i) =>
        parseInt(Palettes.light.ink.slice(i, i + 2), 16),
      );
      expect(shadowsOf('light')[0]).toContain(`rgba(${r}, ${g}, ${b},`);
    });
  });
});
