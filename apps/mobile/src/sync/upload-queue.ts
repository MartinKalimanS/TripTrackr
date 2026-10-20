import { and, count, eq, isNull, ne, or } from 'drizzle-orm';
import * as Network from 'expo-network';

import type { AppDatabase } from '@/db/client';
import { documents, photos } from '@/db/schema';
import { uploadPendingDocuments } from '@/features/documents/upload';
import { uploadPendingPhotos } from '@/features/photos/upload';
import { Sentry } from '@/lib/sentry';

import { useSyncStatusStore } from './engine';

/**
 * The binary upload queue — tasks.md T134 (FR-041; sync-protocol.md §4;
 * Constitution II).
 *
 * Metadata syncs through the engine; bytes do not. Capture writes the file to
 * app-private storage and the row as `pending`; this queue decides WHEN the
 * bytes go and hands each trip to the uploaders that already know HOW
 * (`uploadPendingPhotos`, `uploadPendingDocuments`: single-flight per record,
 * compare-and-set marks, cancellation on delete). A record is clean only once
 * the object store has confirmed its bytes — the queue never marks anything.
 *
 * The public surface (the triggers and the sign-out guard import it):
 *
 *   - `startUploadQueue(db)` binds the signed-in traveller's database, looks
 *     for work at once, and returns the function that unbinds it.
 *   - `kickUploadQueue(reason)` asks for a look now — after a capture, when
 *     connectivity returns, when the app is foregrounded. Never rejects;
 *     resolves when that look, and the drain it started or joined, is over.
 *   - `countPendingUploads(db)` is the number of photos and documents whose
 *     bytes the object store has not confirmed. The sign-out guard adds it to
 *     the engine's dirty-row count. A failed upload counts: its bytes are not
 *     on the server either.
 *
 * WI-FI PREFERENCE (sync-protocol.md §4.2; `expo-network`,
 * https://docs.expo.dev/versions/v57.0.0/sdk/network/). `getNetworkStateAsync`
 * and `addNetworkStateListener` give a `NetworkStateType`:
 *
 *   - `WIFI` and `ETHERNET` are unmetered: the queue drains at once.
 *   - `CELLULAR` — and every link that cannot be told from it (`VPN`, `OTHER`,
 *     `BLUETOOTH`, `WIMAX`, a failed read) — is metered. The queue holds back
 *     for `CELLULAR_HOLD_BACK_MS` from when the OLDEST pending record was
 *     captured, so a traveller who reaches Wi-Fi within a few minutes saves
 *     the data, and then uploads anyway: "no Wi-Fi abroad" must still upload.
 *     The wait is measured from the record's own `created_at`, so it survives
 *     an app restart; a `created_at` in the future (a clock that has since been
 *     corrected) is not trusted and is treated as due. A traveller waiting on
 *     it (`sign-out`, `manual`) is never held back.
 *   - No connection (`isConnected`/`isInternetReachable` false, `NONE`,
 *     `UNKNOWN`): nothing runs and nothing is scheduled — the next transition
 *     wakes the queue, so an offline phone is not woken by timers.
 *
 * BACKOFF. A pass that uploads nothing and sees nothing new is a failure; the
 * next pass waits `BACKOFF_BASE_MS`, doubling per consecutive failure up to
 * `BACKOFF_CEILING_MS`. Finishing the queue, making progress, a connectivity
 * transition and a finished sync cycle (a trip an upload was waiting for may
 * have reached the server) each reset it; a plain kick retries at once but does
 * not reset it. No jitter: one device, one account.
 *
 * ONE DRAIN AT A TIME. A kick while a drain runs joins it; if the pass made
 * progress, or saw new records appear, the drain looks once more before it
 * ends, so a photo captured mid-drain is not left waiting for the backoff.
 *
 * Deleting a record cancels its upload and deletes its staged file in the
 * photo and document actions (`usePhotoActions().remove`,
 * `useDocumentActions().remove`); the queue reads the store afresh on every
 * pass, so a tombstoned record is never picked up.
 *
 * Visibility posture: bytes go to the traveller's own account only, through
 * the existing uploaders; the queue reads no row content and sends nothing.
 */

