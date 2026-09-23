// @ts-check
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');
const tseslint = require('typescript-eslint');

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
      'server/',
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
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            'Raw colour literal. Import the token from @/constants/theme or use a treatment from @/hooks/use-surface (contract C1).',
        },
        {
          selector:
            "Literal[value=/^(?:rgba?|hsla?)\\(/]",
          message:
            'Raw colour literal. Import the token from @/constants/theme or use a treatment from @/hooks/use-surface (contract C1).',
        },
      ],
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
