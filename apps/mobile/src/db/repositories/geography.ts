/**
 * Geography cache — countries and cities (tasks.md T067; FR-014; data-model.md §10).
 *
 * Reference data flows ONE way: the lookups endpoints (rest-api.md §11) are
 * the source, this cache is what lets the city picker — and therefore trip
 * creation — work in aeroplane mode. Rows are upserted whenever the API
 * answers and never pushed. There is no `is_dirty` here because nothing in
 * these tables is the traveller's.
 *
 * Offline search mirrors the server's rule of thumb (FR-014): accent-tolerant
 * via `ascii_name`, ranked by population so well-known cities come first.
 */
import type { City, Country } from '@triptrackr/contracts';
import { and, asc, count, desc, eq, like, or, sql } from 'drizzle-orm';

import type { AppDatabase } from '@/db/client';
import { cities, countries, type CityRow, type CountryRow } from '@/db/schema';

import { chunk } from './shared';

/** Keeps each upsert well under SQLite's bound-parameter ceiling. */
const UPSERT_BATCH = 100;

export const CITY_SEARCH_LIMIT = 20;

/** "Zürich" → "Zurich": the same folding the server applies to `ascii_name`. */
export function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

function cacheCountries(db: AppDatabase, rows: readonly Country[]): void {
  if (rows.length === 0) return;
  db.transaction((tx) => {
    for (const batch of chunk(rows, UPSERT_BATCH)) {
      tx.insert(countries)
        .values(batch.map((row) => ({ ...row })))
        .onConflictDoUpdate({
          target: countries.id,
          set: {
            iso_code: sql`excluded.iso_code`,
            name: sql`excluded.name`,
            continent: sql`excluded.continent`,
          },
        })
        .run();
    }
  });
}

function cacheCities(db: AppDatabase, rows: readonly City[]): void {
  if (rows.length === 0) return;
  db.transaction((tx) => {
    for (const batch of chunk(rows, UPSERT_BATCH)) {
      tx.insert(cities)
        .values(batch.map((row) => ({ ...row })))
        .onConflictDoUpdate({
          target: cities.id,
          set: {
            country_id: sql`excluded.country_id`,
            name: sql`excluded.name`,
            ascii_name: sql`excluded.ascii_name`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            timezone: sql`excluded.timezone`,
            population: sql`excluded.population`,
          },
        })
        .run();
    }
  });
}

/** Every cached country, alphabetically. */
function listCountries(db: AppDatabase): CountryRow[] {
  return db.select().from(countries).orderBy(asc(countries.name)).all();
}

/**
 * Cached cities of one country whose name starts with — or has a word
 * starting with — the typed text, most populous first. An empty query lists
 * the country's best-known cities.
 */
function searchCities(db: AppDatabase, countryId: number, query: string): CityRow[] {
  const folded = foldAccents(query.trim());
  const byCountry = eq(cities.country_id, countryId);
  const where =
    folded.length === 0
      ? byCountry
      : and(
          byCountry,
          or(
            like(cities.ascii_name, `${folded}%`),
            like(cities.ascii_name, `% ${folded}%`),
          ),
        );

  return db
    .select()
    .from(cities)
    .where(where)
    .orderBy(desc(cities.population), asc(cities.ascii_name))
    .limit(CITY_SEARCH_LIMIT)
    .all();
}

/**
 * How many cities are cached. The value hardly matters: as a live query it
 * re-runs whenever the `cities` table changes, which is what tells a screen
 * whose own query joins `cities` — the globe — to re-read (`useLiveQuery`
 * subscribes to a query's FROM table only).
 */
function cityCountQuery(db: AppDatabase) {
  return db.select({ count: count() }).from(cities);
}

export const geographyRepository = {
  cacheCountries,
  cacheCities,
  listCountries,
  searchCities,
  cityCountQuery,
};
