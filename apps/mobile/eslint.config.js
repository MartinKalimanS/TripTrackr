// @ts-check
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

/**
 * A colour as an arbitrary-value utility class: `[#fff]`, `[rgb(1,2,3)]`,
 * `[oklch(0.7 0.1 200)]`. It is the source of a regular expression used in two
 * `no-restricted-syntax` selectors, so it holds no slash (an esquery regex ends
 * at the next one).
 */
const ARBITRARY_COLOUR_CLASS =
  '\\[(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\\(.*?\\))\\]';

const ARBITRARY_COLOUR_MESSAGE =
  'Arbitrary-value colour class. A colour comes from the token layer, never from a utility such as bg-[#fff] or text-[rgb(1,2,3)]: add it to the palette and use its semantic class (specs/004-app-ui-redesign/contracts/design-tokens.md, C4-1).';

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
    // Contract C1 (specs/002-neumorphic-ui/contracts/design-tokens.md): the token
    // layer is the only source of visual values. A colour written inline in a
    // screen or component is the one-off value FR-028 forbids — it escapes the
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
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]',
          message:
            'Raw colour literal. Import the token from @/constants/theme or use a treatment from @/hooks/use-surface (contract C1).',
        },
        {
          selector: 'Literal[value=/^(?:rgba?|hsla?)\\(/]',
          message:
            'Raw colour literal. Import the token from @/constants/theme or use a treatment from @/hooks/use-surface (contract C1).',
        },
        // Feature 004, contract C4-1: the same colours written as a Tailwind or
        // Uniwind arbitrary value (`bg-[#fff]`, `text-[rgb(1,2,3)]`), in a plain
        // string or in the text of a template literal.
        {
          selector: `Literal[value=/${ARBITRARY_COLOUR_CLASS}/]`,
          message: ARBITRARY_COLOUR_MESSAGE,
        },
        {
          selector: `TemplateElement[value.cooked=/${ARBITRARY_COLOUR_CLASS}/]`,
          message: ARBITRARY_COLOUR_MESSAGE,
        },
      ],
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
