/**
 * What a new trip is paid for with (spec 014; FR-004, FR-005; research D14-04).
 *
 * A pure function over a snapshot of the traveller's standing, so the spending order is one readable
 * rule that can be tested without a database. The service takes the snapshot under the per-traveller
 * lock and the database guards (unique credit, year trigger) refuse anything this gets wrong.
 */
export type CoverSource = 'credit' | 'year' | 'unlimited';

/** An ordinary trip: it takes one of the free slots and carries no cover. */
export interface OrdinaryTrip {
  readonly kind: 'ordinary';
}

/** A covered trip: paid for by a credit, a Tier 1 use or an Unlimited year; it takes no free slot. */
export interface CoveredTrip {
  readonly kind: 'covered';
  readonly source: CoverSource;
  readonly periodId: string | null;
  readonly creditId: string | null;
}

export type CoverDecision = OrdinaryTrip | CoveredTrip;

export const ORDINARY: OrdinaryTrip = { kind: 'ordinary' };

/** The facts the order needs, read in one go. */
export interface Standing {
  /** Live trips with no cover: the ones that take a free slot. */
  readonly ordinaryHeld: number;
  /** An active, unrefunded Unlimited period, if any. */
  readonly unlimitedPeriodId: string | null;
  /** The active Tier 1 period with the earliest end that still has a use, if any. */
  readonly yearPeriodId: string | null;
  /** Uses left across every active Tier 1 period. */
  readonly yearUsesLeft: number;
  /** Unspent, unrefunded credits. */
  readonly credits: number;
  /** The oldest of them. */
  readonly oldestCreditId: string | null;
}

/**
 * Unlimited spends nothing and is tried first, so a trip made under it never takes a free slot and
 * stays covered after a lapse. Then a free slot, then a Tier 1 use (they expire), then a credit (they
 * never do). `null` means nothing can pay for the trip and the create is refused.
 */
export function chooseCover(standing: Standing, freeTrips: number): CoverDecision | null {
  if (standing.unlimitedPeriodId !== null) {
    return {
      kind: 'covered',
      source: 'unlimited',
      periodId: standing.unlimitedPeriodId,
      creditId: null,
    };
  }

  if (standing.ordinaryHeld < freeTrips) return ORDINARY;

  if (standing.yearPeriodId !== null) {
    return {
      kind: 'covered',
      source: 'year',
      periodId: standing.yearPeriodId,
      creditId: null,
    };
  }

  if (standing.oldestCreditId !== null) {
    return {
      kind: 'covered',
      source: 'credit',
      periodId: null,
      creditId: standing.oldestCreditId,
    };
  }

  return null;
}
