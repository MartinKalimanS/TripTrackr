import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { importGeoCatalogue } from '@/db/geo-catalogue';

import { ensureMigrated, migrationSql } from '../support/db';
import { requireEnv } from '../support/env';

/**
 * The GeoNames import against a real PostGIS (roadmap S-08; research D-11; FR-014).
 *
 * The parsers are unit-tested; this is the loader: that it fills `/countries` and the city
 * catalogue, that coordinates land longitude-first, that a city of an unlisted country is
 * skipped rather than aborting the load, and that running it again against a newer extract
 * updates rows in place and keeps `cities.id` stable, because a traveller's `trip_stops.city_id`
 * points at it. The extracts are the smallest that show those things.
 */
const COUNTRY_HEADER =
  '#ISO\tISO3\tISO-Numeric\tfips\tCountry\tCapital\tArea\tPopulation\tContinent';

function countryLine(iso: string, name: string, continent: string): string {
  return [iso, `${iso}X`, '000', iso, name, 'Capital', '1', '1', continent].join('\t');
}

function cityLine(
  id: number,
  name: string,
  ascii: string,
  lat: number,
  lon: number,
  country: string,
  population: number,
): string {
  const fields = new Array<string>(19).fill('');
  fields[0] = String(id);
  fields[1] = name;
  fields[2] = ascii;
  fields[4] = String(lat);
  fields[5] = String(lon);
  fields[6] = 'P';
  fields[7] = 'PPL';
  fields[8] = country;
  fields[14] = String(population);
  fields[17] = 'Europe/Zurich';
  return fields.join('\t');
}

describe('geo import', () => {
  let dir: string;
  const sql = migrationSql();

  const files = () => ({
    countryInfoPath: join(dir, 'countryInfo.txt'),
    citiesPath: join(dir, 'cities.txt'),
  });
  const run = () =>
    importGeoCatalogue({ databaseUrl: requireEnv('MIGRATION_DATABASE_URL'), ...files() });

  const write = async (cities: string[]) => {
    await writeFile(
      files().countryInfoPath,
      [COUNTRY_HEADER, countryLine('QA', 'Qatestland', 'EU')].join('\n'),
    );
    await writeFile(files().citiesPath, cities.join('\n'));
  };

  beforeAll(async () => {
    await ensureMigrated();
    dir = await mkdtemp(join(tmpdir(), 'geo-import-'));
  });

  afterAll(async () => {
    await sql`DELETE FROM cities WHERE geoname_id IN (990001, 990002)`;
    await sql`DELETE FROM countries WHERE iso_code = 'QA'`;
    await sql.end();
    await rm(dir, { recursive: true, force: true });
  });

  it('loads the country and its cities, longitude first, and skips an unlisted country', async () => {
    await write([
      cityLine(990001, 'Québec Test', 'Quebec Test', 46.8, -71.2, 'QA', 100_000),
      cityLine(990002, 'Zweistadt', 'Zweistadt', 47.4, 8.5, 'QA', 50_000),
      cityLine(990003, 'Nowhere', 'Nowhere', 1, 2, 'ZZ', 10),
    ]);

    const result = await run();

    expect(result).toMatchObject({ cities: 2, skipped: 1 });
    const [country] = await sql<{ name: string; continent: string }[]>`
      SELECT name, continent FROM countries WHERE iso_code = 'QA'
    `;
    expect(country).toEqual({ name: 'Qatestland', continent: 'Europe' });
    const [city] = await sql<{ lon: number; lat: number }[]>`
      SELECT ST_X(location::geometry) AS lon, ST_Y(location::geometry) AS lat
      FROM cities WHERE geoname_id = 990001
    `;
    expect(city).toEqual({ lon: -71.2, lat: 46.8 });
  });

  it('is idempotent: a newer extract updates in place and keeps the city ids', async () => {
    const before = await sql<{ geoname_id: number; id: number }[]>`
      SELECT geoname_id, id FROM cities WHERE geoname_id IN (990001, 990002) ORDER BY geoname_id
    `;
    await write([
      cityLine(990001, 'Québec Test', 'Quebec Test', 46.8, -71.2, 'QA', 250_000),
      cityLine(990002, 'Zweistadt', 'Zweistadt', 47.4, 8.5, 'QA', 50_000),
    ]);

    await run();

    const after = await sql<{ geoname_id: number; id: number; population: number }[]>`
      SELECT geoname_id, id, population FROM cities
      WHERE geoname_id IN (990001, 990002) ORDER BY geoname_id
    `;
    expect(after.map(({ id }) => id)).toEqual(before.map(({ id }) => id));
    expect(after[0]?.population).toBe(250_000);
    const [counted] = await sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM cities WHERE geoname_id IN (990001, 990002)
    `;
    expect(counted?.n).toBe('2');
  });
});
