/**
 * Drizzle Kit — local (on-device) migrations, tasks.md T042.
 *
 * `driver: 'expo'` makes `drizzle-kit generate` emit, alongside the SQL files,
 * a `migrations.js` that imports each `.sql` as a string so the migrations can
 * be bundled into the binary and applied at launch with `useMigrations`
 * (https://orm.drizzle.team/docs/connect-expo-sqlite). The `.sql` import is
 * what babel.config.js (`inline-import`) and metro.config.js (`sourceExts`)
 * exist to support.
 *
 * This is the DEVICE schema. The server's migrations are hand-written SQL in
 * apps/api/src/db/migrations (research D-19) and are unrelated to this file.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
