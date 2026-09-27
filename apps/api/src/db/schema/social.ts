import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './accounts';

/**
 * Social (data-model.md §8).
 *
 * ⚠️ **Blocked on the sync gate.** Constitution II: these tables must not be
 * *used* by any story until the User Story 6 offline acceptance suite passes in
 * full (T141). They are defined here because the RLS migration in Phase 2 needs
 * `blocks` to exist — `is_blocked_between()` is referenced by the `trips` and
 * `users` public-read predicates, which US1 depends on.
 */

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** FR-058: 'accepted' immediately for a public profile, 'pending' for a private one. */
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'follows_pkey', columns: [t.followerId, t.followeeId] }),
    index('follows_followee_idx').on(t.followeeId),
    check('follows_not_self_check', sql`${t.followerId} <> ${t.followeeId}`),
    check('follows_status_check', sql`${t.status} IN ('pending', 'accepted')`),
  ],
);

/**
 * Blocks.
 *
 * FR-061 is enforced inside the RLS predicate for every public read, never as a
 * filter in a feed query. A block must hold on the profile route, the trip route,
 * the discovery route, and the feed route — one predicate covers all four, and
 * four separate filters would be four chances to miss one.
 */
export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'blocks_pkey', columns: [t.blockerId, t.blockedId] }),
    // is_blocked_between() checks both directions, so the reverse lookup needs an index.
    index('blocks_blocked_idx').on(t.blockedId),
    check('blocks_not_self_check', sql`${t.blockerId} <> ${t.blockedId}`),
  ],
);

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_status_idx').on(t.status),
    check(
      'reports_target_type_check',
      sql`${t.targetType} IN ('trip', 'note', 'photo', 'user')`,
    ),
    check(
      'reports_status_check',
      sql`${t.status} IN ('open', 'reviewed', 'dismissed', 'actioned')`,
    ),
  ],
);
