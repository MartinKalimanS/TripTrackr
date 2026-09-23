import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit generates migrations into src/db/migrations, which is committed.
 * Constitution: "Migrations version-controlled ... Production schema MUST NEVER be
 * hand-edited." The RLS policy migrations in that directory are hand-authored SQL
 * (T024, T025) and sit alongside the generated ones.
 */
export default {
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  verbose: true,
  strict: true,
} satisfies Config;
