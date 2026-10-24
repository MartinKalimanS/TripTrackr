/**
 * The first-run tour's state (feature 007, FR-003, FR-005, FR-007): is it open, and at which step.
 * Nothing here is persisted; "seen" is a keychain flag (`lib/secure-store.ts`) the layout writes
 * when the tour closes.
 */
import { create } from 'zustand';

import { TOUR_STEPS } from './tour-steps';

export interface TourState {
  open: boolean;
  /** Index into `TOUR_STEPS`. */
  step: number;
  /** Open the tour at its first step (also a replay from You). */
  start: () => void;
  /** The next step; on the last one this is Done and closes the tour. */
  next: () => void;
  /** Close it from any step (the X, Skip and the Android back button). */
  close: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
  open: false,
  step: 0,
  start: () => set({ open: true, step: 0 }),
  next: () => {
    const { open, step } = get();
    if (!open) return;
    if (step + 1 >= TOUR_STEPS.length) set({ open: false, step: 0 });
    else set({ step: step + 1 });
  },
  close: () => {
    if (get().open) set({ open: false, step: 0 });
  },
}));
