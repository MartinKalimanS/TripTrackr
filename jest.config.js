/**
 * Mobile test configuration.
 *
 * `jest-expo` supplies the React Native transform, module mocks, and asset
 * handling; without it, importing anything from `expo-*` fails at parse time
 * because those packages ship untranspiled ESM.
 *
 * The 80% floor is the Constitution's, not a suggestion (Constitution III).
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Listed before the alias: `@/global.css` must resolve to the stub, not to a
    // file Jest would then try to parse as JavaScript.
    '\.(css)$': '<rootDir>/test/style-stub.js',
    // Mirrors tsconfig.json `paths`: `@/assets/*` resolves to the project-root
    // assets directory, NOT to src/assets. Listed before the general alias
    // because moduleNameMapper takes the first match, and the general rule
    // would otherwise swallow it and fail to resolve any image.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/test/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/server/',
    '<rootDir>/e2e/',
  ],
  // `standard-navigation` is an ESM-only transitive dependency of expo-router.
  // Without it in this allowlist, importing expo-router throws "Cannot use
  // import statement outside a module" from
  // node_modules/standard-navigation/lib/src/index.js — which surfaces as a
  // confusing failure pointing at expo-router's own source, not at the real
  // culprit. Any file importing expo-router is untestable until it is listed.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@rnmapbox/maps|react-native-purchases|expo-router|standard-navigation))',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/db/migrations/**',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
