/**
 * T132 — the small stores the engine fills for other screens (`sync/warnings.ts`),
 * plus the failure vocabulary and the cycle context they travel with.
 */
import { act, renderHook } from '@testing-library/react-native';

import { ApiRequestError } from '@/lib/api-client';
import { SyncAbortedError, assertCurrent } from '@/sync/context';
import { SyncContractError, classifyFailure } from '@/sync/failure';
import {
  useOverAllowanceTripIds,
  useParkedRecords,
  useSyncWarningsStore,
} from '@/sync/warnings';

import { TRIP, at, uuid } from './sync-core-fixtures';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  initSentry: jest.fn(),
}));

beforeEach(() => {
  useSyncWarningsStore.getState().reset();
});

describe('over-allowance warnings (Constitution V)', () => {
  test('flags a trip once, acknowledges it, and never holds two entries for one trip', () => {
    const { flagOverAllowance, acknowledgeOverAllowance } =
      useSyncWarningsStore.getState();
    flagOverAllowance(TRIP);
    flagOverAllowance(TRIP);
    flagOverAllowance(uuid(2));
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual([TRIP, uuid(2)]);
    acknowledgeOverAllowance(TRIP);
    expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual([uuid(2)]);
  });

  test('useOverAllowanceTripIds follows the store', async () => {
    const { result } = await renderHook(() => useOverAllowanceTripIds());
    expect(result.current).toEqual([]);
    await act(async () => useSyncWarningsStore.getState().flagOverAllowance(TRIP));
    expect(result.current).toEqual([TRIP]);
  });
});

describe('parked records', () => {
  const parked = {
    table: 'notes' as const,
    recordId: uuid(4),
    reason: 'invalid' as const,
    parkedAt: at(1),
  };

  test('setParked replaces the list and reset empties both lists', () => {
    const { setParked, flagOverAllowance, reset } = useSyncWarningsStore.getState();
    setParked([parked]);
    flagOverAllowance(TRIP);
    expect(useSyncWarningsStore.getState().parked).toEqual([parked]);
    reset();
    expect(useSyncWarningsStore.getState()).toMatchObject({
      parked: [],
      overAllowanceTripIds: [],
    });
  });

  test('useParkedRecords follows the store', async () => {
    const { result } = await renderHook(() => useParkedRecords());
    await act(async () => useSyncWarningsStore.getState().setParked([parked]));
    expect(result.current).toEqual([parked]);
  });
});

describe('classifyFailure (types.ts vocabulary)', () => {
  test.each([
    ['NETWORK', 'offline', new ApiRequestError(0, { code: 'NETWORK', message: 'm' })],
    ['TIMEOUT', 'offline', new ApiRequestError(0, { code: 'TIMEOUT', message: 'm' })],
    [
      '401',
      'unauthorized',
      new ApiRequestError(401, { code: 'UNAUTHORIZED', message: 'm' }),
    ],
    [
      'SESSION_EXPIRED',
      'unauthorized',
      new ApiRequestError(401, { code: 'SESSION_EXPIRED', message: 'm' }),
    ],
    [
      'INVALID_RESPONSE',
      'invalid_response',
      new ApiRequestError(200, { code: 'INVALID_RESPONSE', message: 'm' }),
    ],
    ['500', 'server', new ApiRequestError(500, { code: 'UNKNOWN', message: 'm' })],
    [
      'CONFIG (status 0, not a network fault)',
      'server',
      new ApiRequestError(0, { code: 'CONFIG', message: 'm' }),
    ],
    ['a contract error', 'invalid_response', new SyncContractError('bad page')],
    ['an abandoned cycle', 'unauthorized', new SyncAbortedError()],
    ['anything else', 'server', new Error('x')],
    ['a non-error', 'server', 'x'],
  ] as const)('%s is classified %s', (_label, failure, error) => {
    expect(classifyFailure(error)).toBe(failure);
  });

  test('the errors are named for logs', () => {
    expect(new SyncContractError('x').name).toBe('SyncContractError');
    expect(new SyncAbortedError().name).toBe('SyncAbortedError');
  });
});

describe('the cycle context', () => {
  test('assertCurrent passes while bound and throws SyncAbortedError once not', () => {
    let current = true;
    const ctx = { db: {} as never, isCurrent: () => current };
    expect(() => assertCurrent(ctx)).not.toThrow();
    current = false;
    expect(() => assertCurrent(ctx)).toThrow(SyncAbortedError);
  });
});