/**
 * How long a capture waits for Wi-Fi before it goes over cellular. Ten minutes
 * is long enough to get back to a hotel or café and short enough that a
 * photograph is safely in the account well within the hour; photos are about a
 * megabyte, so a holiday of captures costs little data either way.
 */
export const CELLULAR_HOLD_BACK_MS = 10 * 60 * 1000;

/** The first retry after a failed pass. */
export const BACKOFF_BASE_MS = 15 * 1000;

/** The longest wait between passes, however many have failed. */
export const BACKOFF_CEILING_MS = 5 * 60 * 1000;

/** Reasons that mean a traveller is waiting on the bytes: never held back. */
const URGENT_REASONS: ReadonlySet<string> = new Set(['sign-out', 'manual']);

/** The wait after `failures` consecutive failed passes: 15 s, 30 s, 60 s … 5 min. */
export function backoffDelay(failures: number): number {
  const doublings = Math.max(0, Math.min(failures, 32) - 1);
  return Math.min(BACKOFF_CEILING_MS, BACKOFF_BASE_MS * 2 ** doublings);
}

// ---------------------------------------------------------------------------
// The link
// ---------------------------------------------------------------------------

type Link = 'offline' | 'unmetered' | 'metered';

function linkOf(state: Network.NetworkState): Link {
  if (state.isConnected === false || state.isInternetReachable === false) {
    return 'offline';
  }
  switch (state.type) {
    case Network.NetworkStateType.NONE:
    case Network.NetworkStateType.UNKNOWN:
      return 'offline';
    case Network.NetworkStateType.WIFI:
    case Network.NetworkStateType.ETHERNET:
      return 'unmetered';
    default:
      return 'metered';
  }
}

/** A link that cannot be read is assumed metered: held back at worst, never stopped. */
async function readLink(): Promise<Link> {
  try {
    return linkOf(await Network.getNetworkStateAsync());
  } catch {
    return 'metered';
  }
}

// ---------------------------------------------------------------------------
// What is pending
// ---------------------------------------------------------------------------

interface Pending {
  key: string;
  kind: 'photos' | 'documents';
  tripId: string;
  createdAt: string;
}

/**
 * What the uploaders would pick up: a live photo `pending`; a live document
 * `pending`, or uploaded with an unsent confirmation. Never `failed` (only a
 * traveller's retry revives it), never a tombstone. Mirrors
 * `photosRepository.pendingUploads` and `documentsRepository.needingUploadIds`
 * across every trip (the queue test pins that they agree).
 */
function readPending(db: AppDatabase): Pending[] {
  const photoRows = db
    .select({ id: photos.id, tripId: photos.trip_id, createdAt: photos.created_at })
    .from(photos)
    .where(and(eq(photos.upload_state, 'pending'), isNull(photos.deleted_at)))
    .all();
  const documentRows = db
    .select({
      id: documents.id,
      tripId: documents.trip_id,
      createdAt: documents.created_at,
    })
    .from(documents)
    .where(
      and(
        isNull(documents.deleted_at),
        or(
          eq(documents.upload_state, 'pending'),
          and(eq(documents.upload_state, 'uploaded'), eq(documents.is_dirty, true)),
        ),
      ),
    )
    .all();
  return [
    ...photoRows.map((row) => ({
      ...row,
      key: `photo:${row.id}`,
      kind: 'photos' as const,
    })),
    ...documentRows.map((row) => ({
      ...row,
      key: `document:${row.id}`,
      kind: 'documents' as const,
    })),
  ];
}

/** Trips with something pending, the trip holding the oldest capture first. */
function tripsOldestFirst(pending: readonly Pending[]): string[] {
  const oldest = new Map<string, string>();
  for (const item of pending) {
    const seen = oldest.get(item.tripId);
    if (seen === undefined || item.createdAt < seen)
      oldest.set(item.tripId, item.createdAt);
  }
  return [...oldest]
    .sort(([, a], [, b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tripId]) => tripId);
}

