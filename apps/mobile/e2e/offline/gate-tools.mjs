#!/usr/bin/env node
/**
 * Server-side helpers for the offline acceptance gate (tasks.md T140, T203, T141).
 *
 * Two things the Maestro flows cannot do from a screen, both plain HTTP against the
 * API with the gate account's own credentials (no database access, no owner role):
 *
 *   seed-bulk    Gives the account a trip, 'Gate bulk', holding 1,100 expenses of
 *                1.00 EUR, pushed through `POST /sync/push` in batches of at most
 *                500. 1,100 rows is three `GET /sync/pull` pages (PULL_PAGE_SIZE =
 *                500) for a brand-new device: that makes the first-sync state
 *                observable (row 7) and gives row 10 a snapshot too large for one
 *                attempt. The total of 1,100.00 EUR is the checksum row 10 asserts.
 *                Idempotent: ids derive from RUN_ID, so a rerun upserts the same rows.
 *
 *   verify-flag  Row 15's "flagged" half. The app records `over_allowance` in memory
 *                and no screen shows it yet, so this replays the offline-created
 *                trip's push (an idempotent noop by id: equal timestamp, identical
 *                payload) and prints the `warnings` the API answers with. Exit 0 when
 *                it says `over_allowance`, 1 when it does not, 2 on any other failure.
 *
 * Usage (from the repository root; Node 22+, no dependencies):
 *
 *   RUN_ID=1767225600 node apps/mobile/e2e/offline/gate-tools.mjs seed-bulk
 *   RUN_ID=1767225600 node apps/mobile/e2e/offline/gate-tools.mjs verify-flag
 *   RUN_ID=1767225600 node apps/mobile/e2e/offline/gate-tools.mjs seed-bulk --dry-run
 *
 * Environment:
 *   RUN_ID     required; the same value the Maestro phases use (the account is
 *              maestro-offline-<RUN_ID>@example.com).
 *   API_URL    default http://localhost:3000, WITHOUT /v1 (this runs on the host
 *              machine, not on a device, so localhost is right here).
 *   PASSWORD   default correct-horse-battery-staple (the flows' password).
 *   BULK_COUNT default 1100.
 *   FLAG_TRIP  default 'Gate over allowance'.
 *
 * Secrets: the access token stays in memory and is never printed or logged; the
 * password is read from the environment and sent only to `POST /v1/auth/login`.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const PASSWORD = process.env.PASSWORD ?? 'correct-horse-battery-staple';
const BULK_COUNT = Number.parseInt(process.env.BULK_COUNT ?? '1100', 10);
const FLAG_TRIP = process.env.FLAG_TRIP ?? 'Gate over allowance';
const BULK_TRIP = 'Gate bulk';
/** `MAX_PUSH_BATCH` in packages/contracts/src/sync/envelope.ts. */
const MAX_BATCH = 500;
/** The seeded "Food" system category (SYSTEM_EXPENSE_CATEGORIES in contracts). */
const FOOD_CATEGORY_ID = '00000000-0000-4000-8000-000000000001';

class GateToolError extends Error {
  constructor(message, exitCode = 2) {
    super(message);
    this.exitCode = exitCode;
  }
}

function requireRunId() {
  const runId = process.env.RUN_ID;
  if (!runId)
    throw new GateToolError('RUN_ID is required (the same value as the Maestro phases).');
  return runId;
}

