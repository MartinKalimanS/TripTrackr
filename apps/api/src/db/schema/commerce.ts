import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

/**
 * Paid trip allowance (spec 014; data-model.md; migration 0016). Types only: the policies, grants,
 * checks and the `billing_*` keyholes are hand-written SQL, never Drizzle DSL.
 *
 * ⚠️ Like `subscriptions`, these tables are read by `modules/billing/` alone and by no RLS policy of
 * another table. A join from any read, list, export or sync path is a violation (Constitution V).
 */
export const tripCredits = pgTable('trip_credits', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  transactionId: text('transaction_id').notNull().unique(),
  productId: text('product_id').notNull(),
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull(),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
});

export const subscriptionPeriods = pgTable('subscription_periods', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  tier: text('tier').notNull(),
  ladderStep: integer('ladder_step').notNull(),
  originalTransactionId: text('original_transaction_id').notNull(),
  transactionId: text('transaction_id').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  usesTotal: integer('uses_total'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
});

/** The spend ledger. `tripId` has no foreign key on purpose: it must outlive the trip (D14-02). */
export const tripCovers = pgTable('trip_covers', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tripId: uuid('trip_id').notNull().unique(),
  source: text('source').notNull(),
  creditId: uuid('credit_id')
    .unique()
    .references(() => tripCredits.id),
  periodId: uuid('period_id').references(() => subscriptionPeriods.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const allowanceShadow = pgTable('allowance_shadow', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  firstBlockedAt: timestamp('first_blocked_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  attempts: integer('attempts').notNull().default(1),
});
