/**
 * Which stamps have already landed in this session (feature 005, F13; FR-060, FR-061; research
 * D5-14, D5-17; data-model section 11): a stamp earned in the last seven days comes down once
 * per session, so leaving the You tab and coming back, or switching the period, does not play it
 * again. Held in memory only: nothing is stored, and a new launch plays them again.
 */
const landed = new Set<string>();

const keyOf = (iso2: string, firstVisit: string): string => `${iso2}|${firstVisit}`;

export function hasLanded(iso2: string, firstVisit: string): boolean {
  return landed.has(keyOf(iso2, firstVisit));
}

export function markLanded(iso2: string, firstVisit: string): void {
  landed.add(keyOf(iso2, firstVisit));
}

/** For tests: a new session. */
export function resetLanded(): void {
  landed.clear();
}
