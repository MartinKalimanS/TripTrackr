/**
 * When the first-run tour starts by itself (feature 007, FR-006): once per traveller on a device,
 * and only for a traveller with no trips. A traveller who already has trips (an account signed in
 * on a new phone, its first sync done) is marked as having seen it and gets no tour.
 */
export type AutoStart = 'start' | 'mark-seen' | 'none';

export function autoStartDecision({
  seen,
  tripCount,
}: {
  seen: boolean;
  tripCount: number;
}): AutoStart {
  if (seen) return 'none';
  return tripCount === 0 ? 'start' : 'mark-seen';
}
