/**
 * Babel — `babel-preset-expo` plus the one plugin the local database needs.
 *
 * `inline-import` turns `import m0000 from './0000_x.sql'` into the file's
 * contents as a string, which is how Drizzle's generated `migrations.js` ships
 * the SQL inside the app bundle (https://orm.drizzle.team/docs/connect-expo-sqlite).
 * Jest uses this file too (babel-jest via jest-expo), so the same migrations
 * run against the test database in test/db/.
 *
 * The React Compiler is enabled through `experiments.reactCompiler` in
 * app.config.ts; babel-preset-expo picks that up on its own in SDK 54+
 * (https://docs.expo.dev/guides/react-compiler.md), so nothing is added here.
 */
module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
