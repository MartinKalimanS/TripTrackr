import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext } from './_types';

/**
 * Accounts (data-model.md §2).
 */

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: citext('email').notNull(),
    /** Null for an OAuth-only account — they never chose a password (FR-002). */
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    /** ISO 4217. Default currency for new trips (FR-009). */
    homeCurrency: char('home_currency', { length: 3 }).notNull().default('USD'),
    /** Private by default — a traveller opts in to being discoverable (FR-008, FR-052). */
    isProfilePublic: boolean('is_profile_public').notNull().default(false),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * FR-006. Set the moment deletion is requested; the RLS policy checks it, so the
     * profile and its trips stop being publicly reachable immediately rather than when
     * the storage sweep finishes.
     */
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    index('users_public_idx').on(t.isProfilePublic),
  ],
);

export const oauthIdentities = pgTable(
  'oauth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** 'google' | 'apple' — a CHECK constraint, not a convention (data-model.md §2). */
    provider: text('provider').notNull(),
    providerUid: text('provider_uid').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // FR-002: signing in with Google using an address that already has a password
    // account must attach an identity, not create a second account. This unique
    // pair is what lets the lookup happen before any insert is attempted.
    uniqueIndex('oauth_identities_provider_uid_key').on(t.provider, t.providerUid),
    index('oauth_identities_user_id_idx').on(t.userId),
    check('oauth_identities_provider_check', sql`${t.provider} IN ('google', 'apple')`),
  ],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The hash, never the raw token — a database dump must not yield usable sessions. */
    tokenHash: text('token_hash').notNull(),
    deviceInfo: text('device_info'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** FR-004: sign out here, or on every row for the user to sign out everywhere. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * FR-005. Set on the *retired* row and pointing forward at its successor
     * (data-model.md §2): presenting a token that has already been rotated means
     * the chain was stolen, and this is the link that lets the whole family be
     * revoked rather than just this one request rejected. Written by
     * `auth_insert_refresh_token` (0007) in the same statement as the successor.
     */
    replacedById: uuid('replaced_by_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('refresh_tokens_hash_key').on(t.tokenHash),
    index('refresh_tokens_user_id_idx').on(t.userId),
  ],
);
