/**
 * Spec 014 (S-12) - `useEntitlement` and `useCoverTrip`. The API client is a double. Pinned: while
 * charging is off the hook says nothing a screen could draw (FR-026), the paywall options follow
 * what the traveller holds, and covering a trip is one POST that refreshes the entitlement.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import {
  evaluateStanding,
  useCoverTrip,
  useEntitlement,
} from '@/features/billing/use-entitlement';

jest.unmock('@/features/billing/use-entitlement');

jest.mock('@/lib/api-client', () => {
  const actual = jest.requireActual('@/lib/api-client');
  return { ...actual, apiFetch: jest.fn() };
});

const { apiFetch } = jest.requireMock('@/lib/api-client') as { apiFetch: jest.Mock };

const base = {
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
const quiet = {
  ...base,
  charging_enabled: false,
  trips_held: 0,
  allowance: 0,
};

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => apiFetch.mockReset());

describe('useEntitlement', () => {
  test('is silent while charging is off', async () => {
    apiFetch.mockResolvedValue(quiet);
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.showPaywallEntry).toBe(false);
    expect(result.current.atLimit).toBe(false);
  });

  test('is silent below the free number even when charging is on', async () => {
    apiFetch.mockResolvedValue({ ...base, trips_held: 2 });
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.atLimit).toBe(false);
  });

  test('is at the limit with nothing to spend', async () => {
    apiFetch.mockResolvedValue(base);
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.atLimit).toBe(true);
    expect(result.current.canCreateWithoutPaying).toBe(false);
    expect(result.current.mustPayToCreate).toBe(true);
  });

  test('never asks for payment before the entitlement is known (offline-first)', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });

    expect(result.current.mustPayToCreate).toBe(false);
  });

  test.each([
    ['a credit', { credits: 1 }],
    ['a year use', { year_uses_left: 4, tier: 'tier1', is_active: true }],
    ['Unlimited', { tier: 'unlimited', is_active: true }],
  ])('%s lets a trip be created at the limit', async (_name, patch) => {
    apiFetch.mockResolvedValue({ ...base, ...patch });
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.canCreateWithoutPaying).toBe(true);
    expect(result.current.mustPayToCreate).toBe(false);
  });
});

describe('useCoverTrip', () => {
  test('is one POST for the trip and then refreshes the entitlement', async () => {
    apiFetch.mockImplementation((_schema: unknown, path: string) =>
      Promise.resolve(path === '/me/entitlement' ? base : { source: 'credit' }),
    );
    const { result } = await renderHook(
      () => ({ cover: useCoverTrip(), entitlement: useEntitlement() }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.entitlement.isLoaded).toBe(true));
    apiFetch.mockClear();

    await act(async () => {
      await result.current.cover.mutateAsync('6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f');
    });

    const paths = apiFetch.mock.calls.map((call) => call[1] as string);
    expect(paths[0]).toBe('/trips/6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f/cover');
    expect(apiFetch.mock.calls[0]?.[2]).toEqual({ method: 'POST' });
    await waitFor(() => expect(paths).toContain('/me/entitlement'));
  });
});

describe('evaluateStanding', () => {
  test('counts trips made here that the server has not counted yet', () => {
    const held = { ...base, trips_held: 2 };
    expect(evaluateStanding(held, 0).mustPayToCreate).toBe(false);
    expect(evaluateStanding(held, 1).mustPayToCreate).toBe(true);
  });

  test('something to spend means no purchase first', () => {
    expect(evaluateStanding({ ...base, credits: 1 }, 0).mustPayToCreate).toBe(false);
    expect(evaluateStanding({ ...base, year_uses_left: 1 }, 0).mustPayToCreate).toBe(
      false,
    );
    expect(
      evaluateStanding({ ...base, tier: 'unlimited', is_active: true }, 2)
        .mustPayToCreate,
    ).toBe(false);
  });

  test('a credit the server has not spent yet is already promised to the trip over the limit', () => {
    // Three free trips plus a fourth that arrived over the limit and awaits its cover: the one
    // credit belongs to it, so a fifth trip needs a purchase.
    expect(
      evaluateStanding({ ...base, trips_held: 4, credits: 1 }, 0).mustPayToCreate,
    ).toBe(true);
  });

  test('a trip made here and not yet synced uses the credit as well', () => {
    expect(evaluateStanding({ ...base, credits: 1 }, 1).mustPayToCreate).toBe(true);
  });

  test('two credits cover two trips over the limit and no more', () => {
    const two = { ...base, credits: 2 };
    expect(evaluateStanding({ ...two, trips_held: 4 }, 0).mustPayToCreate).toBe(false);
    expect(evaluateStanding({ ...two, trips_held: 5 }, 0).mustPayToCreate).toBe(true);
  });

  test('year uses and credits are spent together', () => {
    const mixed = { ...base, year_uses_left: 1, credits: 1 };
    expect(evaluateStanding({ ...mixed, trips_held: 4 }, 0).mustPayToCreate).toBe(false);
    expect(evaluateStanding({ ...mixed, trips_held: 5 }, 0).mustPayToCreate).toBe(true);
  });

  test('says nothing without an answer or while charging is off', () => {
    expect(evaluateStanding(null, 9).mustPayToCreate).toBe(false);
    expect(evaluateStanding(undefined, 9).mustPayToCreate).toBe(false);
    expect(evaluateStanding(quiet, 9).mustPayToCreate).toBe(false);
  });
});

describe('settle', () => {
  test('asks the server again and answers from the fresh standing', async () => {
    apiFetch.mockResolvedValueOnce({ ...base, trips_held: 0 });
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    apiFetch.mockResolvedValueOnce({ ...base, trips_held: 3 });
    await expect(result.current.settle(0)).resolves.toBe(true);
  });

  test('falls back to the last answer when the server cannot be reached', async () => {
    apiFetch.mockResolvedValueOnce({ ...base, trips_held: 3 });
    const { result } = await renderHook(() => useEntitlement(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    apiFetch.mockRejectedValueOnce(new Error('network'));
    await expect(result.current.settle(0)).resolves.toBe(true);
  });
});
