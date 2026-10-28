/**
 * The steps of the first-run tour (feature 007, FR-003 and FR-004). Plain data: what each step
 * lights up (a registered target of the Home, or nothing) and the words on its card. At most
 * five, and short: the tour is informative, never a lecture.
 */

/** A control of the Home the tour can light. The Home registers each one (`useTourTarget`). */
export type TourTarget = 'totals' | 'plan-trip' | 'tab-trips' | 'tab-profile';

export interface TourStep {
  id: string;
  /** The control to light, or `null` for a centred card (step 4: no real trip exists yet). */
  target: TourTarget | null;
  title: string;
  body: string;
}

/** The most steps a tour may have (owner decision, 2026-10-24). */
export const MAX_TOUR_STEPS = 5;

export const TOUR_STEPS: readonly TourStep[] = Object.freeze([
  {
    id: 'globe',
    target: 'totals',
    title: 'Your globe',
    body: 'Every trip you take draws an arc on the globe. Your totals are here.',
  },
  {
    id: 'add-trip',
    target: 'plan-trip',
    title: 'Add a trip',
    body: 'Tap here, name the trip and add its first stop.',
  },
  {
    id: 'trips',
    target: 'tab-trips',
    title: 'Your trips',
    body: 'All your trips live here. Tap one to open it.',
  },
  {
    id: 'inside-a-trip',
    target: null,
    title: 'Inside a trip',
    body: 'A trip holds its stops, photos, spending, notes, documents and offline maps. Open its menu to edit or delete it.',
  },
  {
    id: 'you',
    target: 'tab-profile',
    title: 'You',
    body: 'Your passport and stamps are here, and you can replay this tour any time.',
  },
] as const);
