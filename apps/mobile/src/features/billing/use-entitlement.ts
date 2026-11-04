/**
 * What the traveller holds, for the paywall and the settings row (spec 014; FR-013, FR-026, FR-084).
 *
 * Silent by construction: while charging is off the server answers with nothing a screen could draw,
 * and below the free number `atLimit` is false, so no screen mentions an allowance or a payment to a
 * traveller who has not reached it. The server stays the authority; this only reads its answer.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { CoverResponse, EntitlementResponse } from '@triptrackr/contracts';

import { apiFetch } from '@/lib/api-client';

export const ENTITLEMENT_KEY = ['entitlement'] as const;

const fetchEntitlement = () => apiFetch(EntitlementResponse, '/me/entitlement');

/** How long a tap on "Plan a trip" waits for a fresh answer before using the last one. */
const FRESH_ANSWER_MS = 1500;

export type Standing = {
  atLimit: boolean;
  canCreateWithoutPaying: boolean;
  mustPayToCreate: boolean;
};

/**
 * Whether a new trip needs a purchase first. `unsynced` is the trips made on this device that the
 * server has not counted yet, so a traveller cannot get past the limit just by being quick.
 */
export function evaluateStanding(
  data: EntitlementResponse | null | undefined,
  unsynced = 0,
): Standing {
  const charging = data?.charging_enabled === true;
  const atLimit = charging && data.trips_held + unsynced >= data.allowance;
  const canCreateWithoutPaying =
    !atLimit ||
    (data !== null &&
      data !== undefined &&
      (data.credits > 0 || data.year_uses_left > 0 || data.tier === 'unlimited'));
  return {
    atLimit,
    canCreateWithoutPaying,
    mustPayToCreate: atLimit && !canCreateWithoutPaying,
  };
}

/** The server's answer now, or the last one we had when it is slow or unreachable. */
async function freshEntitlement(
  client: QueryClient,
): Promise<EntitlementResponse | undefined> {
  const timeout = new Promise<undefined>((resolve) =>
    setTimeout(() => resolve(undefined), FRESH_ANSWER_MS),
  );
  try {
    const fresh = await Promise.race([
      client.fetchQuery({
        queryKey: ENTITLEMENT_KEY,
        queryFn: fetchEntitlement,
        staleTime: 0,
      }),
      timeout,
    ]);
    return fresh ?? client.getQueryData<EntitlementResponse>(ENTITLEMENT_KEY);
  } catch {
    return client.getQueryData<EntitlementResponse>(ENTITLEMENT_KEY);
  }
}

export function useEntitlement() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ENTITLEMENT_KEY,
    queryFn: fetchEntitlement,
  });

  const data = query.data;
  const { atLimit, canCreateWithoutPaying, mustPayToCreate } = evaluateStanding(data);

  /** Asks the server again, then says whether a new trip needs a purchase. Never throws. */
  const settle = useCallback(
    async (unsynced = 0): Promise<boolean> =>
      evaluateStanding(await freshEntitlement(client), unsynced).mustPayToCreate,
    [client],
  );

  return {
    entitlement: data ?? null,
    isLoaded: query.isSuccess,
    /** The traveller holds as many ordinary trips as the free number allows. */
    atLimit,
    /** A new trip would be covered by something they already hold, or they are below the limit. */
    canCreateWithoutPaying,
    /** Whether any screen may mention buying anything. False while charging is off. */
    showPaywallEntry: atLimit,
    /** Creating a trip now needs a purchase first: at the limit with nothing to spend. */
    mustPayToCreate,
    settle,
    refetch: query.refetch,
  };
}

/** Covers a trip that arrived over the allowance (`POST /trips/:id/cover`), then re-reads the standing. */
export function useCoverTrip() {
  const client = useQueryClient();
  return useMutation({
    gcTime: 0,
    mutationFn: (tripId: string) =>
      apiFetch(CoverResponse, `/trips/${tripId}/cover`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ENTITLEMENT_KEY }),
  });
}
