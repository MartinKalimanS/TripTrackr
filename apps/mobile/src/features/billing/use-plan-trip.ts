/**
 * Where "Plan a trip" leads (spec 014; D-08, D-16). The create sheet itself never consults an
 * entitlement, so offline-first creation cannot be refused there; the entry points choose the route.
 * Only when the server has said the traveller is at the free limit with nothing to spend does the
 * button open the paywall; with no answer yet (offline, loading) it opens the form as always.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useEntitlement } from './use-entitlement';

export function usePlanTrip(): () => void {
  const router = useRouter();
  const { mustPayToCreate } = useEntitlement();
  return useCallback(
    () => router.push(mustPayToCreate ? '/modal/paywall' : '/modal/add-trip'),
    [router, mustPayToCreate],
  );
}
