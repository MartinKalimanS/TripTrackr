/**
 * The paywall's behaviour (spec 014, S-12): load the products the store sells, buy one, wait for the
 * server to confirm, and, when the sheet was opened for a flagged trip, cover that trip with what
 * was just bought. The store's answer never grants anything by itself; only the entitlement does.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EntitlementResponse } from '@triptrackr/contracts';
import { useCallback, useState } from 'react';

import { appPurchases, type Purchases } from '@/features/billing/purchases';
import { buildPaywall, CREDIT_PRODUCT_ID } from '@/features/billing/paywall-model';
import { waitForGrant } from '@/features/billing/purchase-flow';
import {
  ENTITLEMENT_KEY,
  useCoverTrip,
  useEntitlement,
} from '@/features/billing/use-entitlement';
import { apiFetch } from '@/lib/api-client';
import { Sentry } from '@/lib/sentry';

const WAIT = { attempts: 8, delayMs: 1_500 } as const;
const ALL_PRODUCTS = [
  CREDIT_PRODUCT_ID,
  'tier1_y1',
  'tier1_y2',
  'tier1_y3_plus',
  'unl_y1',
  'unl_y2',
  'unl_y3_plus',
] as const;

export type PaywallStatus = 'idle' | 'buying' | 'confirmed' | 'pending' | 'failed';

export function usePaywall(tripId: string | null, purchases: () => Purchases = appPurchases) {
  const client = useQueryClient();
  const { entitlement } = useEntitlement();
  const cover = useCoverTrip();
  const [status, setStatus] = useState<PaywallStatus>('idle');

  const products = useQuery({
    queryKey: ['paywall-products'],
    queryFn: () => purchases().loadProducts(ALL_PRODUCTS),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const options =
    entitlement && products.data ? buildPaywall(entitlement, products.data) : [];

  const buy = useCallback(
    async (productId: string) => {
      if (!entitlement || status === 'buying') return;
      setStatus('buying');
      try {
        const outcome = await purchases().purchase(productId);
        if (outcome.outcome === 'cancelled') return setStatus('idle');

        const result = await waitForGrant(
          () => apiFetch(EntitlementResponse, '/me/entitlement'),
          entitlement,
          WAIT,
        );
        await client.invalidateQueries({ queryKey: ENTITLEMENT_KEY });
        if (result === 'pending') return setStatus('pending');
        if (tripId) await cover.mutateAsync(tripId);
        setStatus('confirmed');
      } catch (error) {
        Sentry.captureException(error);
        setStatus('failed');
      }
    },
    [client, cover, entitlement, purchases, status, tripId],
  );

  const restore = useCallback(async () => {
    try {
      await purchases().restore();
      await client.invalidateQueries({ queryKey: ENTITLEMENT_KEY });
      setStatus('confirmed');
    } catch (error) {
      Sentry.captureException(error);
      setStatus('failed');
    }
  }, [client, purchases]);

  return {
    entitlement,
    options,
    status,
    productsFailed: products.isError,
    productsLoading: products.isLoading,
    buy,
    restore,
  };
}
