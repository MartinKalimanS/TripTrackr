/**
 * What the traveller holds, as sentences (spec 014; FR-013, FR-084): the plan, when it renews or
 * ends, the trips left in the year and the credits. Pure: the entitlement the server answered and
 * a date formatter go in, the words come out, so the screen draws and the test reads.
 *
 * Nothing here says a trip is at risk: a lapse only affects creating new ones.
 */
import type { EntitlementResponse } from '@triptrackr/contracts';

export type PlanSummary = {
  /** "Yearly: 10 trips", "Yearly: unlimited" or "No plan". */
  plan: string;
  /** When it renews, ends or ended; null with no plan. */
  period: string | null;
  /** "4 new trips left this year"; null unless a yearly plan of 10 is active. */
  usesLeft: string | null;
  /** "1 trip credit left"; null with none. */
  credits: string | null;
  /** The traveller holds nothing at all. */
  empty: boolean;
};

const PLAN_NAME = {
  tier1: 'Yearly: 10 trips',
  unlimited: 'Yearly: unlimited',
} as const;

export type DateFormatter = (iso: string) => string;

/** The local calendar day, in the phone's language. */
export const formatPlanDate: DateFormatter = (iso) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(iso));

function periodLine(
  entitlement: EntitlementResponse,
  formatDate: DateFormatter,
): string | null {
  const end = entitlement.current_period_end;
  if (!entitlement.tier || !end) return null;
  const date = formatDate(end);
  if (!entitlement.is_active) return `Ended on ${date}`;
  return entitlement.cancel_at_period_end
    ? `Ends on ${date}; it will not renew`
    : `Renews on ${date}`;
}

export function summarisePlan(
  entitlement: EntitlementResponse,
  formatDate: DateFormatter = formatPlanDate,
): PlanSummary {
  const active = entitlement.is_active && entitlement.tier === 'tier1';
  const credits =
    entitlement.credits > 0
      ? `${entitlement.credits} trip ${entitlement.credits === 1 ? 'credit' : 'credits'} left`
      : null;
  return {
    plan: entitlement.tier ? PLAN_NAME[entitlement.tier] : 'No plan',
    period: periodLine(entitlement, formatDate),
    usesLeft: active ? `${entitlement.year_uses_left} new trips left this year` : null,
    credits,
    empty: !entitlement.tier && !credits,
  };
}
