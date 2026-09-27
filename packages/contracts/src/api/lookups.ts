import { z } from 'zod';

import { CityId, CountryId } from '../scalars';

/**
 * Reference geography (rest-api.md §11, data-model.md §1).
 *
 * Read-only for every traveller: nobody creates geography (FR-014). The mobile
 * app caches what it fetches into its local mirror so the city picker — and
 * therefore trip creation — works in aeroplane mode (data-model.md §10).
 */

export const Country = z.strictObject({
  id: CountryId,
  /** ISO 3166-1 alpha-2, upper case. */
  iso_code: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(1),
  continent: z.string().min(1),
});
export type Country = z.infer<typeof Country>;

export const City = z.strictObject({
  id: CityId,
  country_id: CountryId,
  /** Local name, as displayed. */
  name: z.string().min(1),
  /** Accent-stripped, as searched — "Zurich" finds "Zürich". */
  ascii_name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** IANA identifier, e.g. "Europe/Zurich". */
  timezone: z.string().min(1),
  /** Prominence ranking; larger sorts first (FR-014). */
  population: z.int().min(0),
});
export type City = z.infer<typeof City>;

export const CountriesResponse = z.strictObject({ countries: z.array(Country) });
export type CountriesResponse = z.infer<typeof CountriesResponse>;

/**
 * `GET /countries/:id/cities?q=&limit=`. The query is bounded on both axes so a
 * typed prefix can never turn into a full-table scan or a megabyte response.
 */
export const CitiesQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CitiesQuery = z.infer<typeof CitiesQuery>;

export const CitiesResponse = z.strictObject({ cities: z.array(City) });
export type CitiesResponse = z.infer<typeof CitiesResponse>;
