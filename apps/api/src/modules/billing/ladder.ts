import type { SubscriptionTier } from '@triptrackr/contracts';

import type { Env } from '@/common/config/env.schema';

/**
 * The yearly price ladder (spec 014, user story 6; research D14-09). The server never holds a price:
 * each tier has one store product per ladder step, and the app reads the price and currency of the
 * product it is shown from the store. This only says which product comes next.
 */
export const LADDER_FLOOR = 3;

type Products = Env['BILLING_PRODUCTS'];

/**
 * The product to offer for the next renewal of `tier`, given the step the traveller is on now.
 * Steps stop at the floor. A tier with no product at the next step falls back to the highest step
 * below it; a tier with no product at all gives `null`.
 */
export function nextProductId(
  products: Products,
  tier: SubscriptionTier,
  currentStep: number,
): string | null {
  const wanted = Math.min(Math.max(currentStep, 1) + 1, LADDER_FLOOR);

  const candidates = Object.entries(products)
    .flatMap(([id, product]) =>
      product.kind !== 'credit' && product.kind === tier && product.step <= wanted
        ? [{ id, step: product.step }]
        : [],
    )
    .sort((a, b) => b.step - a.step);

  return candidates[0]?.id ?? null;
}
