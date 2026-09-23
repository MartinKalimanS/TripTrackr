import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './accounts';

/**
 * Commerce (data-model.md §9).
 *
 * A **cache of the store's truth**, refreshed by webhook. It holds no card data
 * of any kind (FR-081) — structurally so, since payment happens inside the
 * platform's own sheet and this system never sees a card field.
 *
 * ⚠️ This table is referenced by exactly one code path, `POST /trips`, and by
 * **no RLS policy**. That absence is the mechanism behind Constitution V and
 * FR-080: entitlement state cannot affect the visibility, retention, or
 * readability of anything a traveller recorded, because no read path can see it.
 * A join to this table from any read, list, or export path is a violation.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(false),
    /** FR-082 — the date the traveller is told, plainly. */
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    provider: text('provider'),
    /** RevenueCat app-user id. Not a payment identifier. */
    providerCustomerId: text('provider_customer_id'),
    entitlementSyncedAt: timestamp('entitlement_synced_at', { withTimezone: true }),
  },
  (t) => [
    check(
      'subscriptions_provider_check',
      sql`${t.provider} IS NULL OR ${t.provider} IN ('app_store', 'play_store')`,
    ),
  ],
);
