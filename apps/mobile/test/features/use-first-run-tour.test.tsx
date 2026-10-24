/**
 * Feature 007 (T704) - the hook that starts the tour by itself, once per traveller (FR-006).
 * The keychain is the in-memory stand-in of `jest.setup.ts`.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';

import { useFirstRunTour } from '@/features/tour/use-first-run-tour';
import { useTourStore } from '@/features/tour/tour-store';
import { hasSeenTour, markTourSeen } from '@/lib/secure-store';

const secureStore = SecureStore as unknown as { __reset: () => void };
const ANA = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';

beforeEach(() => {
  secureStore.__reset();
  useTourStore.setState({ open: false, step: 0 });
});

describe('useFirstRunTour', () => {
  test('starts the tour for a traveller with no trips who has not seen it', async () => {
    await renderHook(() => useFirstRunTour({ userId: ANA, tripCount: 0, loaded: true }));
    await waitFor(() => expect(useTourStore.getState().open).toBe(true));
  });

  test('waits for the trips to be read: nothing starts while they are loading', async () => {
    await renderHook(() => useFirstRunTour({ userId: ANA, tripCount: 0, loaded: false }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useTourStore.getState().open).toBe(false);
  });

  test('does nothing without a traveller', async () => {
    await renderHook(() => useFirstRunTour({ userId: null, tripCount: 0, loaded: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useTourStore.getState().open).toBe(false);
  });

  test('does not start it again for a traveller who has seen it', async () => {
    await markTourSeen(ANA);
    await renderHook(() => useFirstRunTour({ userId: ANA, tripCount: 0, loaded: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useTourStore.getState().open).toBe(false);
  });

  test('a traveller who already has trips gets no tour and is marked as having seen it', async () => {
    await renderHook(() => useFirstRunTour({ userId: ANA, tripCount: 3, loaded: true }));
    await waitFor(async () => expect(await hasSeenTour(ANA)).toBe(true));
    expect(useTourStore.getState().open).toBe(false);
  });

  test('decides once: a trip added during the tour does not restart or end it', async () => {
    const { rerender } = await renderHook(
      (props: { tripCount: number }) =>
        useFirstRunTour({ userId: ANA, tripCount: props.tripCount, loaded: true }),
      { initialProps: { tripCount: 0 } },
    );
    await waitFor(() => expect(useTourStore.getState().open).toBe(true));
    await rerender({ tripCount: 1 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(useTourStore.getState().open).toBe(true);
  });
});
