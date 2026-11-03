import { z } from 'zod';

/**
 * The part of a RevenueCat webhook body we read (UNVERIFIED field names until the S-13 sandbox run;
 * the schema is lenient on everything we do not need so an added field never breaks delivery).
 */
export const RevenueCatWebhook = z.object({
  event: z.object({
    id: z.string().optional(),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
    product_id: z.string().optional(),
    store: z.string().optional(),
    transaction_id: z.string().optional(),
    original_transaction_id: z.string().optional(),
    purchased_at_ms: z.number().optional(),
    expiration_at_ms: z.number().nullish(),
    cancel_reason: z.string().optional(),
  }),
});
export type RevenueCatWebhook = z.infer<typeof RevenueCatWebhook>;
export type RevenueCatEvent = RevenueCatWebhook['event'];
