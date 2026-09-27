import type { Sql } from 'postgres';

/**
 * Reference geography for the database-backed suites.
 *
 * One seed, shared by the integration harness and the lookup specs, because
 * every Jest worker builds its fixture against the same container: two files
 * inventing their own ids for "Paris" would collide on the primary key or,
 * worse, disagree about which city id 2 is. Fixed ids rather than generated
 * ones so a failing assertion names a constant a reader can grep for.
 *
 * Reference data is unpoliced by design (data-model.md §1) — a country's name
 * belongs to everyone — so it is seeded through the owner connection with no
 * session identity and no RLS to satisfy.
 */

export const COUNTRY = {
  switzerland: 1,
  france: 2,
  japan: 3,
  unitedStates: 4,
} as const;

export const CITY = {
  /** Zürich — accent-bearing on purpose, for the FR-014 folding tests. */
  zurich: 1,
  paris: 2,
  tokyo: 3,
  /**
   * Paris, Texas — same ascii name as the French capital, a fraction of the
   * population, and in another country. It proves the country filter and, with
   * Parthenay below, that prominence ranking is by population (FR-014).
   */
  parisTexas: 4,
  /** Parthenay — French, small, shares the `par` prefix with Paris. */
  parthenay: 5,
} as const;

/** Idempotent: `ON CONFLICT DO NOTHING`, then the sequences are resynchronised. */
export async function seedGeography(sql: Sql): Promise<void> {
  await sql`
    INSERT INTO countries (id, iso_code, name, continent) VALUES
      (${COUNTRY.switzerland}, 'CH', 'Switzerland', 'Europe'),
      (${COUNTRY.france}, 'FR', 'France', 'Europe'),
      (${COUNTRY.japan}, 'JP', 'Japan', 'Asia'),
      (${COUNTRY.unitedStates}, 'US', 'United States', 'North America')
    ON CONFLICT DO NOTHING
  `;

  await sql`
    INSERT INTO cities (id, country_id, name, ascii_name, location, timezone, population) VALUES
      (${CITY.zurich}, ${COUNTRY.switzerland}, 'Zürich', 'Zurich',
       ST_SetSRID(ST_MakePoint(8.5417, 47.3769), 4326)::geography, 'Europe/Zurich', 421878),
      (${CITY.paris}, ${COUNTRY.france}, 'Paris', 'Paris',
       ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography, 'Europe/Paris', 2148000),
      (${CITY.tokyo}, ${COUNTRY.japan}, 'Tokyo', 'Tokyo',
       ST_SetSRID(ST_MakePoint(139.6917, 35.6895), 4326)::geography, 'Asia/Tokyo', 13960000),
      (${CITY.parisTexas}, ${COUNTRY.unitedStates}, 'Paris', 'Paris',
       ST_SetSRID(ST_MakePoint(-95.5555, 33.6609), 4326)::geography, 'America/Chicago', 24171),
      (${CITY.parthenay}, ${COUNTRY.france}, 'Parthenay', 'Parthenay',
       ST_SetSRID(ST_MakePoint(-0.2469, 46.6486), 4326)::geography, 'Europe/Paris', 10187)
    ON CONFLICT DO NOTHING
  `;

  // serial columns do not advance when ids are supplied explicitly, so the next
  // insert from application code would collide on 1. Resynchronising here saves
  // every future spec from a failure that has nothing to do with what it tests.
  await sql`SELECT setval('cities_id_seq', (SELECT MAX(id) FROM cities))`;
  await sql`SELECT setval('countries_id_seq', (SELECT MAX(id) FROM countries))`;
}
