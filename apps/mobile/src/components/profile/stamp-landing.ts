/**
 * Which stamps have already landed in this session (feature 005, F13; FR-060, FR-061; research
 * D5-14, D5-17; data-model section 11): a stamp earned in the last seven days comes down once
 * per session, so leaving the You tab and coming back, or switching the period, does not play it
 * again. Held in memory only: nothing is stored, and a new launch plays them again.
 *
 * Stamps that land together come one after another (`landingSlots`, newest first,
 * `LANDING_STAGGER_MS` apart), because every stamp has its own haptic and one buzz for three
 * thuds is not a landing (T558).
 */
import type { PassportStamp } from '@/features/passport/stamp-spec';

/** A landing waits this long after the one before it: past the 80 ms haptic window, so each is felt. */
export const LANDING_STAGGER_MS = 120;

const landed = new Set<string>();

const keyOf = (iso2: string, firstVisit: string): string => `${iso2}|${firstVisit}`;

export function hasLanded(iso2: string, firstVisit: string): boolean {
  return landed.has(keyOf(iso2, firstVisit));
}

export function markLanded(iso2: string, firstVisit: string): void {
  landed.add(keyOf(iso2, firstVisit));
}

/**
 * The place in the queue of each stamp that comes down now: earned in the last seven days and
 * not landed yet this session, numbered 0, 1, 2 in the order given (the page lists them newest
 * first). A stamp that is not in the map simply appears. A pure read: the page marks a stamp
 * landed once it is on the screen.
 */
export function landingSlots(
  stamps: readonly Pick<PassportStamp, 'key' | 'iso2' | 'firstVisit' | 'recent'>[],
): ReadonlyMap<string, number> {
  const slots = new Map<string, number>();
  for (const stamp of stamps) {
    if (stamp.recent && !hasLanded(stamp.iso2, stamp.firstVisit)) {
      slots.set(stamp.key, slots.size);
    }
  }
  return slots;
}

/** For tests: a new session. */
export function resetLanded(): void {
  landed.clear();
}
