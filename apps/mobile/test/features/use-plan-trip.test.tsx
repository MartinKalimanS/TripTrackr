/**
 * Spec 014 (D-08, D-16) - "Plan a trip" opens the paywall only when a fresh look at the standing says
 * a purchase is needed first; otherwise (below the limit, something to spend, or no answer) the form.
 * The trips made on this device and not yet counted by the server are added to the server's count.
 */
import { renderHook, waitFor } from '@testing-library/react-native';

import { tripsRepository } from '@/db/repositories/trips';
import { usePlanTrip } from '@/features/billing/use-plan-trip';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockSettle = jest.fn();
jest.mock('@/features/billing/use-entitlement', () => ({
  useEntitlement: () => ({ settle: mockSettle }),
}));

const mockDb = {};
jest.mock('@/db/client', () => ({ useOptionalDatabase: () => mockDb }));

beforeEach(() => {
  mockPush.mockClear();
  mockSettle.mockReset();
  jest.spyOn(tripsRepository, 'countUnsynced').mockReturnValue(0);
});

afterEach(() => jest.restoreAllMocks());

test('opens the form when no purchase is needed', async () => {
  mockSettle.mockResolvedValue(false);
  const { result } = await renderHook(() => usePlanTrip());
  result.current();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/modal/add-trip'));
});

test('opens the paywall at the limit with nothing to spend', async () => {
  mockSettle.mockResolvedValue(true);
  const { result } = await renderHook(() => usePlanTrip());
  result.current();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/modal/paywall'));
});

test('hands the trips not yet pushed to the standing, so quick travellers are counted', async () => {
  jest.spyOn(tripsRepository, 'countUnsynced').mockReturnValue(2);
  mockSettle.mockResolvedValue(false);
  const { result } = await renderHook(() => usePlanTrip());
  result.current();
  await waitFor(() => expect(mockSettle).toHaveBeenCalledWith(2));
});
