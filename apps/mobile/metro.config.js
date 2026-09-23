const { getSentryExpoConfig } = require('@sentry/react-native/metro');

/**
 * Sentry's Metro wrapper replaces the default serializer so that a Debug ID is
 * embedded in each bundle. Without it, uploaded source maps cannot be matched to
 * a crashing bundle and every stack trace arrives minified (FR-073).
 */
const config = getSentryExpoConfig(__dirname);

/**
 * Keep test files out of the app bundle.
 *
 * expo-router treats EVERY file under `src/app/` as a route, so a colocated
 * `*.test.tsx` there is bundled as though it were a screen. That drags the
 * testing library — and through it Node built-ins such as `console` — into the
 * native runtime, and the build fails with "the native React runtime does not
 * include the Node standard library".
 *
 * Tests for routes therefore live in `test/app/`. This block list is the guard
 * that stops the mistake recurring anywhere in the tree.
 */
const TEST_FILE_PATTERN = /.*\.(test|spec)\.(ts|tsx|js|jsx)$/;

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = existingBlockList
  ? // Merge rather than clobber: the Expo/Sentry defaults exclude things this
    // project still needs excluded.
    new RegExp(
      `(${[]
        .concat(existingBlockList)
        .map((pattern) => pattern.source)
        .join('|')}|${TEST_FILE_PATTERN.source})`,
    )
  : TEST_FILE_PATTERN;

module.exports = config;
