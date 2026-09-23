import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import postgres from 'postgres';
import type { Sql } from 'postgres';

/**
 * GeoNames catalogue import (research D-11, FR-014).
 *
 * Travellers never create geography. Countries and cities are reference data,
 * imported from a GeoNames extract, and the two tables carry no RLS policy and no
 * `deleted_at` because there is no owner to police.
 *
 * Source files, both tab-separated, from https://download.geonames.org/export/dump/:
 *   countryInfo.txt  — one row per country, `#`-commented header
 *   cities15000.txt  — populated places above 15,000 inhabitants (~26k rows)
 *
 * Parsing is kept apart from loading so the column arithmetic below can be tested
 * without a database. GeoNames files are positional with no header row, so an
 * off-by-one silently loads longitude into a latitude column — a mistake that
 * produces a plausible-looking globe pointing at the wrong hemisphere rather than
 * an error.
 */

/** Column offsets in countryInfo.txt. */
const COUNTRY_COLUMNS = { iso: 0, name: 4, continent: 8 } as const;

/** Column offsets in cities*.txt. */
const CITY_COLUMNS = {
  geonameId: 0,
  name: 1,
  asciiName: 2,
  latitude: 4,
  longitude: 5,
  featureClass: 6,
  countryCode: 8,
  population: 14,
  timezone: 17,
} as const;

/** GeoNames abbreviates continents; the column is human-facing. */
const CONTINENTS: Readonly<Record<string, string>> = {
  AF: 'Africa',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
  AN: 'Antarctica',
};

/** Rows are inserted in batches of this size. */
const BATCH_SIZE = 1_000;

/** Bound parameters per city row; see {@link insertCityBatch}. */
const CITY_PARAM_COUNT = 8;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

export interface CountryRow {
  readonly isoCode: string;
  readonly name: string;
  readonly continent: string;
}

export interface CityRow {
  readonly geonameId: number;
  readonly name: string;
  readonly asciiName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly countryCode: string;
  readonly timezone: string;
  readonly population: number;
}

/**
 * Strips diacritics: `Zürich` becomes `Zurich`.
 *
 * NFD splits a precomposed character into its base letter plus a combining mark,
 * and every combining mark lives in one Unicode block, so removing that block
 * leaves the base letters behind. This is only the fallback — GeoNames supplies an
 * `asciiname` column and it is preferred — but that column is occasionally blank,
 * and a city with an empty `ascii_name` is a city the picker can never find
 * (FR-014).
 *
 * Note this transliterates in the Latin sense only. It does not romanise a name
 * written in another script; GeoNames' own `asciiname` does, which is the other
 * reason to prefer it.
 */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** One line of countryInfo.txt, or null for a comment or an unusable row. */
export function parseCountryLine(line: string): CountryRow | null {
  if (line.startsWith('#') || line.trim() === '') return null;

  const fields = line.split('\t');
  const isoCode = fields[COUNTRY_COLUMNS.iso]?.trim() ?? '';
  const name = fields[COUNTRY_COLUMNS.name]?.trim() ?? '';

  // A two-letter code and a name are the minimum for a usable row. GeoNames
  // carries a few entries with neither, and a country with no name is unpickable
  // rather than merely imperfect.
  if (isoCode.length !== 2 || name === '') return null;

  const code = fields[COUNTRY_COLUMNS.continent]?.trim() ?? '';

  return { isoCode, name, continent: CONTINENTS[code] ?? 'Unknown' };
}

/** One line of cities*.txt, or null if unusable. */
export function parseCityLine(line: string): CityRow | null {
  if (line.trim() === '') return null;

  const fields = line.split('\t');

  const geonameId = Number(fields[CITY_COLUMNS.geonameId]);
  const latitude = Number(fields[CITY_COLUMNS.latitude]);
  const longitude = Number(fields[CITY_COLUMNS.longitude]);
  const name = fields[CITY_COLUMNS.name]?.trim() ?? '';
  const countryCode = fields[CITY_COLUMNS.countryCode]?.trim() ?? '';
  const timezone = fields[CITY_COLUMNS.timezone]?.trim() ?? '';

  // `location` and `timezone` are NOT NULL, and coordinates outside these bounds
  // are a parse failure rather than a place — ST_MakePoint would accept them
  // happily and store a point that is nowhere.
  if (
    !Number.isFinite(geonameId) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > MAX_LATITUDE ||
    Math.abs(longitude) > MAX_LONGITUDE ||
    name === '' ||
    countryCode.length !== 2 ||
    timezone === ''
  ) {
    return null;
  }

  // Feature class P is "populated place". The city extracts should hold only
  // these, but the filter costs nothing and keeps an administrative region out of
  // the picker if a wider extract is ever used.
  if ((fields[CITY_COLUMNS.featureClass]?.trim() ?? 'P') !== 'P') return null;

  const asciiName = fields[CITY_COLUMNS.asciiName]?.trim() ?? '';
  const population = Number(fields[CITY_COLUMNS.population]);

  return {
    geonameId,
    name,
    asciiName: asciiName === '' ? stripAccents(name) : asciiName,
    latitude,
    longitude,
    countryCode,
    timezone,
    // Prominence ranking (FR-014). A missing population sorts last rather than
    // failing the row — an unranked city is still a findable one.
    population: Number.isFinite(population) ? population : 0,
  };
}

export interface ImportResult {
  readonly countries: number;
  readonly cities: number;
  readonly skipped: number;
}

export interface ImportOptions {
  readonly databaseUrl: string;
  readonly countryInfoPath: string;
  readonly citiesPath: string;
}

