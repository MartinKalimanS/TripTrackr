import { Injectable } from '@nestjs/common';
import { DocumentPushRecord, PhotoPushRecord } from '@triptrackr/contracts';
import { and, eq } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { documents, photos } from '@/db/schema';
import {
  BoardingPassService,
  fieldsBelongOn,
} from '@/modules/documents/boarding-pass.service';

import { RecordRefusal } from './push-errors';
import type { PushTableHandler, StoredRow, WriteTimes } from './push-handler';
import { inOwnTrips, requireKnownCity, sameInstant } from './push-scope';

/**
 * `photos` and `documents` on the push path — metadata only, for rows that
 * already exist (tasks.md T128; FR-032, FR-033, FR-035, FR-041, FR-056;
 * research D-12, D-32, D-33, D-34).
 *
 * **Push never creates one.** A photo or a document row exists only after the
 * object store confirmed the bytes: registration (photos) and the sealed upload
 * (documents) write the row, `upload_state = 'uploaded'`, and nothing else does.
 * A metadata record for an id with no row is therefore not a record to store but
 * a record that must wait — `rejected` / `parent_missing`, dirty on the device
 * until its upload registers it (FR-041). `creates` is false and the driver
 * enforces it; there is deliberately no `insert` here that could be reached.
 * The one exception is a delete: a tombstone for a row that never registered has
 * nothing to delete and the same end state as success, so it is `applied`
 * (push-apply.ts) rather than left to be retried forever.
 *
 * **Deleting is a tombstone only, as in REST.** `DELETE /photos/:id` and
 * `DELETE /documents/:id` set `deleted_at` and leave the object in the bucket for
 * the storage sweep after the retention window (T188); so does a tombstone here.
 * Nothing in this file touches the object store.
 *
 * **Photos: mutable are `is_public`, `city_id` and the tombstone.** Everything
 * else the push shape carries (`trip_id`, `taken_at`, `exif_lat`, `exif_lng`) is
 * fixed at registration — the EXIF columns are "as observed" (data-model.md §5)
 * and the worker fills only what is missing — and is ignored when it differs,
 * silently: the device is not wrong to send its whole row. `is_public` is
 * accepted at any time, pending screening included; `moderation_state` is not
 * a key of the push shape and is never written here, so a photo made public while
 * `pending` stays unreachable to everyone else, which is decided by
 * `photos_public_read` (0005) and not by this handler (FR-056, Constitution IV).
 *
 * **Documents are owner-only, structurally.** There is no visibility key in the
 * push shape (the strict schema refuses one), no column, no policy. Mutable are
 * `type`, `parsed_json`, `parsed_confirmed_at` and the tombstone. The extracted
 * fields are sealed and opened only by `BoardingPassService` — the same sealing
 * as REST, under the document's own data key with its own associated data
 * (D-33) — and only a boarding pass may carry them (`fieldsBelongOn`, shared
 * with `PATCH /documents/:id`); a confirmation without fields to confirm is
 * refused, as the database CHECK behind it would refuse it (Constitution IV).
 * Fields that did not change are not re-sealed.
 *
 * Visibility posture: photos — owner on this path (the public read is the
 * curated view of User Story 7); documents — owner, always.
 */

// ---------------------------------------------------------------------------
// photos
// ---------------------------------------------------------------------------

type PhotoPush = PhotoPushRecord;

interface StoredPhoto extends StoredRow {
  readonly tripId: string;
  readonly cityId: number | null;
  readonly isPublic: boolean;
}

@Injectable()
export class PhotosPushHandler implements PushTableHandler<PhotoPush, StoredPhoto> {
  readonly table = 'photos' as const;
  readonly schema = PhotoPushRecord;
  readonly creates = false;

