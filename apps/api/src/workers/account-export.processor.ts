import { Uuid } from '@triptrackr/contracts';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';

import { drizzleOver, type RlsDatabase } from '@/common/db/rls-db';
import type { EnvelopeService } from '@/common/crypto/envelope.service';
import type { StorageService } from '@/common/storage/storage.service';
import {
  cities,
  countries,
  dataExports,
  documents,
  expenseCategories,
  expenses,
  notes,
  photos,
  tripStops,
  trips,
  users,
} from '@/db/schema';
import type { EmailSender } from '@/modules/auth/email-sender';
import type { BoardingPassService } from '@/modules/documents/boarding-pass.service';

import { writeZip, type ZipEntries } from './zip-writer';

/**
 * Export my data — tasks.md T190 (FR-007; spec 009).
 *
 * `POST /me/export` (modules/users/export.service.ts) records a pending row and queues this job.
 * The job builds ONE zip with everything the traveller recorded, in files a person can read
 * without us (JSON, a CSV of the expenses, the original photos, the documents opened for their
 * owner), and uploads it to the private documents bucket under `<userId>/exports/<exportId>.zip`.
 * The route then hands out short-lived signed links to it while it lasts (24 hours).
 *
 * **It reads as the traveller.** The worker has no identity of its own, so the job takes the
 * traveller's for each transaction (`set_config`, exactly as the request path does) and every
 * query runs under the same row-level-security policies a request would: a query that forgot a
 * filter still cannot see another account, and no keyhole is needed. The data is read in one short
 * transaction and the archive is built outside it, so no connection is held across the object
 * store; the row is marked ready in a second one.
 *
 * **Memory and disk.** The zip is streamed into a temporary file (mode 0600: it holds the
 * documents in the clear) and uploaded from it; one stored object is in memory at a time. The file
 * is removed whatever happens.
 *
 * **What it leaves out.** Deleted rows (tombstones), the password hash, every key and storage path.
 * Documents are opened with the envelope service only here, for the owner who asked.
 *
 * **Failure.** A job that fails marks its row `failed` and returns; it does not throw, so BullMQ
 * does not retry a half-built archive and the traveller may ask again (a failed export does not
 * count against the day). The result carries an error name, never a message: a message can hold a
 * title or a path.
 *
 * Visibility posture: owner-only. Nothing is logged but counts and the outcome.
 */

/** How long an archive is kept after it is ready. */
export const EXPORT_RETENTION_HOURS = 24;
const HOUR_MS = 3_600_000;

export const AccountExportJob = z.strictObject({ exportId: Uuid, userId: Uuid });
export type AccountExportJob = z.infer<typeof AccountExportJob>;

export type ExportStorage = Pick<
  StorageService,
  'getObject' | 'putObjectFromFile' | 'removeObject'
>;

export interface AccountExportDeps {
  /** The API role's connection, with no traveller identity (bootstrap.ts). */
  readonly sql: Sql;
  readonly storage: ExportStorage;
  readonly envelope: Pick<EnvelopeService, 'open' | 'documentAad'>;
  readonly boardingPass: Pick<BoardingPassService, 'open'>;
  /** Tells the traveller it is ready (no link, no contents); absent in tests that do not care. */
  readonly email?: EmailSender | null;
  /** Where the temporary file goes; the system's by default. */
  readonly tmpDir?: string;
  readonly now?: () => Date;
}

export type AccountExportResult =
  | { readonly outcome: 'ready'; readonly files: number; readonly bytes: number }
  | { readonly outcome: 'skipped' }
  | { readonly outcome: 'failed'; readonly error: string };

/** Runs `work` in a transaction that is the traveller's, as a request's is. */
async function asTraveller<T>(
  sql: Sql,
  userId: string,
  work: (db: RlsDatabase) => Promise<T>,
): Promise<T> {
  return (await sql.begin(async (tx: TransactionSql) => {
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return work(drizzleOver(tx));
  })) as T;
}

type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;

