import { sql } from 'drizzle-orm';
import {
  char,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  smallserial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { geographyPoint } from './_types';

/**
 * Reference geography (data-model.md §1).
 *
 * Visibility posture: **Reference**. Not traveller-owned, world-readable, never
 * written by a traveller. These two tables therefore carry no RLS policy and no
 * `deleted_at` — travellers never create geography (FR-014).
 *
 * Rows are imported from a GeoNames extract by infra/scripts/import-geo-catalogue.ts.
 */

export const countries = pgTable(
  'countries',
  {
    id: smallserial('id').primaryKey(),
    isoCode: char('iso_code', { length: 2 }).notNull(),
    name: text('name').notNull(),
    continent: text('continent').notNull(),
  },
  (t) => [uniqueIndex('countries_iso_code_key').on(t.isoCode)],
);

export const cities = pgTable(
  'cities',
  {
    id: serial('id').primaryKey(),
    countryId: smallint('country_id')
      .notNull()
      .references(() => countries.id),
    /** Local name, displayed to the traveller. */
    name: text('name').notNull(),
    /** Accent-stripped, searched — a traveller typing "Zurich" must find "Zürich" (FR-014). */
    asciiName: text('ascii_name').notNull(),
    location: geographyPoint('location').notNull(),
    /** IANA identifier, e.g. "Europe/Zurich". */
    timezone: text('timezone').notNull(),
    /** Prominence ranking, so "Paris" offers France before Texas (FR-014). */
    population: integer('population').default(0),
  },
  (t) => [
    index('cities_country_id_idx').on(t.countryId),
    // Spatial index: the globe queries cities by proximity and computes arc distances.
    index('cities_location_gist').using('gist', t.location),
    // Trigram index: substring and fuzzy matching for the city picker.
    index('cities_ascii_name_trgm').using('gin', sql`${t.asciiName} gin_trgm_ops`),
  ],
);
