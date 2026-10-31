/**
 * Keeps the store SDK's buyer equal to the signed-in traveller (spec 014, S-12). Mounted once, by
 * the root layout: it binds when a traveller is signed in and unbinds when they are not. A failure
 * is reported and leaves purchases disabled (the layer fails closed); it never blocks the app.
 */
import { useEffect } from 'react';

import { appPurchases, type Purchases } from '@/features/billing/purchases';
import { Sentry } from '@/lib/sentry';

export function usePurchasesIdentity(
  userId: string | null,
  purchases: () => Purchases = appPurchases,
): void {
  useEffect(() => {
    let layer: Purchases;
    try {
      layer = purchases();
    } catch (error) {
      Sentry.captureException(error);
      return;
    }
    if (!layer.isConfigured()) return;

    const task = userId === null ? layer.unbindIdentity() : layer.bindIdentity(userId);
    task.catch((error: unknown) => Sentry.captureException(error));
  }, [userId, purchases]);
}