export async function processAccountExport(
  deps: AccountExportDeps,
  rawJob: unknown,
): Promise<AccountExportResult> {
  const { exportId, userId } = AccountExportJob.parse(rawJob);
  const now = deps.now ?? (() => new Date());

  // 1. Is there a pending export of this traveller's? Read their data in the same breath.
  const snapshot = await asTraveller(deps.sql, userId, async (db) => {
    const [row] = await db
      .select({ status: dataExports.status })
      .from(dataExports)
      .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)))
      .limit(1);
    return row?.status === 'pending' ? readSnapshot(db, userId) : null;
  });
  if (snapshot === null) return { outcome: 'skipped' };

  const key = `${userId}/exports/${exportId}.zip`;
  const file = join(deps.tmpDir ?? tmpdir(), `export-${exportId}-${randomUUID()}.zip`);

  try {
    const counted = { files: 0 };
    await writeZip(file, (entries) => buildArchive(deps, snapshot, entries, counted));
    const bytes = await sizeOf(file);
    await deps.storage.putObjectFromFile('documents', key, file, 'application/zip');

    const completed = now();
    await asTraveller(deps.sql, userId, (db) =>
      db
        .update(dataExports)
        .set({
          status: 'ready',
          completedAt: completed,
          expiresAt: new Date(completed.getTime() + EXPORT_RETENTION_HOURS * HOUR_MS),
          objectKey: key,
          byteSize: bytes,
        })
        .where(eq(dataExports.id, exportId)),
    );
    await tellTraveller(deps, snapshot);
    return { outcome: 'ready', files: counted.files, bytes };
  } catch (error) {
    await markFailed(deps, userId, exportId, key);
    return { outcome: 'failed', error: errorName(error) };
  } finally {
    await rm(file, { force: true });
  }
}

/** The error's class, never its message: a message may carry a title, a path or a key. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

async function sizeOf(path: string): Promise<number> {
  return (await stat(path)).size;
}

/** `failed`, and no archive left behind (an upload that half-landed is removed). */
async function markFailed(
  deps: AccountExportDeps,
  userId: string,
  exportId: string,
  key: string,
): Promise<void> {
  try {
    await deps.storage.removeObject('documents', key);
  } catch {
    // Nothing to clean, or the store is down: the cleanup job removes `<userId>/exports/` objects
    // past their row's life; the row is what matters now.
  }
  try {
    await asTraveller(deps.sql, userId, (db) =>
      db
        .update(dataExports)
        .set({ status: 'failed', completedAt: new Date(), objectKey: null })
        .where(and(eq(dataExports.id, exportId), eq(dataExports.status, 'pending'))),
    );
  } catch {
    // The row stays `pending`; the next request after a day is allowed anyway.
  }
}

async function tellTraveller(deps: AccountExportDeps, snapshot: Snapshot): Promise<void> {
  if (!deps.email) return;
  try {
    await deps.email.send({
      to: snapshot.profile.email,
      subject: 'Your TripTrackr export is ready',
      text:
        'The export of your data is ready. Open TripTrackr, go to You and choose "Export my data" to ' +
        `download it. It is available for ${EXPORT_RETENTION_HOURS} hours.`,
    });
  } catch {
    // The export is ready whether or not the email arrived; the app shows its state.
  }
}

// ---------------------------------------------------------------------------------------
// What is read
// ---------------------------------------------------------------------------------------

