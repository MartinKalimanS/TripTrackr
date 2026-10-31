/**
 * Spec 014 (S-12) - the paywall sheet. Pinned: the yearly plan of 10 is preselected, a row
 * can be chosen, ONE Continue buys the chosen row (nothing is bought by tapping a row), the
 * price is the store's string, and Restore and Not now are always there.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import PaywallScreen from '@/app/modal/paywall';

const mockBack = jest.fn();
const mockBuy = jest.fn();
const mockRestore = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('@/features/billing/use-paywall', () => ({
  usePaywall: () => ({
    status: 'idle',
    productsFailed: false,
    entitlement: { trips_held: 3, allowance: 3 },
    options: [
      {
        productId: 'credit_single',
        tier: 'credit',
        priceString: '$3.99',
        periodLabel: null,
        renews: false,
      },
      {
        productId: 'tier1_y1',
        tier: 'tier1',
        priceString: '$14.99',
        periodLabel: 'per year',
        renews: true,
      },
      {
        productId: 'unl_y1',
        tier: 'unlimited',
        priceString: '$29.99',
        periodLabel: 'per year',
        renews: true,
      },
    ],
    buy: mockBuy,
    restore: mockRestore,
  }),
}));

beforeEach(() => jest.clearAllMocks());

const selected = (tier: string) =>
  screen.getByTestId(`paywall-option-${tier}`).props.accessibilityState?.selected ===
  true;

test('preselects the yearly plan of 10 and draws the three rows with the store prices', async () => {
  await render(<PaywallScreen />);

  expect(selected('tier1')).toBe(true);
  expect(selected('credit')).toBe(false);
  expect(selected('unlimited')).toBe(false);
  expect(screen.getByText('$3.99')).toBeTruthy();
  expect(screen.getByText('$14.99 per year')).toBeTruthy();
  expect(screen.getByText('$29.99 per year')).toBeTruthy();
});

test('tapping a row selects it and buys nothing', async () => {
  await render(<PaywallScreen />);

  await fireEvent.press(screen.getByTestId('paywall-option-unlimited'));

  expect(selected('unlimited')).toBe(true);
  expect(selected('tier1')).toBe(false);
  expect(mockBuy).not.toHaveBeenCalled();
});

test('Continue buys the chosen row, and the preselected one when none was chosen', async () => {
  await render(<PaywallScreen />);

  await fireEvent.press(screen.getByTestId('paywall-save'));
  expect(mockBuy).toHaveBeenLastCalledWith('tier1_y1');

  await fireEvent.press(screen.getByTestId('paywall-option-credit'));
  await fireEvent.press(screen.getByTestId('paywall-save'));
  expect(mockBuy).toHaveBeenLastCalledWith('credit_single');
});

test('Restore purchases and Not now are always on screen', async () => {
  await render(<PaywallScreen />);

  await fireEvent.press(screen.getByTestId('paywall-restore'));
  expect(mockRestore).toHaveBeenCalledTimes(1);

  await fireEvent.press(screen.getByTestId('paywall-cancel'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('says renewal and that trips are never touched', async () => {
  await render(<PaywallScreen />);

  expect(screen.getByText(/renew automatically until you cancel/)).toBeTruthy();
  expect(screen.getByText(/always stay yours/)).toBeTruthy();
  expect(screen.getByTestId('paywall-cheaper')).toBeTruthy();
});
