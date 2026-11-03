/**
 * Spec 014 (S-12) - the root layout's identity binding. The traveller's id goes to the store SDK
 * when they sign in and the SDK is logged out when they leave; a failure is reported, not thrown.
 */
import { renderHook } from '@testing-library/react-native';

import type { Purchases } from '@/features/billing/purchases';
import { usePurchasesIdentity } from '@/features/billing/use-purchases-identity';

const mockCapture = jest.fn();
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: (error: unknown) => mockCapture(error) },
}));

const USER = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';

function fake(overrides: Partial<Purchases> = {}): jest.Mocked<Purchases> {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    bindIdentity: jest.fn().mockResolvedValue(undefined),
    unbindIdentity: jest.fn().mockResolvedValue(undefined),
    loadProducts: jest.fn(),
    purchase: jest.fn(),
    restore: jest.fn(),
    ...overrides,
  } as jest.Mocked<Purchases>;
}

beforeEach(() => mockCapture.mockReset());

describe('usePurchasesIdentity', () => {
  test('binds our user id when a traveller is signed in', async () => {
    const layer = fake();
    await renderHook(() => usePurchasesIdentity(USER, () => layer));

    expect(layer.bindIdentity).toHaveBeenCalledWith(USER);
    expect(layer.unbindIdentity).not.toHaveBeenCalled();
  });

  test('unbinds when nobody is signed in', async () => {
    const layer = fake();
    await renderHook(() => usePurchasesIdentity(null, () => layer));

    expect(layer.unbindIdentity).toHaveBeenCalledTimes(1);
    expect(layer.bindIdentity).not.toHaveBeenCalled();
  });

  test('does nothing without a store key for the platform', async () => {
    const layer = fake({ isConfigured: jest.fn().mockReturnValue(false) });
    await renderHook(() => usePurchasesIdentity(USER, () => layer));

    expect(layer.bindIdentity).not.toHaveBeenCalled();
  });

  test('a failed bind is reported and does not throw', async () => {
    const boom = new Error('store down');
    const layer = fake({ bindIdentity: jest.fn().mockRejectedValue(boom) });

    await renderHook(() => usePurchasesIdentity(USER, () => layer));
    await Promise.resolve();

    expect(mockCapture).toHaveBeenCalledWith(boom);
  });

  test('a layer that cannot even be created is reported', async () => {
    const boom = new Error('no native module');
    await renderHook(() =>
      usePurchasesIdentity(USER, () => {
        throw boom;
      }),
    );

    expect(mockCapture).toHaveBeenCalledWith(boom);
  });
});
