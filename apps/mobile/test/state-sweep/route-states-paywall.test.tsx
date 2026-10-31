/**
 * Spec 014 (S-12) - the Paywall sheet owes the traveller what every state of every route owes
 * (FR-064; the state sweep): no control that does nothing, no coming-soon control out of place,
 * and at most one primary ("Continue"). States: the store has not answered yet (no rows), the
 * store failed, the purchase is on its way, and the purchase did not go through.
 */
import { render, screen } from '@testing-library/react-native';

import PaywallScreen from '@/app/modal/paywall';

import {
  deadControls,
  misroutedComingSoon,
  pressableCount,
  primaryControls,
} from '../helpers/dead-controls';

jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ show: jest.fn(), hide: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const OPTIONS = [
  { productId: 'credit_single', tier: 'credit', priceString: '$3.99', periodLabel: null },
  {
    productId: 'tier1_y1',
    tier: 'tier1',
    priceString: '$14.99',
    periodLabel: 'per year',
  },
];
const mockPaywall = {
  status: 'idle' as string,
  productsFailed: false,
  entitlement: { trips_held: 3, allowance: 3 } as unknown,
  options: OPTIONS as unknown[],
  buy: jest.fn(),
  restore: jest.fn(),
};
jest.mock('@/features/billing/use-paywall', () => ({ usePaywall: () => mockPaywall }));

beforeEach(() => {
  mockPaywall.status = 'idle';
  mockPaywall.productsFailed = false;
  mockPaywall.entitlement = { trips_held: 3, allowance: 3 };
  mockPaywall.options = OPTIONS;
});

function expectHealthy() {
  expect(pressableCount()).toBeGreaterThan(0);
  expect(deadControls()).toEqual([]);
  expect(misroutedComingSoon()).toEqual([]);
  expect(primaryControls().length).toBeLessThanOrEqual(1);
}

describe('The paywall sheet: no control is a dead end', () => {
  it('the plans: rows, "Continue" as the one primary, Restore and Not now', async () => {
    await render(<PaywallScreen />);
    expect(screen.getByTestId('paywall-screen')).toBeTruthy();
    expectHealthy();
  });

  it('the store has not answered: no rows, but Restore and Not now still work', async () => {
    mockPaywall.options = [];
    mockPaywall.entitlement = null;
    await render(<PaywallScreen />);
    expectHealthy();
  });

  it('the store failed: the words, and the same controls', async () => {
    mockPaywall.options = [];
    mockPaywall.productsFailed = true;
    await render(<PaywallScreen />);
    expect(screen.getByTestId('paywall-status')).toBeTruthy();
    expectHealthy();
  });

  it('the purchase is on its way: the words say so', async () => {
    mockPaywall.status = 'pending';
    await render(<PaywallScreen />);
    expect(screen.getByTestId('paywall-status')).toBeTruthy();
    expectHealthy();
  });

  it('the purchase did not go through: the words say nothing was charged', async () => {
    mockPaywall.status = 'failed';
    await render(<PaywallScreen />);
    expect(screen.getByText(/You have not been charged/)).toBeTruthy();
    expectHealthy();
  });
});
