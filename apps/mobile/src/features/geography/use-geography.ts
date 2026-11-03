/**
 * Geography lookups — tasks.md T067 (FR-014; rest-api.md §11; data-model.md §10).
 *
 * Countries and city search come from the API through TanStack Query, and
 * every answer is written into the local `countries` / `cities` cache. When
 * the API cannot be reached — offline, or a server failure the traveller can
 * do nothing about — the same hook answers from the cache and says so through
 * `offline: true`, so the picker can show "offline — showing saved places"
 * rather than an empty list (Constitution II).
 *
 * Auth failures are NOT masked by the cache: a `SESSION_EXPIRED` has already
 * signed the device out, and hiding that behind cached cities would be a lie.
 */
import {
  CitiesResponse,
  CountriesResponse,
  type City,
  type Country,
} from '@triptrackr/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDatabase, type AppDatabase } from '@/db/client';
import { geographyRepository } from '@/db/repositories/geography';
import { ApiRequestError, apiFetch } from '@/lib/api-client';

export interface GeographyResult<T> {
  items: T[];
  /** The API was unreachable and `items` came from the local cache. */
  offline: boolean;
}

/** Network down or server broken: fall back. Anything else is the caller's problem. */
function isFallbackWorthy(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 0 || error.status >= 500);
}

async function fetchCountries(db: AppDatabase): Promise<GeographyResult<Country>> {
  try {
    const { countries } = await apiFetch(CountriesResponse, '/countries', {
      auth: false,
    });
    geographyRepository.cacheCountries(db, countries);
    return { items: countries, offline: false };
  } catch (error) {
    if (!isFallbackWorthy(error)) throw error;
    return { items: geographyRepository.listCountries(db), offline: true };
  }
}

async function fetchCities(
  db: AppDatabase,
  countryId: number,
  query: string,
): Promise<GeographyResult<City>> {
  const params = new URLSearchParams({ limit: '20' });
  if (query.trim().length > 0) params.set('q', query.trim().slice(0, 100));
  try {
    const { cities } = await apiFetch(
      CitiesResponse,
      `/countries/${countryId}/cities?${params}`,
      {
        auth: false,
      },
    );
    geographyRepository.cacheCities(db, cities);
    return { items: cities, offline: false };
  } catch (error) {
    if (!isFallbackWorthy(error)) throw error;
    return {
      items: geographyRepository.searchCities(db, countryId, query),
      offline: true,
    };
  }
}

/** The cities the device saved for a country matching `query`; `undefined` when none. */
function savedCities(
  db: AppDatabase,
  countryId: number,
  query: string,
): GeographyResult<City> | undefined {
  const items = geographyRepository.searchCities(db, countryId, query);
  return items.length > 0 ? { items, offline: false } : undefined;
}

const COUNTRIES_STALE_MS = 24 * 60 * 60 * 1000;

/** What the device already holds, as an answer; `undefined` when it holds nothing yet. */
function savedCountries(db: AppDatabase): GeographyResult<Country> | undefined {
  const items = geographyRepository.listCountries(db);
  return items.length > 0 ? { items, offline: false } : undefined;
}

/**
 * `GET /countries` — "cached aggressively" (rest-api.md §11): a day is plenty. Local first:
 * the countries saved on the device are the first answer (the picker draws at once), and the
 * network refreshes them behind it. Only a device that has never fetched them waits.
 */
export function useCountries() {
  const db = useDatabase();
  return useQuery({
    queryKey: ['geography', 'countries'],
    queryFn: () => fetchCountries(db),
    staleTime: COUNTRIES_STALE_MS,
    initialData: () => savedCountries(db),
    initialDataUpdatedAt: 0,
  });
}

/**
 * `GET /countries/:id/cities?q=` for the debounced `query`. Disabled until a
 * country is chosen; an empty query still runs so the picker opens with the
 * country's best-known cities.
 */
export function useCitySearch(countryId: number | null, query: string) {
  const db = useDatabase();
  const trimmed = query.trim();
  return useQuery({
    queryKey: ['geography', 'cities', countryId, trimmed],
    queryFn: () => fetchCities(db, countryId!, trimmed),
    enabled: countryId !== null,
    staleTime: 60 * 60 * 1000,
    // The previous answer while typing, else what the device saved for this country.
    placeholderData: (previous) => previous ?? savedCities(db, countryId!, trimmed),
  });
}
