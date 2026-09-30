import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { cities, countries } from './geography';
import { trips } from './trips';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

/**
 * Notes, photos, documents (data-model.md §4–5).
 */

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    /**
     * FR-017's three levels are one shape, not three tables: trip-level is
     * `city_id` null with the trip's sole country; country-level is `country_id`
     * set; city-level is both. FR-018 — moving between levels without losing the
     * body or the creation date — is then an UPDATE of two nullable keys.
     */
    countryId: smallint('country_id').references(() => countries.id),
    /**
     * References `cities` (permanent reference data), never `trip_stops`
     * (removable). Removing a stop leaves a note anchored to a real city instead
     * of orphaning or cascade-deleting it.
     */
    cityId: integer('city_id').references(() => cities.id),
    title: text('title'),
    body: text('body').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('notes_trip_id_idx').on(t.tripId),
    index('notes_updated_at_idx').on(t.updatedAt),
    check(
      'notes_anchor_check',
      sql`${t.countryId} IS NOT NULL OR ${t.cityId} IS NOT NULL`,
    ),
  ],
);

export const photos = pgTable(
  'photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    /** The traveller's filing. Independent of the EXIF columns below (FR-028). */
    cityId: integer('city_id').references(() => cities.id),
    /** Object key in a private bucket. Never a public URL. */
    storageKey: text('storage_key').notNull(),
    /** Written by the media worker once it has generated one (FR-030). */
    thumbKey: text('thumb_key'),
    takenAt: timestamp('taken_at', { withTimezone: true }),
    /**
     * As observed from EXIF (FR-029). Deliberately not reconciled against `cityId`:
     * when they disagree the mismatch is surfaced, not silently resolved
     * (Constitution IV).
     */
    exifLat: doublePrecision('exif_lat'),
    exifLng: doublePrecision('exif_lng'),
    isPublic: boolean('is_public').notNull().default(false),
    /**
     * FR-056. This column is read inside the RLS predicate, not in application
     * code — a photo that has not passed screening is unreachable publicly even if
     * every layer above the database is wrong about it.
     */
    moderationState: text('moderation_state').notNull().default('pending'),
    /**
     * FR-041. A record is not "saved" before its bytes arrive. Metadata syncs
     * through the normal path; the byte transfer is a separate queue, and a
     * pending photo renders with a pending treatment rather than a broken image.
     */
    uploadState: text('upload_state').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('photos_trip_id_idx').on(t.tripId),
    index('photos_updated_at_idx').on(t.updatedAt),
    // Partial: the moderation worker only ever asks for the pending ones.
    index('photos_pending_moderation_idx')
      .on(t.moderationState)
      .where(sql`${t.moderationState} = 'pending'`),
    check(
      'photos_moderation_state_check',
      sql`${t.moderationState} IN ('pending', 'approved', 'rejected')`,
    ),
    check(
      'photos_upload_state_check',
      sql`${t.uploadState} IN ('pending', 'uploaded', 'failed')`,
    ),
  ],
);

/**
 * Documents (data-model.md §5; 0011_us5_documents_sealed.sql).
 *
 * **Visibility posture: owner-only, structurally.** There is no `is_public`
 * column here and there is no public-read policy for this table (FR-032). The
 * guarantee is enforced by the absence of a mechanism rather than by a flag that
 * application code must remember to check. Adding either is a constitutional
 * violation (Principle I), not a feature.
 *
 * Nothing readable lives here either (FR-033, research D-32, D-33): the object
 * at `storage_key` is ciphertext, the key that opens it is wrapped, and the
 * extracted fields are sealed. The text-enum columns below type the values the
 * CHECK constraints admit; they change no SQL.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['boarding_pass', 'booking', 'other'] })
      .notNull()
      .default('other'),
    /** Object key of the CIPHERTEXT, in the private documents bucket. */
    storageKey: text('storage_key').notNull(),
    /** The image type the device sent, served back with the decrypted bytes (D-32). */
    contentType: text('content_type', { enum: ['image/jpeg', 'image/png'] }).notNull(),
    /** Plaintext size, for the list. The object is larger by a nonce and a tag. */
    byteSize: integer('byte_size').notNull(),
    /**
     * FR-033, envelope encryption. The per-row data key, wrapped by a master key
     * held as a Docker secret and never stored in PostgreSQL. A database dump
     * therefore yields wrapped keys that are inert on their own.
     */
    wrappedDek: bytea('wrapped_dek').notNull(),
    /** Which master key wrapped it, so keys can rotate without a re-encrypt sweep. */
    dekKeyId: text('dek_key_id').notNull(),
    /**
     * Extracted barcode fields (FR-035) — flight number, flight date, passenger
     * name — sealed under this row's own data key with the associated data
     * `<id>:parsed` (research D-33). Null when there are none: an unreadable
     * barcode is not an error state.
     */
    parsedSealed: bytea('parsed_sealed'),
    /**
     * Constitution IV. Distinguishes extracted-but-unconfirmed from
     * traveller-confirmed: unconfirmed extraction must never be presented as fact.
     */
    parsedConfirmedAt: timestamp('parsed_confirmed_at', { withTimezone: true }),
    uploadState: text('upload_state', { enum: ['pending', 'uploaded', 'failed'] })
      .notNull()
      .default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('documents_trip_id_idx').on(t.tripId),
    index('documents_updated_at_idx').on(t.updatedAt),
    check(
      'documents_type_check',
      sql`${t.type} IN ('boarding_pass', 'booking', 'other')`,
    ),
    check(
      'documents_upload_state_check',
      sql`${t.uploadState} IN ('pending', 'uploaded', 'failed')`,
    ),
    check(
      'documents_content_type_check',
      sql`${t.contentType} IN ('image/jpeg', 'image/png')`,
    ),
    check('documents_byte_size_check', sql`${t.byteSize} > 0`),
    check(
      'documents_parsed_boarding_pass_check',
      sql`${t.parsedSealed} IS NULL OR ${t.type} = 'boarding_pass'`,
    ),
    check(
      'documents_confirmed_has_fields_check',
      sql`${t.parsedConfirmedAt} IS NULL OR ${t.parsedSealed} IS NOT NULL`,
    ),
  ],
);
