import { Injectable } from '@nestjs/common';
import type { CitiesQuery, City, Country } from '@triptrackr/contracts';

import { requireRlsTransaction } from '@/common/rls/rls-context';

import { escapeLikePattern, foldQuery } from './city-search';

/**
 * pg_trgm's own default for the `%` operator. Below it a match is mostly
 * coincidence; above it "tokio" still finds Tokyo. The prefix branch is what
 * answers a traveller who has typed one or two letters, so the threshold only
 * has to be right for typos.
 */
const SIMILARITY_THRESHOLD = 0.3;

interface CountryRow {
  readonly id: number;
  readonly iso_code: string;
  readonly name: string;
  readonly continent: string;
}

interface CityRow {
  readonly id: number;
  readonly country_id: number;
  readonly name: string;
  readonly ascii_name: string;
  readonly lat: number;
  readonly lng: number;
  readonly timezone: string;
  readonly population: number;
}

/**
 * Reference geography (rest-api.md §11; FR-014). Access rule: public.
 *
 * `countries` and `cities` carry no RLS policy — they are reference data, and a
 * country's name belongs to everyone (data-model.md §1). The queries still run
 * on the request transaction so a request touches one connection, and they run
 * without an identity, which is fine: nothing here fails closed because
 * nothing here is owned.
 */
@Injectable()
export class LookupsService {
  /** Every country, by name. */
  async countries(): Promise<Country[]> {
    const rows = await requireRlsTransaction()<CountryRow[]>`
      SELECT id, iso_code, name, continent
      FROM countries
      ORDER BY name, id
    `;

    return rows.map((row) => ({
      id: row.id,
      iso_code: row.iso_code.trim(),
      name: row.name,
      continent: row.continent,
    }));
  }

  /**
   * City autocomplete within a country.
   *
   * Two ways to match, ranked in that order: a prefix on the folded name — what
   * a traveller who has typed "zur" means — then trigram similarity for a typo
   * ("tokio"). Within each, prominence decides: `population DESC`, so "Paris"
   * offers the capital before a town that shares its prefix. With nothing typed
   * yet, the country's most populous cities.
   */
  async cities(countryId: number, query: CitiesQuery): Promise<City[]> {
    const rows = query.q
      ? await this.search(countryId, foldQuery(query.q), query.limit)
      : await this.prominent(countryId, query.limit);

    return rows.map(toCity);
  }

  private search(countryId: number, folded: string, limit: number): Promise<CityRow[]> {
    const prefix = `${escapeLikePattern(folded)}%`;

    return requireRlsTransaction()<CityRow[]>`
      SELECT id, country_id, name, ascii_name,
             ST_Y(location::geometry) AS lat,
             ST_X(location::geometry) AS lng,
             timezone,
             COALESCE(population, 0) AS population
      FROM cities
      WHERE country_id = ${countryId}::int
        AND (
          ascii_name ILIKE ${prefix} ESCAPE '\\'
          OR similarity(ascii_name, ${folded}) > ${SIMILARITY_THRESHOLD}::real
        )
      ORDER BY (ascii_name ILIKE ${prefix} ESCAPE '\\') DESC,
               COALESCE(population, 0) DESC,
               name, id
      LIMIT ${limit}
    `;
  }

  private prominent(countryId: number, limit: number): Promise<CityRow[]> {
    return requireRlsTransaction()<CityRow[]>`
      SELECT id, country_id, name, ascii_name,
             ST_Y(location::geometry) AS lat,
             ST_X(location::geometry) AS lng,
             timezone,
             COALESCE(population, 0) AS population
      FROM cities
      WHERE country_id = ${countryId}::int
      ORDER BY COALESCE(population, 0) DESC, name, id
      LIMIT ${limit}
    `;
  }
}

function toCity(row: CityRow): City {
  return {
    id: row.id,
    country_id: row.country_id,
    name: row.name,
    ascii_name: row.ascii_name,
    lat: row.lat,
    lng: row.lng,
    timezone: row.timezone,
    population: row.population,
  };
}
