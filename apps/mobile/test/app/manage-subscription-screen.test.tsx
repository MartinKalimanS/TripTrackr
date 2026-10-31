/**
 * Spec 014 (S-12) - the Plan and credits sheet. Pinned: it words what the server says, offers
 * the store's own settings (it cannot cancel for the store), opens the paywall, and says trips
 * are never touched.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import ManageSubscriptionScreen from '@/app/modal/manage-subscription';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
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

beforeEach(() => jest.clearAllMocks());

test('words an active yearly plan, the trips left and the credits', async () => {
  jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(
    held({
      tier: 'tier1',
      is_active: true,
      current_period_end: '2027-03-01T10:00:00.000Z',
      year_uses_left: 4,
      credits: 2,
    }),
  );
  await render(<ManageSubscriptionScreen />);

  expect(screen.getByTestId('manage-plan')).toHaveTextContent('Yearly: 10 trips');
  expect(screen.getByTestId('manage-period').props.children).toMatch(/^Renews on /);
  expect(screen.getByText('4 new trips left this year')).toBeTruthy();
  expect(screen.getByText('2 trip credits left')).toBeTruthy();
});

test('holding nothing says so and offers the plans', async () => {
  jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(held({}));
  await render(<ManageSubscriptionScreen />);

  expect(screen.getByTestId('manage-empty')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('manage-see-plans'));
  expect(mockReplace).toHaveBeenCalledWith('/modal/paywall');
});

test('an active Unlimited plan has nothing more to buy', async () => {
  jest
    .spyOn(entitlement, 'useEntitlement')
    .mockReturnValue(held({ tier: 'unlimited', is_active: true }));
  await render(<ManageSubscriptionScreen />);

  expect(screen.queryByTestId('manage-see-plans')).toBeNull();
});

test('Manage in store opens the store settings, and Close goes back', async () => {
  jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(held({}));
  await render(<ManageSubscriptionScreen />);

  await fireEvent.press(screen.getByTestId('manage-subscription-save'));
  expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(
    expect.stringMatching(/subscriptions$/),
  );
  await fireEvent.press(screen.getByTestId('manage-subscription-cancel'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('says plans are cancelled in the store and that trips are never touched', async () => {
  jest.spyOn(entitlement, 'useEntitlement').mockReturnValue(held({}));
  await render(<ManageSubscriptionScreen />);

  expect(screen.getByText(/cancelled or changed in your store account/)).toBeTruthy();
  expect(screen.getByText(/always stay yours/)).toBeTruthy();
});
