import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { geographyPoint } from './_types';
import { users } from './accounts';
import { cities } from './geography';
import { trips } from './trips';

/**
 * Planner (data-model.md §7).
 */

export const itineraryDays = pgTable(
  'itinerary_days',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    cityId: integer('city_id')
      .notNull()
      .references(() => cities.id),
    dayDate: date('day_date').notNull(),
  },
  (t) => [unique('itinerary_days_trip_date_key').on(t.tripId, t.dayDate)],
);

export const itineraryItems = pgTable(
  'itinerary_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    itineraryDayId: uuid('itinerary_day_id')
      .notNull()
      .references(() => itineraryDays.id, { onDelete: 'cascade' }),
    /** FR-066, FR-067. Reordering and moving between days is an UPDATE of these two. */
    sortOrder: smallint('sort_order').notNull(),
    placeName: text('place_name').notNull(),
    /**
     * **NOT NULL, and it comes from the geocoder — never from the model.**
     *
     * This is the schema-level expression of FR-065 and Constitution IV: a place
     * whose location cannot be confirmed has no row to insert, so an unverifiable
     * suggestion physically cannot reach the map. When every suggestion for a day
     * fails verification the result is an honest empty day, not a guessed one.
     */
    location: geographyPoint('location').notNull(),
    /** For re-lookup and de-duplication against a later suggestion. */
    mapboxPlaceId: text('mapbox_place_id'),
    source: text('source').notNull().default('ai_suggested'),
    note: text('note'),
  },
  (t) => [
    index('itinerary_items_day_sort_idx').on(t.itineraryDayId, t.sortOrder),
    index('itinerary_items_location_gist').using('gist', t.location),
    check(
      'itinerary_items_source_check',
      sql`${t.source} IN ('ai_suggested', 'user_added')`,
    ),
  ],
);

/**
 * Durable quota and audit record for planner generation.
 *
 * FR-069 needs a per-person daily limit that survives a restart. A Redis counter
 * alone forgets, and a forgotten quota is a quota that does not exist; Redis
 * serves the response cache (FR-070), this table serves the count.
 */
export const plannerRequests = pgTable(
  'planner_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cacheKey: text('cache_key').notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    status: text('status').notNull().default('pending'),
    costTokens: integer('cost_tokens').default(0),
  },
  (t) => [
    index('planner_requests_user_requested_idx').on(t.userId, t.requestedAt),
    check(
      'planner_requests_status_check',
      sql`${t.status} IN ('pending', 'succeeded', 'failed')`,
    ),
  ],
);