  async lock(id: string): Promise<StoredPhoto | null> {
    const [row] = await rlsDb()
      .select({
        id: photos.id,
        updatedAt: photos.updatedAt,
        deletedAt: photos.deletedAt,
        tripId: photos.tripId,
        cityId: photos.cityId,
        isPublic: photos.isPublic,
      })
      .from(photos)
      .where(and(eq(photos.id, id), inOwnTrips(photos.tripId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(stored: StoredPhoto, incoming: PhotoPush): PhotoPush {
    return { ...incoming, trip_id: stored.tripId };
  }

  samePayload(stored: StoredPhoto, incoming: PhotoPush): boolean {
    return stored.cityId === incoming.city_id && stored.isPublic === incoming.is_public;
  }

  checkReferences(incoming: PhotoPush): Promise<void> {
    return requireKnownCity(incoming.city_id);
  }

  insert(): Promise<boolean> {
    return Promise.reject(
      new Error('A photo is registered by its upload, never pushed.'),
    );
  }

  async update(stored: StoredPhoto, incoming: PhotoPush, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(photos)
      .set({
        isPublic: incoming.is_public,
        cityId: incoming.city_id,
        updatedAt: at.updatedAt,
      })
      .where(and(eq(photos.id, stored.id), inOwnTrips(photos.tripId)));
  }

  async tombstone(stored: StoredPhoto, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(photos)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(photos.id, stored.id), inOwnTrips(photos.tripId)));
  }
}

// ---------------------------------------------------------------------------
// documents
// ---------------------------------------------------------------------------

type DocumentPush = DocumentPushRecord;

interface StoredDocument extends StoredRow {
  readonly tripId: string;
  readonly type: DocumentPush['type'];
  readonly wrappedDek: Buffer;
  readonly dekKeyId: string;
  readonly parsedSealed: Buffer | null;
  readonly parsedConfirmedAt: Date | null;
}

@Injectable()
export class DocumentsPushHandler implements PushTableHandler<
  DocumentPush,
  StoredDocument
> {
  readonly table = 'documents' as const;
  readonly schema = DocumentPushRecord;
  readonly creates = false;

  constructor(private readonly boardingPass: BoardingPassService) {}

  async lock(id: string): Promise<StoredDocument | null> {
    const [row] = await rlsDb()
      .select({
        id: documents.id,
        updatedAt: documents.updatedAt,
        deletedAt: documents.deletedAt,
        tripId: documents.tripId,
        type: documents.type,
        wrappedDek: documents.wrappedDek,
        dekKeyId: documents.dekKeyId,
        parsedSealed: documents.parsedSealed,
        parsedConfirmedAt: documents.parsedConfirmedAt,
      })
      .from(documents)
      .where(and(eq(documents.id, id), inOwnTrips(documents.tripId)))
      .limit(1)
      .for('update');

    return row ?? null;
  }

  effective(stored: StoredDocument, incoming: DocumentPush): DocumentPush {
    return { ...incoming, trip_id: stored.tripId };
  }

  samePayload(stored: StoredDocument, incoming: DocumentPush): boolean {
    return (
      stored.type === incoming.type &&
      sameInstant(stored.parsedConfirmedAt, incoming.parsed_confirmed_at) &&
      this.sameFields(stored, incoming)
    );
  }

  checkReferences(incoming: DocumentPush): Promise<void> {
    const hasFields = incoming.parsed_json !== null;
    const confirmsNothing = incoming.parsed_confirmed_at !== null && !hasFields;

    return fieldsBelongOn(incoming.type, hasFields) && !confirmsNothing
      ? Promise.resolve()
      : Promise.reject(new RecordRefusal('invalid'));
  }

  insert(): Promise<boolean> {
    return Promise.reject(
      new Error('A document is created by its upload, never pushed.'),
    );
  }

  async update(
    stored: StoredDocument,
    incoming: DocumentPush,
    at: WriteTimes,
  ): Promise<void> {
    const fieldsChanged = !this.sameFields(stored, incoming);

    await rlsDb()
      .update(documents)
      .set({
        type: incoming.type,
        ...(fieldsChanged && {
          parsedSealed: this.boardingPass.seal(stored, stored.id, incoming.parsed_json),
        }),
        parsedConfirmedAt:
          incoming.parsed_confirmed_at === null
            ? null
            : new Date(incoming.parsed_confirmed_at),
        updatedAt: at.updatedAt,
      })
      .where(and(eq(documents.id, stored.id), inOwnTrips(documents.tripId)));
  }

  async tombstone(stored: StoredDocument, at: WriteTimes): Promise<void> {
    await rlsDb()
      .update(documents)
      .set({ deletedAt: at.deletedAt, updatedAt: at.updatedAt })
      .where(and(eq(documents.id, stored.id), inOwnTrips(documents.tripId)));
  }

  /** The stored extracted fields, opened, against the incoming ones. */
  private sameFields(stored: StoredDocument, incoming: DocumentPush): boolean {
    const current = this.boardingPass.open(stored, stored.id, stored.parsedSealed);
    const next = incoming.parsed_json;

    if (current === null || next === null) return current === next;

    return (
      current.flight_number === next.flight_number &&
      current.flight_date === next.flight_date &&
      current.passenger_name === next.passenger_name
    );
  }
}
