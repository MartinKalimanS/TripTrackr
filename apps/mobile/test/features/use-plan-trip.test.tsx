/**
 * Spec 014 (D-08, D-16) - "Plan a trip" opens the paywall only when the server has said a purchase
 * is needed first; otherwise (below the limit, something to spend, or no answer yet) the form.
 */
import { renderHook } from '@testing-library/react-native';

import { usePlanTrip } from '@/features/billing/use-plan-trip';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const entitlement = jest.requireMock('@/features/billing/use-entitlement') as {
  useEntitlement: () => unknown;
};

beforeEach(() => mockPush.mockClear());

test('opens the form when no purchase is needed', async () => {
  const { result } = await renderHook(() => usePlanTrip());
  result.current();
  expect(mockPush).toHaveBeenCalledWith('/modal/add-trip');
});

test('opens the paywall at the limit with nothing to spend', async () => {
  const spy = jest
    .spyOn(entitlement, 'useEntitlement')
    .mockReturnValue({ mustPayToCreate: true });
  const { result } = await renderHook(() => usePlanTrip());
  result.current();
  expect(mockPush).toHaveBeenCalledWith('/modal/paywall');
  spy.mockRestore();
});
