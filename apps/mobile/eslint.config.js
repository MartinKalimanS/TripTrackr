// @ts-check
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

/**
 * A colour written inside the square brackets of a utility class: a hex literal
 * (`#fff`, `#a1b2c3d4`) or a colour function (`rgb(`, `hsl(`, `oklch(`,
 * `color-mix(`, ...) anywhere in the brackets, so `bg-[#fff]`, `text-[rgb(1,2,3)]`,
 * `shadow-[0_0_0_1px_#fff]` and `border-[1px_solid_#fff]` are all caught. A function
 * name may follow an underscore (a space in a utility), but not a letter or hyphen
 * (`my-rgb(`).
 */
const COLOUR_TOKEN = String.raw`(?:#[0-9a-fA-F]{3,8}\b|(?<![A-Za-z0-9-])(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch|color|color-mix)\()`;

/**
 * What makes the brackets a utility's and not prose ("Ticket [#123]"): they follow
 * a utility name (`bg-[`, `hover:bg-[`), or they hold an arbitrary property
 * (`[color:#fff]`, `hover:[--brand:#f00]`). `bg-[var(--x)]` and `rounded-[12px]`
 * hold no colour token and pass.
 *
 * This is the source of a regular expression used in two `no-restricted-syntax`
 * selectors, so it holds no slash (an esquery regex ends at the next one).
 */
const ARBITRARY_COLOUR_CLASS = String.raw`(?:[\w:-]+-\[|(?:^|[\s:])\[[\w-]+:)[^\]]*${COLOUR_TOKEN}[^\]]*\]`;

const RAW_COLOUR_MESSAGE =
  'Raw colour literal. A colour comes from the token layer: import the token from @/constants/theme or use a semantic class such as bg-background (specs/004-app-ui-redesign/contracts/design-tokens.md, C4-1).';

const ARBITRARY_COLOUR_MESSAGE =
  'Arbitrary-value colour class. A colour comes from the token layer, never from a utility such as bg-[#fff] or text-[rgb(1,2,3)]: add it to the palette and use its semantic class (specs/004-app-ui-redesign/contracts/design-tokens.md, C4-1).';

/**
 * A gradient written as a CSS function (feature 005, contract C5-1): `linear-gradient(`,
 * `radial-gradient(`, `conic-gradient(` and their `repeating-` forms. Like the colour class
 * source above it holds no slash (an esquery regex ends at the next one).
 */
const GRADIENT_FUNCTION = String.raw`(?:repeating-)?(?:linear|radial|conic)-gradient\(`;

const GRADIENT_MESSAGE =
  'Gradient string. A gradient is data in src/theme/scrim.ts and is drawn by src/components/ui/scrim.tsx only: no gradient string or stop outside them (specs/005-sunrise-passport-ui/contracts/design-tokens.md, C5-1).';

/**
 * The selectors that reject a raw colour, a colour in a utility class and a gradient. They
 * are built as arrays because ESLint does not merge the options of one rule across config
 * objects: every selector for a set of files lives in ONE `no-restricted-syntax` array.
 */
const COLOUR_SELECTORS = [
  {
    selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
    message: RAW_COLOUR_MESSAGE,
  },
  {
    selector: 'Literal[value=/^(?:rgba?|hsla?)\\(/]',
    message: RAW_COLOUR_MESSAGE,
  },
  // Feature 004, contract C4-1: the same colours written as a Tailwind or Uniwind
  // arbitrary value (`bg-[#fff]`, `text-[rgb(1,2,3)]`), in a plain string or in the text of
  // a template literal.
  {
    selector: `Literal[value=/${ARBITRARY_COLOUR_CLASS}/]`,
    message: ARBITRARY_COLOUR_MESSAGE,
  },
  {
    selector: `TemplateElement[value.cooked=/${ARBITRARY_COLOUR_CLASS}/]`,
    message: ARBITRARY_COLOUR_MESSAGE,
  },
];

