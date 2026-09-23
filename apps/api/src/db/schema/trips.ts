import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './accounts';
import { cities } from './geography';

/**
 * Trips and their stops (data-model.md §3).
 *
 * FR-085 — the group-travel seam: **nothing outside `trips` stores an `owner_id`.**
 * Every child record routes its ownership through `trip_id` alone. Introducing a
 * `trip_members` table later therefore changes the RLS predicates and nothing else;
 * no child table is restructured. Adding an owner column to a child table here
 * would quietly close that seam.
 */

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /**
     * FR-013 — derived, never user-set. Stored as a materialised cache for the globe
     * query and refreshed on write, but the read path recomputes from the stop date
     * range and does not trust this column if the two disagree. A trip whose dates
     * pass while the app is closed must not be stale.
     */
    status: text('status').notNull().default('planning'),
    isPublic: boolean('is_public').notNull().default(false),
    homeCurrency: char('home_currency', { length: 3 }).notNull(),
    /** FR-055. Nullable and un-referenced here to avoid a cycle with `photos`. */
    coverPhotoId: uuid('cover_photo_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Tombstone (FR-039). Frees an allowance slot immediately (FR-075). */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('trips_owner_id_idx').on(t.ownerId),
    // Partial: only public trips are ever scanned by discovery, and they are the
    // minority. Indexing the false rows would be indexing the whole table.
    index('trips_public_idx')
      .on(t.isPublic)
      .where(sql`${t.isPublic}`),
    // The sync cursor pages by updated_at (sync-protocol.md §1).
    index('trips_updated_at_idx').on(t.updatedAt),
    check('trips_status_check', sql`${t.status} IN ('planning', 'active', 'past')`),
  ],
);

export const tripStops = pgTable(
  'trip_stops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id),
    sortOrder: smallint('sort_order').notNull(),
    arriveDate: date('arrive_date').notNull(),
    departDate: date('depart_date').notNull(),
  },
  (t) => [
    index('trip_stops_trip_id_sort_idx').on(t.tripId, t.sortOrder),
    /**
     * FR-011, and the *only* date constraint on this table. Overlapping stop ranges
     * and wide gaps between them are legitimate itineraries — a traveller may
     * double-book a day or take three weeks off between legs — and rejecting them
     * would be the system overruling the traveller about their own trip.
     */
    check('trip_stops_date_order_check', sql`${t.departDate} >= ${t.arriveDate}`),
  ],
);
