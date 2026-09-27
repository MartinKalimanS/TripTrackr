/**
 * FX snapshot refresh — tasks.md T206 (rest-api.md §11; research D-10, D-28).
 *
 * `GET /fx-rates` once a day through TanStack Query; every successful answer
 * replaces the local cache, which is what expenses convert from. The hook
 * never blocks a screen: when the API is unreachable the cached snapshot
 * stays in force and `offline: true` says so, and when the server has no
 * snapshot yet (503 `FX_RATES_UNAVAILABLE`) the device keeps whatever it
 * has. Auth failures are not masked — a `SESSION_EXPIRED` has already signed
 * the device out (as `use-geography.ts`).
 */
import { FxRatesResponse } from '@triptrackr/contracts';
import { useQuery } from '@tanstack/react-query';

import { useDatabase, type AppDatabase } from '@/db/client';
import { fxRatesRepository, type FxSnapshot } from '@/db/repositories/fx-rates';
import { ApiRequestError, apiFetch } from '@/lib/api-client';

export interface FxRatesResult {
  snapshot: FxSnapshot | null;
  /** The API could not be reached and `snapshot` is the last one cached. */
  offline: boolean;
}

/** A day: the feed itself updates once a day (research D-28). */
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

function isFallbackWorthy(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 0 || error.status >= 500);
}

export async function fetchFxRates(db: AppDatabase): Promise<FxRatesResult> {
  try {
    const response = await apiFetch(FxRatesResponse, '/fx-rates');
    fxRatesRepository.replaceSnapshot(db, response);
    return {
      snapshot: { asOf: response.as_of, source: response.source, rates: response.rates },
      offline: false,
    };
  } catch (error) {
    if (!isFallbackWorthy(error)) throw error;
    return { snapshot: fxRatesRepository.snapshot(db), offline: true };
  }
}

export function useFxRates() {
  const db = useDatabase();
  return useQuery({
    queryKey: ['fx-rates'],
    queryFn: () => fetchFxRates(db),
    staleTime: ONE_DAY_MS,
    gcTime: ONE_DAY_MS,
  });
}
