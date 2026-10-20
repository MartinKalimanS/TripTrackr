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
    // A stylesheet (`import '@/global.css'`) is Metro's and Uniwind's business; under
    // Jest it is an empty module. FIRST, because the `@/` alias below would
    // otherwise resolve `@/global.css` to the real file, which no transform reads.
    '\\.css$': '<rootDir>/test/stubs/css-stub.js',
    // Phosphor ships 1,500 icons behind one barrel; an icon is imported by its deep path
    // (`phosphor-react-native/src/icons/<Name>`, research D5-07), which this anchored rule
    // does not match. The bare package throws, with the reason, instead of loading them all.
    '^phosphor-react-native$': '<rootDir>/test/stubs/phosphor-barrel.js',
    // `expo-router/testing-library` replaces Reanimated with the module it finds at this path
    // (its `mocks.js`: `require('react-native-reanimated/mock')`, and `{}` when that cannot
    // load, which it cannot without the worklets runtime). The app's own stand-in answers
    // instead, so a router tree with the tab pill (a Reanimated capsule) renders. The library's
    // real mock stays reachable as `react-native-reanimated/mock.js` (`test/mocks/reanimated-full.ts`).
    '^react-native-reanimated/mock$': '<rootDir>/test/mocks/reanimated-app.ts',
    // Mirrors tsconfig.json `paths`: `@/assets/*` resolves to the project-root
    // assets directory, NOT to src/assets. Listed before the general alias
    // because moduleNameMapper takes the first match, and the general rule
    // would otherwise swallow it and fail to resolve any image.
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // The shared contracts package is consumed from source under Jest, exactly
    // as Metro consumes it, so tests never depend on a prior `build`.
    '^@triptrackr/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/test/**/*.test.{ts,tsx}'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  // The first render in a suite pays for Babel-transforming every React Native
  // and Expo module it touches; on a cold cache that alone can exceed Jest's
  // 5 s default and fail a test that has nothing wrong with it. The tests
  // themselves are fast — this only stops a slow disk from being reported as
  // a product defect.
  testTimeout: 20000,
  // `standard-navigation` is an ESM-only transitive dependency of expo-router.
  // Without it in this allowlist, importing expo-router throws "Cannot use
  // import statement outside a module" from
  // node_modules/standard-navigation/lib/src/index.js — which surfaces as a
  // confusing failure pointing at expo-router's own source, not at the real
  // culprit. Any file importing expo-router is untestable until it is listed.
  //
  // Feature 004 adds the kit and what it runs on. `heroui-native`, `uniwind`,
  // `tailwind-variants` and `tailwind-merge` ship untranspiled ESM or TypeScript
  // source (Metro resolves their `react-native` export condition). The
  // `react-native-*` and `expo-*` peers are already caught by the prefix rules
  // above; they are listed so the requirement stays visible and survives a
  // narrowing of those rules.
  //
  // Feature 005 (T503): `phosphor-react-native` is the one that needs the entry. Its
  // `exports` map serves each icon as TypeScript source (`./src/icons/*` to
  // `./src/icons/*.tsx`), which Babel must transform; the three others are stood in by
  // `test/mocks/*` and are listed for visibility, like the peers above.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@rnmapbox/maps|react-native-purchases|expo-router|standard-navigation|heroui-native|uniwind|tailwind-variants|tailwind-merge|react-native-reanimated|react-native-worklets|react-native-gesture-handler|react-native-safe-area-context|react-native-keyboard-controller|expo-blur|expo-haptics|expo-glass-effect|react-native-view-shot|react-native-zoom-toolkit|phosphor-react-native))',
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
