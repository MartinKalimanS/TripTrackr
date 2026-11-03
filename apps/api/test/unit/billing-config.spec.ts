import { loadEnv, resetEnvCache } from '@/common/config/env.schema';

import { applyUnitTestEnv } from '../support/env';

/**
 * The paid-allowance configuration (spec 014, research D14-06, D14-09): the numbers and the product
 * map are configuration, never constants in code, and a bad value stops the process at boot.
 */
describe('billing configuration', () => {
  beforeEach(() => {
    applyUnitTestEnv();
    delete process.env.FREE_TRIP_ALLOWANCE;
    delete process.env.TIER1_YEARLY_TRIPS;
    delete process.env.BILLING_ENFORCED;
    delete process.env.BILLING_PRODUCTS;
    resetEnvCache();
  });
  afterAll(() => resetEnvCache());

  it('defaults to 3 free trips, 10 Tier 1 trips, charging off and no products', () => {
    const env = loadEnv();

    expect(env.FREE_TRIP_ALLOWANCE).toBe(3);
    expect(env.TIER1_YEARLY_TRIPS).toBe(10);
    expect(env.BILLING_ENFORCED).toBe(false);
    expect(env.BILLING_PRODUCTS).toEqual({});
  });

  it('reads charging as on only for the literal "true"', () => {
    process.env.BILLING_ENFORCED = 'true';
    resetEnvCache();
    expect(loadEnv().BILLING_ENFORCED).toBe(true);

    process.env.BILLING_ENFORCED = 'yes';
    resetEnvCache();
    expect(() => loadEnv()).toThrow(/BILLING_ENFORCED/);
  });

  it('parses the product map into kinds and ladder steps', () => {
    process.env.BILLING_PRODUCTS = JSON.stringify({
      single_trip: { kind: 'credit' },
      tier1_y1: { kind: 'tier1', step: 1 },
      unlimited_y3: { kind: 'unlimited', step: 3 },
    });
    resetEnvCache();

    expect(loadEnv().BILLING_PRODUCTS).toEqual({
      single_trip: { kind: 'credit' },
      tier1_y1: { kind: 'tier1', step: 1 },
      unlimited_y3: { kind: 'unlimited', step: 3 },
    });
  });

  it.each([
    ['not JSON', 'nope'],
    ['an unknown kind', JSON.stringify({ x: { kind: 'free' } })],
    ['a subscription without a step', JSON.stringify({ x: { kind: 'tier1' } })],
    ['a step out of range', JSON.stringify({ x: { kind: 'tier1', step: 4 } })],
    ['a credit with a step', JSON.stringify({ x: { kind: 'credit', step: 1 } })],
  ])('refuses a product map that is %s', (_label, value) => {
    process.env.BILLING_PRODUCTS = value;
    resetEnvCache();

    expect(() => loadEnv()).toThrow(/BILLING_PRODUCTS/);
  });
});
