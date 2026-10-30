/**
 * Paid trip allowance contracts (spec 014; contracts/billing-api.md).
 *
 * The shapes are strict, and one rule is structural: while charging is off the entitlement answer
 * carries nothing a screen could draw (FR-026), so the app cannot show a price or a limit by accident.
 */
import {
  AllowanceRoute,
  CoverResponse,
  EntitlementResponse,
  TRIP_ALLOWANCE_REACHED,
  TripAllowanceDetails,
} from '../src';

const REFUSAL = {
  trips_held: 3,
  allowance: 3,
  year_uses_left: 0,
  credits: 0,
  routes: ['buy_trip', 'subscribe', 'delete_trip'],
  submitted: { title: 'Lisbon in March', home_currency: 'CHF' },
};

const OFF = {
  charging_enabled: false,
  tier: null,
  is_active: false,
  current_period_end: null,
  cancel_at_period_end: false,
  year_uses_left: 0,
  credits: 0,
  trips_held: 0,
  allowance: 0,
  years_subscribed: 0,
  next_product_id: null,
};

const TIER1 = {
  charging_enabled: true,
  tier: 'tier1',
  is_active: true,
  current_period_end: '2027-10-30T00:00:00.000Z',
  cancel_at_period_end: false,
  year_uses_left: 7,
  credits: 2,
  trips_held: 3,
  allowance: 3,
  years_subscribed: 2,
  next_product_id: 'tier1_y3_plus',
};

describe('paid allowance contracts', () => {
  it('names the error code the app branches on', () => {
    expect(TRIP_ALLOWANCE_REACHED).toBe('TRIP_ALLOWANCE_REACHED');
  });

  it('offers three ways forward', () => {
    expect(AllowanceRoute.options).toEqual(['buy_trip', 'subscribe', 'delete_trip']);
  });

  describe('TripAllowanceDetails', () => {
    it('accepts the refusal with all three routes', () => {
      expect(TripAllowanceDetails.parse(REFUSAL)).toEqual(REFUSAL);
    });

    it.each([
      ['a missing route', { ...REFUSAL, routes: ['buy_trip', 'subscribe'] }],
      [
        'routes in another order',
        { ...REFUSAL, routes: ['subscribe', 'buy_trip', 'delete_trip'] },
      ],
      ['a negative count', { ...REFUSAL, credits: -1 }],
      ['an extra field', { ...REFUSAL, price: '4.99' }],
      ['a missing echo', { ...REFUSAL, submitted: undefined }],
    ])('refuses %s', (_label, body) => {
      expect(TripAllowanceDetails.safeParse(body).success).toBe(false);
    });
  });

  describe('EntitlementResponse', () => {
    it('accepts a Tier 1 traveller', () => {
      expect(EntitlementResponse.parse(TIER1)).toEqual(TIER1);
    });

    it('accepts charging off with nothing to draw', () => {
      expect(EntitlementResponse.parse(OFF)).toEqual(OFF);
    });

    it.each([
      ['a tier', { tier: 'tier1' }],
      ['an active flag', { is_active: true }],
      ['a credit count', { credits: 1 }],
      ['an allowance', { allowance: 3 }],
      ['a product to offer', { next_product_id: 'tier1_y1' }],
      ['a period end', { current_period_end: '2027-10-30T00:00:00.000Z' }],
    ])('refuses charging off with %s', (_label, extra) => {
      expect(EntitlementResponse.safeParse({ ...OFF, ...extra }).success).toBe(false);
    });

    it('refuses an unknown tier and an extra field', () => {
      expect(EntitlementResponse.safeParse({ ...TIER1, tier: 'gold' }).success).toBe(
        false,
      );
      expect(EntitlementResponse.safeParse({ ...TIER1, price: '14.99' }).success).toBe(
        false,
      );
    });
  });

  describe('CoverResponse', () => {
    it.each(['credit', 'year', 'unlimited', 'grandfathered'])('accepts %s', (source) => {
      expect(CoverResponse.parse({ source })).toEqual({ source });
    });

    it('refuses an unknown source and an extra field', () => {
      expect(CoverResponse.safeParse({ source: 'gift' }).success).toBe(false);
      expect(CoverResponse.safeParse({ source: 'credit', id: 'x' }).success).toBe(false);
    });
  });
});