/** A stable RFC 4122 (version 5 layout) UUID from a name, so reruns upsert the same rows. */
export function uuidFrom(name) {
  const bytes = createHash('sha1').update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/** The contracts' own schema when the package is built; the check is skipped, loudly, otherwise. */
async function loadContracts() {
  try {
    return await import('@triptrackr/contracts');
  } catch {
    console.error(
      'note: @triptrackr/contracts is not built; request shapes are not pre-validated.',
    );
    return null;
  }
}

async function request(method, path, { token, body } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}/v1${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (cause) {
    throw new GateToolError(
      `${method} ${path}: cannot reach ${API_URL} (${cause.message}).`,
    );
  }
  const text = await response.text();
  let json = null;
  try {
    json = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // Not JSON: reported with the status below, never echoed (it could carry a token).
  }
  if (!response.ok) {
    throw new GateToolError(`${method} ${path}: HTTP ${response.status}.`);
  }
  return json;
}

async function login(runId) {
  const email = `maestro-offline-${runId}@example.com`;
  const tokens = await request('POST', '/auth/login', {
    body: { email, password: PASSWORD },
  });
  if (!tokens?.access_token)
    throw new GateToolError('Login answered without an access token.');
  return tokens.access_token;
}

// ---------------------------------------------------------------------------
// seed-bulk
// ---------------------------------------------------------------------------

/** Pure: every request body `seed-bulk` sends, in order. Exported for the dry run and for tests. */
export function bulkRequests(runId, count, now = new Date()) {
  const updatedAt = now.toISOString();
  const tripId = uuidFrom(`${runId}:bulk-trip`);
  const spentAt = updatedAt.slice(0, 10);

  const trip = {
    table: 'trips',
    records: [
      {
        id: tripId,
        title: BULK_TRIP,
        home_currency: 'EUR',
        is_public: false,
        cover_photo_id: null,
        updated_at: updatedAt,
        deleted: false,
      },
    ],
  };

  const expenses = Array.from({ length: count }, (_, index) => ({
    id: uuidFrom(`${runId}:bulk-expense:${index}`),
    trip_id: tripId,
    city_id: null,
    category_id: FOOD_CATEGORY_ID,
    amount: '1.00',
    currency: 'EUR',
    spent_at: spentAt,
    note: `Bulk ${String(index + 1).padStart(4, '0')}`,
    fx_rate_to_home: '1',
    amount_home: '1.00',
    updated_at: updatedAt,
    deleted: false,
  }));

  return [
    trip,
    ...chunks(expenses, MAX_BATCH).map((records) => ({ table: 'expenses', records })),
  ];
}

function assertAllApplied(table, response, sent) {
  const results = response?.results ?? [];
  const bad = results.filter((result) => result.status !== 'applied');
  if (results.length !== sent || bad.length > 0) {
    const reasons = [...new Set(bad.map((result) => result.reason ?? result.status))];
    throw new GateToolError(
      `${table}: ${bad.length} of ${sent} not applied (${reasons.join(', ') || 'short answer'}).`,
    );
  }
}

async function seedBulk(dryRun) {
  const runId = requireRunId();
  if (!Number.isInteger(BULK_COUNT) || BULK_COUNT < 1) {
    throw new GateToolError('BULK_COUNT must be a positive integer.');
  }
  const requests = bulkRequests(runId, BULK_COUNT);
  const contracts = await loadContracts();
  if (contracts) {
    for (const body of requests) contracts.PushRequest.parse(body);
  }

  const summary = {
    trip_id: requests[0].records[0].id,
    expenses: BULK_COUNT,
    expected_total_eur: BULK_COUNT.toFixed(2),
    push_batches: requests.length,
    pull_pages_for_a_new_device_at_least: Math.ceil((BULK_COUNT + 1) / 500),
  };
  if (dryRun) {
    console.log(
      JSON.stringify(
        { dry_run: true, validated: Boolean(contracts), ...summary },
        null,
        2,
      ),
    );
    return;
  }

  const token = await login(runId);
  for (const body of requests) {
    const response = await request('POST', '/sync/push', { token, body });
    assertAllApplied(body.table, response, body.records.length);
  }
  console.log(JSON.stringify(summary, null, 2));
}

// ---------------------------------------------------------------------------
// verify-flag
// ---------------------------------------------------------------------------

/** All live trips of the account, read through the pull feed (no cursor = full snapshot). */
async function pullTrips(token) {
  const trips = [];
  let cursor;
  for (let page = 0; page < 1000; page += 1) {
    const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const response = await request('GET', `/sync/pull${query}`, { token });
    trips.push(...(response?.changes?.trips ?? []));
    if (!response?.has_more) return trips;
    cursor = response.next_cursor;
  }
  throw new GateToolError('The pull feed did not end after 1000 pages.');
}

/** A pulled trip as the push shape: the client-authored columns only. */
export function tripPushRecord(pulled) {
  return {
    id: pulled.id,
    title: pulled.title,
    home_currency: pulled.home_currency,
    is_public: pulled.is_public,
    cover_photo_id: pulled.cover_photo_id,
    updated_at: pulled.updated_at,
    deleted: false,
  };
}

async function verifyFlag() {
  const runId = requireRunId();
  const token = await login(runId);
  const trips = await pullTrips(token);
  const live = trips.filter((trip) => trip.deleted_at === null);
  const target = live.find((trip) => trip.title === FLAG_TRIP);
  if (!target) {
    throw new GateToolError(
      `No live trip titled '${FLAG_TRIP}' on this account: it has not reached the server (row 15 failed earlier).`,
      1,
    );
  }

  const body = { table: 'trips', records: [tripPushRecord(target)] };
  const contracts = await loadContracts();
  if (contracts) contracts.PushRequest.parse(body);
  const response = await request('POST', '/sync/push', { token, body });
  const result = response?.results?.[0];
  const warnings = result?.warnings ?? [];

  console.log(
    JSON.stringify(
      {
        trip: FLAG_TRIP,
        live_trips_on_account: live.length,
        status: result?.status ?? null,
        warnings,
      },
      null,
      2,
    ),
  );
  if (result?.status !== 'applied') {
    throw new GateToolError(
      `The replay was answered '${result?.status ?? 'nothing'}', not 'applied'.`,
    );
  }
  if (!warnings.includes('over_allowance')) {
    throw new GateToolError(
      'The trip was kept but NOT flagged. The account held fewer live trips than FREE_TRIP_ALLOWANCE before it, or the flag is missing.',
      1,
    );
  }
}

// ---------------------------------------------------------------------------

async function main(argv) {
  const [command, ...flags] = argv;
  if (command === 'seed-bulk') return seedBulk(flags.includes('--dry-run'));
  if (command === 'verify-flag') return verifyFlag();
  throw new GateToolError('Usage: gate-tools.mjs seed-bulk [--dry-run] | verify-flag');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `exitCode`, not `process.exit()`: on Windows an immediate exit while fetch's
  // keep-alive sockets are closing trips a libuv assertion and loses the code.
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof GateToolError ? error.message : error);
    process.exitCode = error instanceof GateToolError ? error.exitCode : 2;
  });
}
