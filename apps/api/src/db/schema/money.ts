import {
  boolean,
  char,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './accounts';
import { cities } from './geography';
import { trips } from './trips';

/**
 * Money (data-model.md §6).
 */

export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Null means a system default row, world-readable. FR-024 requires a custom
     * category to be reusable across *all* of that traveller's trips, which is why
     * this scopes to the user and not to a trip.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon'),
    /**
     * Added 2026-09-23 (migration 0007). Custom categories are created offline at
     * the moment an expense needs them, so they are mirrored on the device and
     * synchronised ahead of `expenses` (sync-protocol.md §2, "parents before
     * children"). The tombstone exists for the same reason as on `trip_stops`.
     */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // NULLS NOT DISTINCT so the six seeded system rows cannot be duplicated:
    // by default PostgreSQL treats each NULL user_id as distinct, which would
    // permit a second "Food" system row.
    unique('expense_categories_user_name_key').on(t.userId, t.name).nullsNotDistinct(),
    index('expense_categories_updated_at_idx').on(t.updatedAt),
  ],
);

/**
 * Expenses.
 *
 * **Visibility posture: owner-only, structurally.** No `is_public` column exists
 * and no public-read policy is ever written for this table (FR-027). This is the
 * single most important property in the schema — there is nothing to set wrongly
 * and no policy that could return someone else's row. Adding a visibility column
 * here is a constitutional violation (Principle I), not a feature.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    cityId: integer('city_id').references(() => cities.id),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    /**
     * NUMERIC, never floating point — SC-016 requires totals to reconcile exactly.
     * Zero and negative amounts are permitted: a refund is an expense, so there is
     * deliberately no CHECK (amount > 0).
     */
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    /**
     * Nullable, against the original specification's NOT NULL. An expense logged
     * in a currency with no retrievable rate would otherwise force the app to
     * either block the entry or invent a rate, and both are wrong (FR-021).
     * Storing the rate on the row is also what makes FR-022 true: nothing
     * recomputes a historical conversion.
     */
    fxRateToHome: numeric('fx_rate_to_home', { precision: 14, scale: 6 }),
    amountHome: numeric('amount_home', { precision: 12, scale: 2 }),
    /** Backfilled when a rate arrives; totals disclose the pending amount (FR-026). */
    fxPending: boolean('fx_pending').notNull().default(false),
    spentAt: date('spent_at').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('expenses_trip_id_idx').on(t.tripId),
    index('expenses_trip_category_idx').on(t.tripId, t.categoryId),
    index('expenses_trip_spent_at_idx').on(t.tripId, t.spentAt),
    index('expenses_updated_at_idx').on(t.updatedAt),
  ],
);

/**
 * Daily FX snapshot.
 *
 * Visibility posture: Reference. Serving conversions from a local table rather
 * than a live call per entry keeps FR-020 fast, survives the provider being
 * briefly unavailable, and lets the device carry a recent snapshot so an expense
 * logged in aeroplane mode still converts.
 */
export const fxRates = pgTable(
  'fx_rates',
  {
    baseCurrency: char('base_currency', { length: 3 }).notNull(),
    quoteCurrency: char('quote_currency', { length: 3 }).notNull(),
    rate: numeric('rate', { precision: 14, scale: 6 }).notNull(),
    asOf: date('as_of').notNull(),
  },
  (t) => [
    primaryKey({
      name: 'fx_rates_pkey',
      columns: [t.baseCurrency, t.quoteCurrency, t.asOf],
    }),
    index('fx_rates_as_of_idx').on(t.asOf),
  ],
);
