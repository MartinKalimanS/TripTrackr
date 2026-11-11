/**
 * Spec 014 (FR-022, FR-023) - the notice for trips that arrived past the allowance. Silent with
 * nothing flagged; with trips flagged it names a count (never a title), "See options" opens the
 * paywall for the first one, and "Later" only hides that trip's notice.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { OverAllowanceAlert } from '@/components/billing/over-allowance-alert';
import { useSyncWarningsStore } from '@/sync/warnings';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

beforeEach(() => {
  mockPush.mockClear();
  useSyncWarningsStore.getState().reset();
});

test('is silent when no trip is flagged', async () => {
  await render(<OverAllowanceAlert />);
  expect(screen.queryByTestId('over-allowance-alert')).toBeNull();
});

test('asks once for one flagged trip, in the singular', async () => {
  useSyncWarningsStore.getState().flagOverAllowance('trip-1');
  await render(<OverAllowanceAlert />);
  expect(screen.getByText('A trip needs covering')).toBeTruthy();
  expect(screen.getByText(/One trip was added past your free trips/)).toBeTruthy();
});

test('counts several flagged trips without naming any', async () => {
  useSyncWarningsStore.getState().flagOverAllowance('trip-1');
  useSyncWarningsStore.getState().flagOverAllowance('trip-2');
  await render(<OverAllowanceAlert />);
  expect(screen.getByText(/2 trips were added past your free trips/)).toBeTruthy();
});

test('See options opens the paywall for the first flagged trip', async () => {
  useSyncWarningsStore.getState().flagOverAllowance('trip-1');
  useSyncWarningsStore.getState().flagOverAllowance('trip-2');
  await render(<OverAllowanceAlert />);

  await fireEvent.press(screen.getByTestId('over-allowance-alert-action'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/modal/paywall',
    params: { tripId: 'trip-1' },
  });
});

test('Later hides that trip only, and the next one is asked about', async () => {
  useSyncWarningsStore.getState().flagOverAllowance('trip-1');
  useSyncWarningsStore.getState().flagOverAllowance('trip-2');
  await render(<OverAllowanceAlert />);

  await fireEvent.press(screen.getByTestId('over-allowance-alert-dismiss'));

  expect(useSyncWarningsStore.getState().overAllowanceTripIds).toEqual(['trip-2']);
  expect(screen.getByText(/One trip was added past your free trips/)).toBeTruthy();
  await act(async () => useSyncWarningsStore.getState().reset());
});

describe('on the trip itself (spec 015, T1505, FR-008)', () => {
  test('is silent on a trip that is not flagged, even when another one is', async () => {
    useSyncWarningsStore.getState().flagOverAllowance('trip-2');
    await render(<OverAllowanceAlert tripId="trip-1" />);
    expect(screen.queryByTestId('over-allowance-alert')).toBeNull();
  });

  test('speaks about this trip and opens the paywall for it', async () => {
    useSyncWarningsStore.getState().flagOverAllowance('trip-1');
    useSyncWarningsStore.getState().flagOverAllowance('trip-2');
    await render(<OverAllowanceAlert tripId="trip-2" />);

    expect(screen.getByText(/This trip was added past your free trips/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('over-allowance-alert-action'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modal/paywall',
      params: { tripId: 'trip-2' },
    });
  });
});
