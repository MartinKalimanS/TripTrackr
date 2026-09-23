// @ts-check
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');

/**
 * Contracts lint configuration — ESLint 9 flat config.
 *
 * Type-aware rules are on: a contract that silently widens to `any` is a
 * contract that no longer constrains either side of the wire.
 */
module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'eslint.config.js',
      'jest.config.js',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },
);
