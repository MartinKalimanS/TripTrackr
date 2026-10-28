/**
 * Feature 007 (T702) - the first-run tour's logic: its steps, its small store and the rule that
 * starts it by itself once per traveller (FR-003 to FR-007). No screen here.
 */
import * as SecureStore from 'expo-secure-store';

import { hasSeenTour, markTourSeen } from '@/lib/secure-store';
import { MAX_TOUR_STEPS, TOUR_STEPS } from '@/features/tour/tour-steps';
import { autoStartDecision } from '@/features/tour/auto-start';
import { useTourStore } from '@/features/tour/tour-store';

const secureStore = SecureStore as unknown as { __reset: () => void };
const ANA = '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f';
const BEN = '0a9d8c7b-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

beforeEach(() => {
  secureStore.__reset();
  useTourStore.setState({ open: false, step: 0 });
});

describe('the steps (FR-003, FR-004)', () => {
  test('are at most five, and at least one', () => {
    expect(MAX_TOUR_STEPS).toBe(5);
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(1);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(MAX_TOUR_STEPS);
  });

  test('go: totals, add a trip, your trips, inside a trip, you', () => {
    expect(TOUR_STEPS.map((step) => step.target)).toEqual([
      'totals',
      'plan-trip',
      'tab-trips',
      null,
      'tab-profile',
    ]);
  });

  test('each has a title and a short body (one or two sentences, no wall of text)', () => {
    for (const step of TOUR_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.title.length).toBeLessThanOrEqual(30);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.body.length).toBeLessThanOrEqual(160);
    }
  });

  test('have unique ids', () => {
    expect(new Set(TOUR_STEPS.map((step) => step.id)).size).toBe(TOUR_STEPS.length);
  });
});

describe('the store (FR-003, FR-005, FR-007)', () => {
  test('starts closed, at the first step', () => {
    expect(useTourStore.getState()).toMatchObject({ open: false, step: 0 });
  });

  test('start opens it at step 1, even when it was left part-way before', () => {
    useTourStore.setState({ open: false, step: 3 });
    useTourStore.getState().start();
    expect(useTourStore.getState()).toMatchObject({ open: true, step: 0 });
  });

  test('next moves on one step at a time', () => {
    useTourStore.getState().start();
    useTourStore.getState().next();
    expect(useTourStore.getState().step).toBe(1);
  });

  test('next on the last step closes it (Done)', () => {
    useTourStore.getState().start();
    for (let i = 0; i < TOUR_STEPS.length; i += 1) useTourStore.getState().next();
    expect(useTourStore.getState().open).toBe(false);
  });

  test('close closes it from any step', () => {
    useTourStore.getState().start();
    useTourStore.getState().next();
    useTourStore.getState().close();
    expect(useTourStore.getState().open).toBe(false);
  });

  test('next and close while closed do nothing', () => {
    useTourStore.getState().next();
    useTourStore.getState().close();
    expect(useTourStore.getState()).toMatchObject({ open: false, step: 0 });
  });
});

describe('the seen flag, one per traveller on this device (FR-006)', () => {
  test('is unset until marked, then set for that traveller only', async () => {
    expect(await hasSeenTour(ANA)).toBe(false);
    await markTourSeen(ANA);
    expect(await hasSeenTour(ANA)).toBe(true);
    expect(await hasSeenTour(BEN)).toBe(false);
  });

  test('is kept under a key the keychain accepts (alphanumerics . - _ only)', async () => {
    await markTourSeen(ANA);
    const setItem = SecureStore.setItemAsync as jest.Mock;
    const key = setItem.mock.calls.at(-1)?.[0] as string;
    expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(key).toContain(ANA);
  });
});

describe('the auto-start rule (FR-006)', () => {
  test('a traveller with no trips who has not seen it starts the tour', () => {
    expect(autoStartDecision({ seen: false, tripCount: 0 })).toBe('start');
  });

  test('a traveller who has seen it is left alone, with or without trips', () => {
    expect(autoStartDecision({ seen: true, tripCount: 0 })).toBe('none');
    expect(autoStartDecision({ seen: true, tripCount: 4 })).toBe('none');
  });

  test('a traveller who already has trips is marked as having seen it, with no tour', () => {
    expect(autoStartDecision({ seen: false, tripCount: 1 })).toBe('mark-seen');
  });
});