const GRADIENT_SELECTORS = [
  {
    selector: `Literal[value=/${GRADIENT_FUNCTION}/]`,
    message: GRADIENT_MESSAGE,
  },
  {
    selector: `TemplateElement[value.cooked=/${GRADIENT_FUNCTION}/]`,
    message: GRADIENT_MESSAGE,
  },
];

/** The UI kit and its styling layer, subpaths included (gitignore-style groups). */
const KIT_PACKAGES = ['heroui-native', 'heroui-native/**', 'uniwind', 'uniwind/**'];

/**
 * Mobile (Expo) lint configuration — ESLint 9 flat config.
 *
 * `eslint-config-prettier` is last so formatting rules are surrendered to
 * Prettier; ESLint here is about correctness, not whitespace.
 */
module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '.expo/',
      'coverage/',
      'android/',
      'ios/',
      'src/db/migrations/',
      '*.min.js',
    ],
  },
  {
    // Contract C4-1 (specs/004-app-ui-redesign/contracts/design-tokens.md): the token
    // layer is the only source of visual values. A colour written inline in a
    // screen or component is the one-off value FR-036 forbids — it escapes the
    // contrast gate in test/theme/contrast-gate.test.ts, which can only measure
    // pairs it knows about.
    files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
    // Tests are exempt: they legitimately use arbitrary colours as fixtures
    // (asserting a prop is NOT forwarded, for instance). The rule protects
    // production styling, and a fixture cannot leak into the rendered app.
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      // ESLint does not merge the options of one rule across config objects, so
      // every selector for these files lives in this one array.
      'no-restricted-syntax': ['error', ...COLOUR_SELECTORS, ...GRADIENT_SELECTORS],
    },
  },
  {
    // Feature 005, contract C5-1: the one consumer of a gradient is the Scrim adapter, which
    // reads the stops from `src/theme/scrim.ts`. It is exempt from the gradient rule and
    // from nothing else: it still may not write a raw colour.
    files: ['src/components/ui/scrim.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...COLOUR_SELECTORS],
    },
  },
  {
    // Feature 005, contract C5-1: a gradient string is rejected in EVERY folder of `src/`,
    // not only the two above; the token layer (`src/theme/`, where the stops are data) and
    // tests (fixtures) are exempt. These files carry no colour rule: a colour literal outside
    // `src/app` and `src/components` is the token layer's own business (C4-1).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/app/**', 'src/components/**', 'src/theme/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...GRADIENT_SELECTORS],
    },
  },
  {
    // Feature 004, contract C4-6: the UI kit is reachable only through the
    // adapters in `src/components/ui/`. Everything else in `src/` composes those
    // adapters, so a screen cannot come to depend on the kit directly.
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: KIT_PACKAGES,
              message:
                'Import UI primitives from @/components/ui/*, not from the kit: only src/components/ui/**, tests, src/app/_layout.tsx and src/hooks/use-appearance.ts may import heroui-native or uniwind (specs/004-app-ui-redesign/contracts/components.md, C4-6).',
            },
          ],
        },
      ],
    },
  },
  {
    // The places allowed to import the kit: the adapters themselves, tests (they
    // render the kit's components or assert on them), the root layout (which
    // mounts `HeroUINativeProvider`) and the appearance hook (which calls
    // `Uniwind.setTheme`).
    files: [
      'src/components/ui/**/*.{ts,tsx}',
      '**/*.test.{ts,tsx}',
      'test/**/*.{ts,tsx}',
      'src/app/_layout.tsx',
      'src/hooks/use-appearance.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // `jest.mock` factories are hoisted above imports, so they can only reach a
    // module through `require`. This is a constraint of Jest, not a style choice.
    // Inline components returned from those factories are stand-ins, not real
    // components, so a display name adds noise without adding information.
    files: ['jest.setup.ts', 'jest.config.js', '**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'react/display-name': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // A forgotten debug statement is a defect, not a style preference
      // (code-review.md: "No console.log or debug statements").
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]);
