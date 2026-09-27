import type { RateLimit } from '@/common/guards/rate-limit.guard';

/**
 * Ceilings on the three routes an attacker guesses against (FR-071;
 * rest-api.md §1: "limited per IP and per account identifier").
 *
 * Each has two buckets. The address bucket stops one caller hammering the
 * route; the account bucket stops a guess spread across many callers against
 * one email. The account bucket is the tighter of the two and has the longer
 * window, because that is the one that models the actual attack — a password
 * guessed at ten times a quarter-hour is a password that will not be guessed
 * — while the address bucket stays wide enough that a household or an office
 * behind one NAT is not locked out by a neighbour's typo.
 *
 * Exported as values rather than inlined in decorators so the contract suite
 * can drive the limiter to its ceiling without hard-coding a number that would
 * then drift from the one the route uses.
 */
export const AUTH_RATE_LIMITS = {
  login: {
    limit: 30,
    windowSeconds: 900,
    perIdentifier: { field: 'email', limit: 10, windowSeconds: 900 },
  },
  register: {
    limit: 20,
    windowSeconds: 3_600,
    perIdentifier: { field: 'email', limit: 5, windowSeconds: 3_600 },
  },
  passwordResetRequest: {
    limit: 10,
    windowSeconds: 3_600,
    perIdentifier: { field: 'email', limit: 3, windowSeconds: 3_600 },
  },
} as const satisfies Record<
  string,
  RateLimit & Required<Pick<RateLimit, 'perIdentifier'>>
>;
