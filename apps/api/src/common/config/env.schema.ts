import { z } from 'zod';

/**
 * Constitution, Technology & Platform Constraints:
 * "Required secrets MUST be validated as present at startup rather than failing
 * obscurely at first use."
 *
 * Every variable the API needs is declared here. `loadEnv()` is called before the
 * Nest application is created, so a missing secret stops the process at boot with a
 * readable list rather than surfacing as a 500 on the first request that needs it.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  // PostgreSQL + PostGIS — the API-role connection string (research D-20,
  // contracts/data-access-policy.md §1 "Deployment obligation").
  //
  // DATABASE_URL names `triptrackr_api`: non-superuser, owns nothing,
  // NOBYPASSRLS (0003_api_role.sql). Every request the API and the worker make
  // runs as this role, which is what makes the policies in 0005 real rather
  // than decorative. Pointing it at the owner leaves every policy in place and
  // silently stops enforcing them — adversarial test 17 exists for exactly that.
  //
  // The owner's URL is deliberately NOT part of this schema: the API process
  // has no legitimate use for it, and a variable the process does not declare
  // is a variable a compose file never has to hand it. See `migrationEnvSchema`.
  DATABASE_URL: z.string().url(),

  // Redis: sessions, rate limits, planner cache, BullMQ transport.
  REDIS_URL: z.string().url(),

  // Tokens.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // S3-compatible object storage. Private buckets only — never a public policy.
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('auto'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_PHOTOS: z.string().min(1),
  S3_BUCKET_DOCUMENTS: z.string().min(1),
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Envelope encryption master key for documents (FR-033, research D-04).
  // Base64-encoded 32 bytes. `DOCUMENT_MASTER_KEY_ID` names it so keys can rotate.
  DOCUMENT_MASTER_KEY: z.string().min(44),
  DOCUMENT_MASTER_KEY_ID: z.string().min(1).default('v1'),

  // The trip allowance is a business-tunable value, not a constant in code (FR-074).
  FREE_TRIP_ALLOWANCE: z.coerce.number().int().positive().default(5),

  // Tombstone grace window before hard deletion (sync-protocol.md §5).
  TOMBSTONE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // Metered external services.
  MAPBOX_ACCESS_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),

  // Planner quota (FR-069) and cache window (FR-070).
  PLANNER_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(10),
  PLANNER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

  // Billing (research D-07). Webhook secret verifies provider signatures.
  REVENUECAT_API_KEY: z.string().min(1),
  REVENUECAT_WEBHOOK_SECRET: z.string().min(1),

  // Observability (FR-073).
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * What the migration one-shot and the geography import need — and the API
 * process must never receive.
 *
 * The two identities are two schemas on purpose. Migrations run in a container
 * that has no business holding S3 credentials or the document master key, and
 * the API runs in a container that has no business holding the owner's
 * password. Splitting the declarations is what lets a compose file give each
 * service exactly its own variables, with nothing inert or borrowed.
 */
const migrationEnvSchema = z.object({
  // Names the database owner. Used by the migration runner and the geography
  // import, both of which alter the schema; never by a request path.
  MIGRATION_DATABASE_URL: z.string().url(),

  // The API role's password. Applied by the migration runner
  // (`ALTER ROLE triptrackr_api PASSWORD …`) so the role has credentials before
  // the API first connects; the API's DATABASE_URL must carry the same value.
  API_DB_PASSWORD: z.string().min(16),
});

export type MigrationEnv = z.infer<typeof migrationEnvSchema>;

let cached: Env | undefined;

/**
 * Parses and caches process.env. Throws with every offending variable listed at once
 * — a boot that fails should say everything that is wrong, not the first thing.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  cached = parseOrThrow(envSchema, source, 'The API will not start.');
  return cached;
}

/** Validates the migration runner's variables. Not memoised; it runs once. */
export function loadMigrationEnv(source: NodeJS.ProcessEnv = process.env): MigrationEnv {
  return parseOrThrow(migrationEnvSchema, source, 'Migrations will not run.');
}

function parseOrThrow<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv,
  consequence: string,
): z.infer<T> {
  const parsed = schema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Environment validation failed. ${consequence}\n${problems}`);
  }

  return parsed.data;
}

/** Test-only: clears the memoised environment between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
