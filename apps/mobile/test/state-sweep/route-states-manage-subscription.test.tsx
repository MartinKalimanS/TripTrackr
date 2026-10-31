/**
 * Spec 014 (S-12) - the Plan and credits sheet owes the traveller what every state of every
 * route owes (FR-064; the state sweep): no control that does nothing, no coming-soon control out
 * of place, at most one primary ("Manage in store"). States: before the server answers, holding
 * nothing, and holding a plan.
 */
import { render, screen } from '@testing-library/react-native';

import ManageSubscriptionScreen from '@/app/modal/manage-subscription';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

const entitlement = jest.requireMock('@/features/billing/use-entitlement') as {
  useEntitlement: () => unknown;
};
const held = (patch: Record<string, unknown>) => ({
  entitlement: {
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
    ...patch,
  },
});

function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls().length).toBeLessThanOrEqual(1);
}

describe('The Plan and credits sheet: no control is a dead end', () => {
  it('before the server answers: words, the store button and Close', async () => {
    await render(<ManageSubscriptionScreen />);
    expect(screen.getByText('Loading your plan')).toBeTruthy();
    expectHealthy();
  });

  it('holding nothing: the words say so and the plans are offered', async () => {
    jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(held({}));
    await render(<ManageSubscriptionScreen />);
    expect(screen.getByTestId('manage-empty')).toBeTruthy();
    expectHealthy();
  });

  it('holding a plan: the plan, the renewal and the same controls', async () => {
    jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(
      held({
        tier: 'tier1',
        is_active: true,
        current_period_end: '2027-03-01T10:00:00.000Z',
        year_uses_left: 4,
      }),
    );
    await render(<ManageSubscriptionScreen />);
    expect(screen.getByTestId('manage-plan')).toBeTruthy();
    expectHealthy();
  });
});
