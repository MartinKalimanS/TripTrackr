/**
 * What the paywall offers (spec 014; FR-005 to FR-008, FR-013). Pure: the entitlement says what the
 * traveller holds and which yearly step comes next; the store says what each product costs. An
 * option whose product the store did not return is left out; a price is never invented.
 */
import type { EntitlementResponse } from '@triptrackr/contracts';

export interface PaywallProduct {
  readonly id: string;
  readonly title: string;
  readonly priceString: string;
  readonly kind: 'credit' | 'subscription';
}

export interface PaywallOption {
  readonly productId: string;
  readonly tier: 'credit' | 'tier1' | 'unlimited';
  readonly priceString: string;
  /** "per year" for a subscription; null for a one-off purchase. */
  readonly periodLabel: string | null;
  /** Whether the purchase renews on its own until cancelled. */
  readonly renews: boolean;
}

export const CREDIT_PRODUCT_ID = 'credit_single';
const FIRST_STEP = { tier1: 'tier1_y1', unlimited: 'unl_y1' } as const;

/** The first yearly product, or the step the server names for a plan the traveller already has. */
function yearlyProductId(
  standing: EntitlementResponse,
  tier: 'tier1' | 'unlimited',
): string {
  const next = standing.next_product_id;
  const sameTier = next !== null && (tier === 'tier1' ? /^tier1_/ : /^unl_/).test(next);
  return sameTier ? next : FIRST_STEP[tier];
}

export function buildPaywall(
  standing: EntitlementResponse,
  products: Readonly<Record<string, PaywallProduct | undefined>>,
): PaywallOption[] {
  if (standing.tier === 'unlimited' && standing.is_active) return [];

  const wanted: { tier: PaywallOption['tier']; productId: string }[] = [
    { tier: 'credit', productId: CREDIT_PRODUCT_ID },
    { tier: 'tier1', productId: yearlyProductId(standing, 'tier1') },
    { tier: 'unlimited', productId: yearlyProductId(standing, 'unlimited') },
  ];

  return wanted.flatMap(({ tier, productId }) => {
    const found = products[productId];
    if (!found) return [];
    const subscription = tier !== 'credit';
    return [
      {
        productId,
        tier,
        priceString: found.priceString,
        periodLabel: subscription ? 'per year' : null,
        renews: subscription,
      },
    ];
  });
}
