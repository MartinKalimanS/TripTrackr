import { z } from 'zod';

/**
 * The one error shape every endpoint returns (contracts/README.md).
 *
 * FR-072: human-readable, and free of internal detail. The object is strict so a
 * stack frame, a SQL fragment, or an upstream provider message cannot ride along
 * — those go to Sentry, not to the traveller.
 */
export const ApiError = z.strictObject({
  error: z.strictObject({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string().min(1),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