/**
 * Milliseconds until the oldest pending capture has waited out its hold-back;
 * 0 when it has. A capture stamped in the future, or unreadable, is not
 * trusted and is due now — a wrong clock must not park an upload.
 */
function holdBackRemaining(pending: readonly Pending[], now: number): number {
  const due = pending.map((item) => {
    const captured = Date.parse(item.createdAt);
    return Number.isFinite(captured) && captured <= now
      ? captured + CELLULAR_HOLD_BACK_MS
      : now;
  });
  return Math.max(0, Math.min(...due) - now);
}

/**
 * Photos and documents whose bytes the object store has not confirmed (live,
 * not `uploaded`) — failed ones included. Rejects if the store cannot be read:
 * a wrong "nothing pending" would let a sign-out discard bytes (Constitution V).
 */
export async function countPendingUploads(db: AppDatabase): Promise<number> {
  const [photoCount] = db
    .select({ value: count() })
    .from(photos)
    .where(and(isNull(photos.deleted_at), ne(photos.upload_state, 'uploaded')))
    .all();
  const [documentCount] = db
    .select({ value: count() })
    .from(documents)
    .where(and(isNull(documents.deleted_at), ne(documents.upload_state, 'uploaded')))
    .all();
  return (photoCount?.value ?? 0) + (documentCount?.value ?? 0);
}

// ---------------------------------------------------------------------------
// The binding
// ---------------------------------------------------------------------------

interface Binding {
  db: AppDatabase;
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** Consecutive failed passes; drives the backoff. */
  failures: number;
  link: Link | null;
  draining: Promise<void> | null;
  /** A kick arrived while draining. */
  again: boolean;
  release: (() => void)[];
}

let current: Binding | null = null;

function clearTimer(binding: Binding): void {
  if (binding.timer !== null) clearTimeout(binding.timer);
  binding.timer = null;
}

function report(error: unknown): void {
  Sentry.captureException(error);
}

function schedule(binding: Binding, waitMs: number): void {
  clearTimer(binding);
  if (binding.stopped) return;
  binding.timer = setTimeout(() => {
    binding.timer = null;
    void look(binding, 'timer');
  }, waitMs);
}

/** After a pass that got nowhere: count it, and wait longer than last time. */
function failPass(binding: Binding): void {
  binding.failures += 1;
  schedule(binding, backoffDelay(binding.failures));
}

/** One trip's photos, then its documents — whichever it has pending. */
async function uploadTrip(
  binding: Binding,
  tripId: string,
  pending: readonly Pending[],
): Promise<void> {
  const here = new Set(
    pending.filter((item) => item.tripId === tripId).map((i) => i.kind),
  );
  if (here.has('photos')) await uploadPendingPhotos(binding.db, tripId);
  if (binding.stopped) return;
  if (here.has('documents')) await uploadPendingDocuments(binding.db, tripId);
}

interface PassResult {
  /** The pass made the store smaller. */
  progressed: boolean;
  /** Records appeared that the pass never saw. */
  newWork: boolean;
  finished: boolean;
}

async function runPass(binding: Binding): Promise<PassResult | null> {
  const before = readPending(binding.db);
  if (before.length === 0) return { progressed: false, newWork: false, finished: true };
  for (const tripId of tripsOldestFirst(before)) {
    if (binding.stopped) return null;
    await uploadTrip(binding, tripId, before);
  }
  if (binding.stopped) return null;
  const after = readPending(binding.db);
  const seen = new Set(before.map((item) => item.key));
  const left = new Set(after.map((item) => item.key));
  return {
    progressed: before.some((item) => !left.has(item.key)),
    newWork: after.some((item) => !seen.has(item.key)),
    finished: after.length === 0,
  };
}

