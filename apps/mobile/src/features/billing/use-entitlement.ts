/**
 * What the traveller holds, for the paywall and the settings row (spec 014; FR-013, FR-026, FR-084).
 *
 * Silent by construction: while charging is off the server answers with nothing a screen could draw,
 * and below the free number `atLimit` is false, so no screen mentions an allowance or a payment to a
 * traveller who has not reached it. The server stays the authority; this only reads its answer.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CoverResponse, EntitlementResponse } from '@triptrackr/contracts';

import { apiFetch } from '@/lib/api-client';

export const ENTITLEMENT_KEY = ['entitlement'] as const;

export function useEntitlement() {
  const query = useQuery({
    queryKey: ENTITLEMENT_KEY,
    queryFn: () => apiFetch(EntitlementResponse, '/me/entitlement'),
  });

  const data = query.data;
  const charging = data?.charging_enabled === true;
  const atLimit = charging && data.trips_held >= data.allowance;
  const canCreateWithoutPaying =
    !atLimit ||
    (data !== undefined &&
      (data.credits > 0 || data.year_uses_left > 0 || data.tier === 'unlimited'));

  return {
    entitlement: data ?? null,
    isLoaded: query.isSuccess,
    /** The traveller holds as many ordinary trips as the free number allows. */
    atLimit,
    /** A new trip would be covered by something they already hold, or they are below the limit. */
    canCreateWithoutPaying,
    /** Whether any screen may mention buying anything. False while charging is off. */
    showPaywallEntry: atLimit,
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
