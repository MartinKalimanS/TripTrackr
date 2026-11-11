/**
 * Where "Plan a trip" leads (spec 014; D-08, D-16). The create sheet itself never consults an
 * entitlement, so offline-first creation cannot be refused there; the entry points choose the route.
 * On each tap it asks the server for the standing again and adds the trips made on this device that
 * the server has not counted yet; only when that says the traveller is at the free limit with
 * nothing to spend does the button open the paywall. With no answer (offline, slow) it uses the
 * last one, and with none at all it opens the form as always.
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { useOptionalDatabase } from '@/db/client';
import { tripsRepository } from '@/db/repositories/trips';

import { useEntitlement } from './use-entitlement';

export function usePlanTrip(): () => void {
  const router = useRouter();
  const db = useOptionalDatabase();
  const { settle } = useEntitlement();
  return useCallback(() => {
    const unsynced = db ? tripsRepository.countUnsynced(db) : 0;
    void settle(unsynced).then((mustPay) =>
      router.push(mustPay ? '/modal/paywall' : '/modal/add-trip'),
    );
  }, [router, db, settle]);
}
