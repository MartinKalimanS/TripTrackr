// @ts-check
/**
 * Four projects, because they have different costs and different meanings:
 *   unit        — fast, no I/O
 *   contract    — HTTP surface obligations from contracts/rest-api.md
 *   integration — real PostgreSQL + PostGIS via Testcontainers
 *   privacy     — the adversarial suite; a REQUIRED CI job (Constitution III)
 *
 * Integration and privacy share the Testcontainers harness. A mocked database
 * cannot evaluate an RLS policy, so neither suite is permitted to mock one.
 */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Contracts are consumed from source under Jest so no suite depends on a
    // prior `build` of packages/contracts.
    '^@triptrackr/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
  // tsconfig.spec.json, not tsconfig.json. The build config roots at ./src so
  // that `dist/main.js` stays where package.json expects it; the test config
  // roots at the repository so a spec and the source it imports can share one
  // program. Pointing ts-jest at the build config makes TypeScript infer a root
  // of ./test and fail (TS5011).
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
};

const withDatabase = {
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',
};

/** @type {import('jest').Config} */
const config = {
  // Global, not per project: Jest 30 rejects `testTimeout` inside a project
  // config with a validation warning on every run. Generous because the three
  // database projects pull and start a PostGIS container in globalSetup; the
  // unit project never comes near it.
  testTimeout: 120_000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/test/unit/**/*.spec.ts'] },
    {
      ...base,
      ...withDatabase,
      displayName: 'contract',
      testMatch: ['<rootDir>/test/contract/**/*.spec.ts'],
    },
    {
      ...base,
      ...withDatabase,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
    },
    {
      ...base,
      ...withDatabase,
      displayName: 'privacy',
      testMatch: ['<rootDir>/test/privacy/**/*.spec.ts'],
    },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  // Constitution III: 80% floor. Below it, the build fails — it does not warn.
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};

module.exports = config;
