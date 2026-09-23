import { z } from 'zod';

/**
 * The one error shape every endpoint returns (contracts/README.md).
 *
 * FR-072: human-readable, and free of internal detail. The object is strict so a
 * stack frame, a SQL fragment, or an upstream provider message cannot ride along
 * — those go to Sentry, not to the traveller.
 *
 * `details` is the single sanctioned place for *structured* information the
 * client acts on rather than displays — the allowance 409 carries
 * `{ trips_held, allowance, routes }` so the paywall can be drawn without a
 * second request (rest-api.md §3, FR-079), and a 429 carries its retry window.
 * It is optional and its contents are endpoint-specific; it is never a channel
 * for internals.
 */
export const ApiError = z.strictObject({
  error: z.strictObject({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