async function readSnapshot(db: RlsDatabase, userId: string) {
  const [profile] = await db
    .select({
      id: users.id,
      email: users.email,
      display_name: users.displayName,
      bio: users.bio,
      avatar_url: users.avatarUrl,
      home_currency: users.homeCurrency,
      is_profile_public: users.isProfilePublic,
      created_at: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!profile) throw new Error('The traveller is gone.');

  const tripRows = await db
    .select({
      id: trips.id,
      title: trips.title,
      status: trips.status,
      is_public: trips.isPublic,
      home_currency: trips.homeCurrency,
      cover_photo_id: trips.coverPhotoId,
      created_at: trips.createdAt,
      updated_at: trips.updatedAt,
    })
    .from(trips)
    .where(and(eq(trips.ownerId, userId), isNull(trips.deletedAt)))
    .orderBy(asc(trips.createdAt));
  const owned = new Set(tripRows.map((trip) => trip.id));

  const stopRows = await db
    .select({
      id: tripStops.id,
      trip_id: tripStops.tripId,
      sort_order: tripStops.sortOrder,
      arrive_date: tripStops.arriveDate,
      depart_date: tripStops.departDate,
      city: cities.name,
      country: countries.name,
    })
    .from(tripStops)
    .innerJoin(cities, eq(cities.id, tripStops.cityId))
    .innerJoin(countries, eq(countries.id, cities.countryId))
    .where(isNull(tripStops.deletedAt))
    .orderBy(asc(tripStops.sortOrder));

  const noteRows = await db
    .select({
      id: notes.id,
      trip_id: notes.tripId,
      title: notes.title,
      body: notes.body,
      is_public: notes.isPublic,
      created_at: notes.createdAt,
      updated_at: notes.updatedAt,
    })
    .from(notes)
    .where(isNull(notes.deletedAt))
    .orderBy(asc(notes.createdAt));

  const categoryRows = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(or(isNull(expenseCategories.userId), eq(expenseCategories.userId, userId)));
  const categoryName = new Map(categoryRows.map((row) => [row.id, row.name]));

  const expenseRows = await db
    .select({
      id: expenses.id,
      trip_id: expenses.tripId,
      category_id: expenses.categoryId,
      amount: expenses.amount,
      currency: expenses.currency,
      fx_rate_to_home: expenses.fxRateToHome,
      amount_home: expenses.amountHome,
      fx_pending: expenses.fxPending,
      spent_at: expenses.spentAt,
      note: expenses.note,
      created_at: expenses.createdAt,
    })
    .from(expenses)
    .where(isNull(expenses.deletedAt))
    .orderBy(asc(expenses.spentAt));

  const photoRows = await db
    .select({
      id: photos.id,
      trip_id: photos.tripId,
      taken_at: photos.takenAt,
      exif_lat: photos.exifLat,
      exif_lng: photos.exifLng,
      is_public: photos.isPublic,
      upload_state: photos.uploadState,
      created_at: photos.createdAt,
      storageKey: photos.storageKey,
    })
    .from(photos)
    .where(isNull(photos.deletedAt))
    .orderBy(asc(photos.createdAt));

  const documentRows = await db
    .select({
      id: documents.id,
      trip_id: documents.tripId,
      type: documents.type,
      content_type: documents.contentType,
      byte_size: documents.byteSize,
      parsed_confirmed_at: documents.parsedConfirmedAt,
      upload_state: documents.uploadState,
      created_at: documents.createdAt,
      storageKey: documents.storageKey,
      wrappedDek: documents.wrappedDek,
      dekKeyId: documents.dekKeyId,
      parsedSealed: documents.parsedSealed,
    })
    .from(documents)
    .where(isNull(documents.deletedAt))
    .orderBy(asc(documents.createdAt));

  // Belt and braces over row-level security: only what belongs to a trip of this traveller's.
  const ofTrips = <T extends { trip_id: string }>(rows: T[]) =>
    rows.filter((row) => owned.has(row.trip_id));

  return {
    profile,
    trips: tripRows,
    stops: ofTrips(stopRows),
    notes: ofTrips(noteRows),
    expenses: ofTrips(expenseRows),
    photos: ofTrips(photoRows),
    documents: ofTrips(documentRows),
    categoryName,
  };
}

// ---------------------------------------------------------------------------------------
// What is written
// ---------------------------------------------------------------------------------------

const README = `TripTrackr: your data

This archive holds everything you recorded in TripTrackr, in files you can read without the app.

  profile.json     your profile
  trips.json       your trips, each with its stops
  notes.json       your notes
  expenses.json    your expenses, with currency, exchange rate and the amount in the trip's home currency
  expenses.csv     the same expenses as a spreadsheet
  photos.json      your photos' details; the originals are in photos/
  documents.json   your documents' details (and the fields read from them); the files are in documents/

Photos and documents are the original files. Things you deleted are not included.
`;

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

async function buildArchive(
  deps: AccountExportDeps,
  data: Snapshot,
  zip: ZipEntries,
  counted: { files: number },
): Promise<void> {
  const add = async (name: string, content: string) => {
    await zip.text(name, content);
    counted.files += 1;
  };
  const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

  await add('README.txt', README);
  await add('profile.json', pretty(data.profile));
  await add(
    'trips.json',
    pretty(
      data.trips.map((trip) => ({
        ...trip,
        stops: data.stops
          .filter((stop) => stop.trip_id === trip.id)
          .map(({ trip_id: _trip, ...stop }) => stop),
      })),
    ),
  );
  await add('notes.json', pretty(data.notes));
  await add(
    'expenses.json',
    pretty(
      data.expenses.map((expense) => ({
        ...expense,
        category: data.categoryName.get(expense.category_id) ?? null,
      })),
    ),
  );
  await add('expenses.csv', expensesCsv(data));

  const photoEntries = [];
  for (const { storageKey, ...photo } of data.photos) {
    const bytes =
      photo.upload_state === 'uploaded'
        ? await deps.storage.getObject('photos', storageKey)
        : null;
    const name = bytes ? `photos/${photo.id}.jpg` : null;
    if (bytes && name) {
      await zip.binary(name, bytes);
      counted.files += 1;
    }
    photoEntries.push({ ...photo, file: name });
  }
  await add('photos.json', pretty(photoEntries));

  const documentEntries = [];
  for (const row of data.documents) {
    const { storageKey, wrappedDek, dekKeyId, parsedSealed, ...document } = row;
    const sealed =
      row.upload_state === 'uploaded'
        ? await deps.storage.getObject('documents', storageKey)
        : null;
    let name: string | null = null;
    if (sealed) {
      const bytes = deps.envelope.open(
        { ciphertext: sealed, wrappedDek, dekKeyId },
        deps.envelope.documentAad(row.id),
      );
      name = `documents/${row.id}.${EXTENSION[row.content_type] ?? 'bin'}`;
      await zip.binary(name, bytes);
      counted.files += 1;
    }
    documentEntries.push({
      ...document,
      parsed_json: deps.boardingPass.open({ wrappedDek, dekKeyId }, row.id, parsedSealed),
      file: name,
    });
  }
  await add('documents.json', pretty(documentEntries));
}

const CSV_HEADER = [
  'trip',
  'spent_at',
  'category',
  'amount',
  'currency',
  'fx_rate_to_home',
  'amount_home',
  'home_currency',
  'note',
];

/** RFC 4180: a field with a comma, a quote or a line break is quoted, and its quotes doubled. */
function csvField(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function expensesCsv(data: Snapshot): string {
  const tripOf = new Map(data.trips.map((trip) => [trip.id, trip]));
  const lines = [CSV_HEADER.join(',')];
  for (const expense of data.expenses) {
    const trip = tripOf.get(expense.trip_id);
    lines.push(
      [
        trip?.title,
        expense.spent_at,
        data.categoryName.get(expense.category_id),
        expense.amount,
        expense.currency,
        expense.fx_rate_to_home,
        expense.amount_home,
        trip?.home_currency,
        expense.note,
      ]
        .map(csvField)
        .join(','),
    );
  }
  return `${lines.join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------------------
// The daily cleanup
// ---------------------------------------------------------------------------------------

export interface ExportCleanupDeps {
  readonly sql: Sql;
  readonly storage: Pick<StorageService, 'removeObject'>;
}

export interface ExportCleanupResult {
  /** Archives removed and their rows marked expired. */
  readonly removed: number;
}

/**
 * Removes every archive past its 24 hours: the object first (`removeObject` throws on anything
 * but "already gone", so a refusing store leaves the rows `ready` and the next run retries), then
 * the rows are marked expired. Runs with no identity through migration 0015's two keyholes.
 */
export async function cleanupExpiredExports(
  deps: ExportCleanupDeps,
): Promise<ExportCleanupResult> {
  const due = await deps.sql<{ export_id: string; object_key: string }[]>`
    SELECT export_id, object_key FROM data_exports_expired()
  `;
  if (due.length === 0) return { removed: 0 };

  for (const { object_key: key } of due)
    await deps.storage.removeObject('documents', key);

  const ids = due.map((row) => row.export_id);
  await deps.sql`SELECT data_exports_mark_expired(${ids}::uuid[])`;
  return { removed: due.length };
}
