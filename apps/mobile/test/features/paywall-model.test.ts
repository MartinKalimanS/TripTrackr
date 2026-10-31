/**
 * Spec 014 (S-12) - what the paywall offers and how it waits for the server to confirm a purchase.
 * The store supplies every price and currency; the server decides which yearly step comes next.
 * The webhook, not the purchase call, is what grants, so the flow polls the entitlement.
 */
import type { EntitlementResponse } from '@triptrackr/contracts';

import { waitForGrant } from '@/features/billing/purchase-flow';
import { buildPaywall, type PaywallProduct } from '@/features/billing/paywall-model';

const standing: EntitlementResponse = {
  charging_enabled: true,
  tier: null,
  is_active: false,
  current_period_end: null,
  cancel_at_period_end: false,
  year_uses_left: 0,
  credits: 0,
  trips_held: 3,
  allowance: 3,
  years_subscribed: 0,
  next_product_id: null,
};

const product = (id: string, priceString: string): PaywallProduct => ({
  id,
  title: id,
  priceString,
  kind: id === 'credit_single' ? 'credit' : 'subscription',
});
const PRODUCTS = {
  credit_single: product('credit_single', '$3.99'),
  tier1_y1: product('tier1_y1', '$14.99'),
  tier1_y2: product('tier1_y2', '$12.99'),
  unl_y1: product('unl_y1', '$29.99'),
  unl_y2: product('unl_y2', '$24.99'),
};

describe('buildPaywall', () => {
  test('a first-time traveller is offered one trip, Tier 1 and Unlimited at the first step', () => {
    const options = buildPaywall(standing, PRODUCTS);

    expect(options.map((o) => o.productId)).toEqual([
      'credit_single',
      'tier1_y1',
      'unl_y1',
    ]);
    expect(options.map((o) => o.priceString)).toEqual(['$3.99', '$14.99', '$29.99']);
  });

  test('a returning subscriber is offered the next step the server names', () => {
    const options = buildPaywall(
      { ...standing, tier: 'tier1', is_active: true, next_product_id: 'tier1_y2' },
      PRODUCTS,
    );

    expect(options.find((o) => o.productId === 'tier1_y2')).toBeDefined();
    expect(options.find((o) => o.productId === 'tier1_y1')).toBeUndefined();
  });

  test('an option whose product the store did not return is left out, never invented', () => {
    const options = buildPaywall(standing, { credit_single: PRODUCTS.credit_single });

    expect(options.map((o) => o.productId)).toEqual(['credit_single']);
  });

  test('a subscription option states its period and that it renews', () => {
    const [, tier1] = buildPaywall(standing, PRODUCTS);

    expect(tier1?.periodLabel).toBe('per year');
    expect(tier1?.renews).toBe(true);
  });

  test('a single trip is a one-off, with no period and no renewal', () => {
    const [credit] = buildPaywall(standing, PRODUCTS);

    expect(credit?.periodLabel).toBeNull();
    expect(credit?.renews).toBe(false);
  });

  test('an active Unlimited subscriber is offered nothing to buy', () => {
    const options = buildPaywall(
      { ...standing, tier: 'unlimited', is_active: true },
      PRODUCTS,
    );

    expect(options).toEqual([]);
  });
});

describe('waitForGrant', () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  beforeEach(() => sleep.mockClear());

  test('a credit that appears is a grant', async () => {
    const read = jest
      .fn()
      .mockResolvedValueOnce(standing)
      .mockResolvedValueOnce({ ...standing, credits: 1 });

    const result = await waitForGrant(read, standing, { attempts: 5, delayMs: 1, sleep });

    expect(result).toBe('granted');
    expect(read).toHaveBeenCalledTimes(2);
  });

  test('a subscription that becomes active is a grant', async () => {
    const read = jest.fn().mockResolvedValue({
      ...standing,
      tier: 'tier1',
      is_active: true,
      year_uses_left: 10,
    });

    expect(await waitForGrant(read, standing, { attempts: 3, delayMs: 1, sleep })).toBe(
      'granted',
    );
  });

  test('nothing after every attempt is pending, not a failure: the webhook may be late', async () => {
    const read = jest.fn().mockResolvedValue(standing);

    expect(await waitForGrant(read, standing, { attempts: 3, delayMs: 1, sleep })).toBe(
      'pending',
    );
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test('a read that fails is retried and then reported as pending', async () => {
    const read = jest.fn().mockRejectedValue(new Error('offline'));

    expect(await waitForGrant(read, standing, { attempts: 2, delayMs: 1, sleep })).toBe(
      'pending',
    );
  });
});
