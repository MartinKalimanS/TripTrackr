// @ts-check
const tseslint = require('typescript-eslint');
const prettierConfig = require('eslint-config-prettier');

/**
 * API lint configuration — ESLint 9 flat config.
 *
 * Type-aware linting is on deliberately: the rules that matter most here
 * (floating promises, unsafe `any` flowing into a query) cannot be detected
 * without the type checker, and a dropped promise in a request handler is the
 * shape of bug that silently loses a traveller's data.
 */
module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'coverage/',
      'src/db/migrations/',
      'eslint.config.js',
      'jest.config.ts',
      'drizzle.config.ts',
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
      // Nest's DI container instantiates providers it never `new`s explicitly.
      '@typescript-eslint/no-extraneous-class': 'off',
      // A dropped promise in a controller is a silently lost write.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // FR-072: error responses must not leak internals — that starts with not
      // printing them to stdout in production either.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests assert against loosely typed fixtures and raw SQL rows.
    files: ['test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        // Pinned to tsconfig.spec.json rather than left to `projectService`.
        // The service resolves the nearest tsconfig.json, which excludes
        // `test/**/*` so that the build roots at ./src and `dist/main.js` lands
        // where package.json expects it. Every spec then fails to parse — and
        // because it fails at parse time, the type-aware rules do not report
        // anything weaker, they report nothing at all.
        projectService: false,
        project: ['./tsconfig.spec.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
