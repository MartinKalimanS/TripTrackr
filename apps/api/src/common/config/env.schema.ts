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

/**
 * `"a, b,c"` → `['a', 'b', 'c']`. An empty or blank value parses to an empty
 * list, which callers treat exactly like an absent variable: a provider with
 * no audience is a provider that is not configured.
 */
const commaSeparated = z.string().transform((value) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0),
);

/**
 * The store products the server recognises (spec 014, research D14-08, D14-09), as JSON:
 * `{ "<store product id>": { "kind": "credit" | "tier1" | "unlimited", "step": 1 | 2 | 3 } }`.
 * A credit has no ladder step; a subscription must name the step of the price ladder it sits on.
 * Unset or blank parses to an empty map, which means no product is recognised yet.
 */
const BillingProduct = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('credit') }),
  z.strictObject({
    kind: z.enum(['tier1', 'unlimited']),
    step: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
]);

const billingProducts = z
  .string()
  .transform((value, ctx) => {
    if (value.trim() === '') return {};
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be valid JSON' });
      return z.NEVER;
    }
  })
  .pipe(z.record(z.string().min(1), BillingProduct));

/** `BILLING_ENFORCED` is on only for the literal "true"; anything else but "false" or unset is an error. */
const switchValue = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
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
    // The host signed URLs are issued for, when devices reach the store by a
    // different address than the API does (research D-31). Unset in production.
    S3_PUBLIC_ENDPOINT: z.string().url().optional(),
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

    // The paid trip allowance (spec 014): every number is configuration, not a constant in code
    // (FR-001, FR-013). Charging is off until the owner switches it on (FR-026, research D14-06).
    FREE_TRIP_ALLOWANCE: z.coerce.number().int().positive().default(3),
    TIER1_YEARLY_TRIPS: z.coerce.number().int().positive().default(10),
    BILLING_ENFORCED: switchValue.default(false),
    BILLING_PRODUCTS: billingProducts.default({}),

    // Tombstone grace window before hard deletion (sync-protocol.md §5).
    TOMBSTONE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

    // Metered external services.
    MAPBOX_ACCESS_TOKEN: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    RESEND_API_KEY: z.string().min(1),

    // Transactional email (T056). `EMAIL_FROM` is the envelope sender Resend is
    // asked to use; `APP_PUBLIC_URL` is where the verification and reset links
    // point — a web origin, because a `triptrackr://` link in an email client
    // is dead on a device without the app, and universal links map the origin
    // to the app where it is installed.
    EMAIL_FROM: z.string().min(3).default('TripTrackr <no-reply@triptrackr.app>'),
    APP_PUBLIC_URL: z.string().url().default('https://triptrackr.app'),

    // OAuth audiences (FR-002). Comma-separated client ids: one per platform for
    // Google, the app's bundle id (and any Services ID) for Apple. Optional on
    // purpose — a deployment without a provider configured refuses that
    // provider's tokens with 503 OAUTH_PROVIDER_UNAVAILABLE rather than
    // accepting a token it could not have checked against any audience.
    GOOGLE_OAUTH_CLIENT_IDS: commaSeparated.optional(),
    APPLE_OAUTH_CLIENT_IDS: commaSeparated.optional(),

    // Planner quota (FR-069) and cache window (FR-070).
    PLANNER_DAILY_REQUEST_LIMIT: z.coerce.number().int().positive().default(10),
    PLANNER_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86400),

    // FX rates (FR-021; research D-10, D-28). One USD-based snapshot a day is
    // pulled from FX_RATES_URL into `fx_rates`; FX_RATES_SOURCE is the attribution
    // the default feed's terms require, shown with every spending summary.
    FX_RATES_URL: z.string().url().default('https://open.er-api.com/v6/latest/USD'),
    FX_RATES_SOURCE: z.string().min(1).default('https://www.exchangerate-api.com'),

    // Billing (research D-07). Webhook secret verifies provider signatures.
    REVENUECAT_API_KEY: z.string().min(1),
    REVENUECAT_WEBHOOK_SECRET: z.string().min(1),

    // Observability (FR-073).
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.FX_RATES_URL.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['FX_RATES_URL'],
        message:
          'must be an https:// URL in production; rates feed a stored money conversion',
      });
    }
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
