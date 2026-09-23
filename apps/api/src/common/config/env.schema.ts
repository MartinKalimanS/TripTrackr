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

  // PostgreSQL + PostGIS. The API connects as a non-superuser role (T023) so that
  // RLS is enforced against it rather than bypassed.
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

let cached: Env | undefined;

/**
 * Parses and caches process.env. Throws with every offending variable listed at once
 * — a boot that fails should say everything that is wrong, not the first thing.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Environment validation failed. The API will not start.\n${problems}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/** Test-only: clears the memoised environment between cases. */
export function resetEnvCache(): void {
  cached = undefined;
}
