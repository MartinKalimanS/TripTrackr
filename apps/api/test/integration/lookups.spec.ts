import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiError, CitiesResponse, CountriesResponse } from '@triptrackr/contracts';
import request from 'supertest';

import { bootTestApp } from '../support/app';
import { migrationSql } from '../support/db';
import { CITY, COUNTRY, seedGeography } from '../support/geography';

/**
 * Reference lookups (rest-api.md §11, FR-014): country-filtered, typed,
 * accent-tolerant, ranked so well-known cities appear first.
 *
 * The fixture is built for the ranking claim specifically: two cities called
 * Paris — the French capital and the Texan town — and Parthenay, a small
 * French town sharing the `par` prefix. A search that ignored the country
 * filter would surface Texas; one that ignored prominence would put Parthenay
 * level with Paris.
 */
describe('lookups', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootTestApp();

    const sql = migrationSql();
    try {
      await seedGeography(sql);
    } finally {
      await sql.end();
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => request(app.getHttpServer());

  describe('GET /countries', () => {
    it('lists every country by name, needs no token, and is cacheable for a day', async () => {
      const response = await server().get('/v1/countries');

      expect(response.status).toBe(200);
      const { countries } = CountriesResponse.parse(response.body);

      const names = countries.map((c) => c.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      expect(countries.map((c) => c.iso_code)).toEqual(
        expect.arrayContaining(['CH', 'FR', 'JP', 'US']),
      );
      expect(response.headers['cache-control']).toBe('public, max-age=86400');
    });
  });

  describe('GET /countries/:id/cities', () => {
    it('ranks the well-known Paris first and never shows the one in another country', async () => {
      const response = await server().get(`/v1/countries/${COUNTRY.france}/cities?q=par`);

      expect(response.status).toBe(200);
      const { cities } = CitiesResponse.parse(response.body);

      expect(cities.map((c) => c.id)).toEqual([CITY.paris, CITY.parthenay]);
      expect(cities.map((c) => c.id)).not.toContain(CITY.parisTexas);
      expect(cities.every((c) => c.country_id === COUNTRY.france)).toBe(true);
    });

    it('finds Zürich when the traveller types without the umlaut', async () => {
      const response = await server().get(
        `/v1/countries/${COUNTRY.switzerland}/cities?q=zurich`,
      );

      const { cities } = CitiesResponse.parse(response.body);
      expect(cities[0]).toMatchObject({
        id: CITY.zurich,
        name: 'Zürich',
        ascii_name: 'Zurich',
      });
    });

    it('finds Zürich when the traveller types with the umlaut, too', async () => {
      // The catalogue stores the folded name; the query is folded the same way
      // before it reaches the database, so both spellings meet in the middle.
      const response = await server().get(
        `/v1/countries/${COUNTRY.switzerland}/cities?q=${encodeURIComponent('Zürich')}`,
      );

      const { cities } = CitiesResponse.parse(response.body);
      expect(cities.map((c) => c.id)).toEqual([CITY.zurich]);
    });

    it('tolerates a small typo through trigram similarity', async () => {
      const response = await server().get(
        `/v1/countries/${COUNTRY.japan}/cities?q=tokio`,
      );

      const { cities } = CitiesResponse.parse(response.body);
      expect(cities.map((c) => c.id)).toEqual([CITY.tokyo]);
    });

    it('lists the most populous cities when nothing has been typed yet', async () => {
      const response = await server().get(`/v1/countries/${COUNTRY.france}/cities`);

      const { cities } = CitiesResponse.parse(response.body);
      expect(cities.map((c) => c.id)).toEqual([CITY.paris, CITY.parthenay]);
    });

    it('returns coordinates as numbers the globe can place, with the timezone', async () => {
      const response = await server().get(`/v1/countries/${COUNTRY.japan}/cities`);

      const { cities } = CitiesResponse.parse(response.body);
      expect(cities[0]?.lat).toBeCloseTo(35.6895, 3);
      expect(cities[0]?.lng).toBeCloseTo(139.6917, 3);
      expect(cities[0]?.timezone).toBe('Asia/Tokyo');
      expect(cities[0]?.population).toBe(13_960_000);
    });

    it('honours the limit', async () => {
      const response = await server().get(
        `/v1/countries/${COUNTRY.france}/cities?limit=1`,
      );

      expect(CitiesResponse.parse(response.body).cities).toHaveLength(1);
    });

    it('refuses a query over 100 characters, a limit of 0, and a non-numeric country', async () => {
      const tooLong = await server().get(
        `/v1/countries/${COUNTRY.france}/cities?q=${'a'.repeat(101)}`,
      );
      const zeroLimit = await server().get(
        `/v1/countries/${COUNTRY.france}/cities?limit=0`,
      );
      const badCountry = await server().get('/v1/countries/france/cities');

      for (const response of [tooLong, zeroLimit, badCountry]) {
        expect(response.status).toBe(400);
        expect(ApiError.safeParse(response.body).success).toBe(true);
        expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
      }
    });

    it('answers an empty list for a country with no cities, not an error', async () => {
      const response = await server().get('/v1/countries/32000/cities?q=any');

      expect(response.status).toBe(200);
      expect(CitiesResponse.parse(response.body).cities).toEqual([]);
    });

    it('treats LIKE wildcards in the query as literal characters', async () => {
      // `%` would otherwise match every city in the country.
      const response = await server().get(
        `/v1/countries/${COUNTRY.france}/cities?q=${encodeURIComponent('%')}`,
      );

      expect(response.status).toBe(200);
      expect(CitiesResponse.parse(response.body).cities).toEqual([]);
    });
  });
});
