/**
 * Spec 014 (FR-013, FR-084) - the words for what the traveller holds. Pure: an entitlement and a
 * date formatter in, sentences out. Nothing says a trip is at risk.
 */
import type { EntitlementResponse } from '@triptrackr/contracts';

import { summarisePlan } from '@/features/billing/plan-summary';

const base: EntitlementResponse = {
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
const date = (iso: string) => `D(${iso.slice(0, 10)})`;
const END = '2027-03-01T10:00:00.000Z';

test('holding nothing is empty, with no period and no counts', () => {
  expect(summarisePlan(base, date)).toEqual({
    plan: 'No plan',
    period: null,
    usesLeft: null,
    credits: null,
    empty: true,
  });
});

test('an active yearly plan of 10 renews and counts the trips left', () => {
  const summary = summarisePlan(
    {
      ...base,
      tier: 'tier1',
      is_active: true,
      current_period_end: END,
      year_uses_left: 4,
    },
    date,
  );
  expect(summary.plan).toBe('Yearly: 10 trips');
  expect(summary.period).toBe('Renews on D(2027-03-01)');
  expect(summary.usesLeft).toBe('4 new trips left this year');
  expect(summary.empty).toBe(false);
});

test('a cancelled plan says it ends and will not renew', () => {
  const summary = summarisePlan(
    {
      ...base,
      tier: 'unlimited',
      is_active: true,
      current_period_end: END,
      cancel_at_period_end: true,
    },
    date,
  );
  expect(summary.plan).toBe('Yearly: unlimited');
  expect(summary.period).toBe('Ends on D(2027-03-01); it will not renew');
  expect(summary.usesLeft).toBeNull();
});

test('a lapsed plan says it ended and counts no trips', () => {
  const summary = summarisePlan(
    {
      ...base,
      tier: 'tier1',
      is_active: false,
      current_period_end: END,
      year_uses_left: 3,
    },
    date,
  );
  expect(summary.period).toBe('Ended on D(2027-03-01)');
  expect(summary.usesLeft).toBeNull();
});

test.each([
  [1, '1 trip credit left'],
  [3, '3 trip credits left'],
])('%i credit(s) read as "%s"', (credits, words) => {
  const summary = summarisePlan({ ...base, credits }, date);
  expect(summary.credits).toBe(words);
  expect(summary.empty).toBe(false);
});