/** Passes until one gets nowhere, or finishes, or nothing more was asked for. */
async function drainLoop(binding: Binding): Promise<void> {
  for (;;) {
    binding.again = false;
    let result: PassResult | null;
    try {
      result = await runPass(binding);
    } catch (error) {
      report(error);
      if (!binding.stopped) failPass(binding);
      return;
    }
    if (result === null) return;
    if (result.finished) {
      binding.failures = 0;
      clearTimer(binding);
      return;
    }
    if (!result.progressed && !result.newWork) {
      failPass(binding);
      return;
    }
    binding.failures = 0;
    if (result.newWork || binding.again) continue;
    schedule(binding, BACKOFF_BASE_MS);
    return;
  }
}

/** Single-flight: a call while a drain runs joins it and asks it to look again. */
function drain(binding: Binding): Promise<void> {
  if (binding.draining) {
    binding.again = true;
    return binding.draining;
  }
  const running = drainLoop(binding).finally(() => {
    binding.draining = null;
  });
  binding.draining = running;
  return running;
}

/** Decide whether to drain now, wait, or do nothing; then drain if now. */
async function look(binding: Binding, reason: string, known?: Link): Promise<void> {
  try {
    clearTimer(binding);
    const link = known ?? (await readLink());
    binding.link = link;
    if (binding.stopped || link === 'offline') return;
    const pending = readPending(binding.db);
    if (pending.length === 0) {
      binding.failures = 0;
      return;
    }
    if (link === 'metered' && !URGENT_REASONS.has(reason)) {
      const wait = Math.min(
        holdBackRemaining(pending, Date.now()),
        CELLULAR_HOLD_BACK_MS,
      );
      if (wait > 0) {
        schedule(binding, wait);
        return;
      }
    }
    await drain(binding);
  } catch (error) {
    report(error);
    if (!binding.stopped) failPass(binding);
  }
}

/** The link changed class: start the backoff over and look with the new link in mind. */
function onLinkEvent(binding: Binding, state: Network.NetworkState): void {
  const link = linkOf(state);
  if (link === binding.link) return;
  binding.failures = 0;
  void look(binding, 'network', link);
}

function onSyncStatus(
  binding: Binding,
  status: { lastSyncedAt: string | null },
  previous: { lastSyncedAt: string | null },
): void {
  if (status.lastSyncedAt === null || status.lastSyncedAt === previous.lastSyncedAt)
    return;
  // A cycle finished: a trip an upload was waiting for may be on the server now.
  binding.failures = 0;
  void look(binding, 'synced');
}

function stop(binding: Binding): void {
  binding.stopped = true;
  clearTimer(binding);
  binding.release.splice(0).forEach((release) => release());
}

/**
 * Bind the signed-in traveller's database. Looks for work at once, follows the
 * connection and the sync engine, and returns the function that unbinds.
 * Binding again replaces the previous binding (a different traveller signed in).
 */
export function startUploadQueue(db: AppDatabase): () => void {
  if (current) stop(current);
  const binding: Binding = {
    db,
    stopped: false,
    timer: null,
    failures: 0,
    link: null,
    draining: null,
    again: false,
    release: [],
  };
  current = binding;

  const subscription = Network.addNetworkStateListener((state) =>
    onLinkEvent(binding, state),
  );
  binding.release.push(() => subscription.remove());
  binding.release.push(
    useSyncStatusStore.subscribe((status, previous) =>
      onSyncStatus(binding, status, previous),
    ),
  );

  void look(binding, 'start');
  return () => {
    stop(binding);
    if (current === binding) current = null;
  };
}

/**
 * Ask the queue to look for work now. Never rejects. Resolves when the look —
 * and the drain it started or joined — is over; immediately when nothing is
 * bound, the phone is offline, or the wait for Wi-Fi has been scheduled.
 */
export async function kickUploadQueue(reason: string): Promise<void> {
  const binding = current;
  if (!binding) return;
  await look(binding, reason);
}
