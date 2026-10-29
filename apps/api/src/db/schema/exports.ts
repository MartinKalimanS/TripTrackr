import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './accounts';

/**
 * One row per "export my data" request (migration 0015; spec 009; FR-007). Owner-only, structurally:
 * `data_exports_owner_only` is its one policy, and the worker reads and writes it under the
 * traveller's own identity. `object_key` is `<userId>/exports/<id>.zip` in the documents bucket
 * while the archive exists.
 */
export const dataExports = pgTable(
  'data_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'ready', 'failed', 'expired'] })
      .notNull()
      .default('pending'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    objectKey: text('object_key'),
    byteSize: bigint('byte_size', { mode: 'number' }),
  },
  (t) => [
    index('data_exports_user_requested_idx').on(t.userId, t.requestedAt.desc()),
    check(
      'data_exports_ready_has_archive',
      sql`${t.status} <> 'ready' OR (${t.objectKey} IS NOT NULL AND ${t.expiresAt} IS NOT NULL)`,
    ),
  ],
);