/**
 * Loads both files into `countries` and `cities`.
 *
 * Idempotent by upsert on the natural keys — `iso_code` for a country, the
 * GeoNames id for a city — so re-running against a refreshed extract updates
 * populations and names in place rather than duplicating the catalogue.
 *
 * That is not a nicety. GeoNames publishes monthly, and a city a traveller has
 * already selected must keep the same `cities.id` across an update or every
 * `trip_stops.city_id` pointing at it would refer to something else.
 */
export async function importGeoCatalogue(options: ImportOptions): Promise<ImportResult> {
  const sql = postgres(options.databaseUrl, { max: 1, onnotice: () => undefined });

  try {
    await ensureGeonameIdColumn(sql);

    const countries = await importCountries(sql, options.countryInfoPath);
    const { cities, skipped } = await importCities(sql, options.citiesPath);

    return { countries, cities, skipped };
  } finally {
    await sql.end();
  }
}

/**
 * Adds `cities.geoname_id`, the upstream identity.
 *
 * The schema deliberately keys cities on a local serial so that a row's identity
 * belongs to this system and survives a catalogue refresh. But without the
 * upstream key stored somewhere there is no way to tell an updated city from a new
 * one, and a re-import would insert 26,000 duplicates. The column is added here,
 * by the only thing that needs it, rather than in a migration — nothing in the
 * application reads it.
 */
async function ensureGeonameIdColumn(sql: Sql): Promise<void> {
  await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS geoname_id integer`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS cities_geoname_id_key
    ON cities (geoname_id) WHERE geoname_id IS NOT NULL
  `;
}

async function importCountries(sql: Sql, path: string): Promise<number> {
  const rows: CountryRow[] = [];

  for await (const line of readLines(path)) {
    const row = parseCountryLine(line);
    if (row) rows.push(row);
  }

  for (const batch of chunk(rows, BATCH_SIZE)) {
    await sql`
      INSERT INTO countries ${sql(
        batch.map((r) => ({ iso_code: r.isoCode, name: r.name, continent: r.continent })),
      )}
      ON CONFLICT (iso_code) DO UPDATE
        SET name = EXCLUDED.name, continent = EXCLUDED.continent
    `;
  }

  return rows.length;
}

async function importCities(
  sql: Sql,
  path: string,
): Promise<{ cities: number; skipped: number }> {
  // Resolved once for the whole run. Looking a country up per row would be ~26,000
  // extra round trips against a table with fewer than 300 rows in it.
  const countryIds = await loadCountryIds(sql);

  let batch: CityRow[] = [];
  let cities = 0;
  let skipped = 0;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;
    cities += await insertCityBatch(sql, batch, countryIds);
    batch = [];
  };

  for await (const line of readLines(path)) {
    const row = parseCityLine(line);

    if (!row) {
      if (line.trim() !== '') skipped += 1;
      continue;
    }

    // A city in a country the catalogue does not list cannot satisfy the foreign
    // key. Counted rather than thrown: GeoNames carries places in disputed and
    // dissolved territories, and one of them must not abort a 26,000-row load.
    if (!countryIds.has(row.countryCode)) {
      skipped += 1;
      continue;
    }

    batch.push(row);
    if (batch.length >= BATCH_SIZE) await flush();
  }

  await flush();

  return { cities, skipped };
}

async function loadCountryIds(sql: Sql): Promise<Map<string, number>> {
  const rows = await sql<{ id: number; iso_code: string }[]>`
    SELECT id, iso_code FROM countries
  `;

  // `iso_code` is CHAR(2) and comes back space-padded from some drivers; the
  // lookup key is the trimmed form the parser produces.
  return new Map(rows.map((r) => [r.iso_code.trim(), r.id]));
}

async function insertCityBatch(
  sql: Sql,
  batch: readonly CityRow[],
  countryIds: ReadonlyMap<string, number>,
): Promise<number> {
  // Assembled by hand because the tagged-template row helper cannot express a
  // function call in a value position, and `location` needs ST_MakePoint. Every
  // value is still a bound parameter — only the placeholder shape is built here,
  // and it is built from the batch length rather than from any file content.
  const values = batch
    .map((_, index) => {
      const p = index * CITY_PARAM_COUNT;
      return (
        `($${p + 1}, $${p + 2}, $${p + 3}, ` +
        `ST_SetSRID(ST_MakePoint($${p + 4}, $${p + 5}), 4326)::geography, ` +
        `$${p + 6}, $${p + 7}, $${p + 8})`
      );
    })
    .join(', ');

  const params = batch.flatMap((r) => [
    countryIds.get(r.countryCode) as number,
    r.name,
    r.asciiName,
    // Longitude first. ST_MakePoint takes (x, y) and x is longitude; reversing
    // them is the classic PostGIS error, and it yields coordinates that are
    // valid, plottable, and wrong.
    r.longitude,
    r.latitude,
    r.timezone,
    r.population,
    r.geonameId,
  ]);

  await sql.unsafe(
    `INSERT INTO cities (country_id, name, ascii_name, location, timezone, population, geoname_id)
     VALUES ${values}
     ON CONFLICT (geoname_id) WHERE geoname_id IS NOT NULL DO UPDATE
       SET name = EXCLUDED.name,
           ascii_name = EXCLUDED.ascii_name,
           location = EXCLUDED.location,
           timezone = EXCLUDED.timezone,
           population = EXCLUDED.population`,
    params,
  );

  return batch.length;
}

/**
 * Streams a file line by line.
 *
 * cities15000.txt is a few megabytes and cities500.txt is around thirty — both
 * readable whole, but streaming keeps the memory ceiling set by the batch size
 * rather than by whichever extract someone chose to point this at.
 */
async function* readLines(path: string): AsyncGenerator<string> {
  const stream = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of stream) yield line;
}

function* chunk<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}
