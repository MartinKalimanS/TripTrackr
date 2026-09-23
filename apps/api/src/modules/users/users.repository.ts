import { HttpStatus, Injectable } from '@nestjs/common';
import type { PatchMeRequest, UserProfile } from '@triptrackr/contracts';
import { eq, sql } from 'drizzle-orm';

import { rlsDb } from '@/common/db/rls-db';
import { apiError } from '@/common/errors/api-error';
import { requireCurrentUserId } from '@/common/rls/rls-context';
import { users } from '@/db/schema';

/**
 * The columns a traveller sees of themselves — and, by omission, the ones they
 * never do. `password_hash` and `deletion_requested_at` are not selected here,
 * so they cannot reach a response by accident; `UserProfile` is strict and
 * `respond()` would refuse them anyway, but not selecting them is the first
 * line and the schema the second (contracts/api/auth.ts).
 */
const PROFILE_COLUMNS = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
  bio: users.bio,
  homeCurrency: users.homeCurrency,
  isProfilePublic: users.isProfilePublic,
  emailVerifiedAt: users.emailVerifiedAt,
  createdAt: users.createdAt,
};

type ProfileRow = Pick<typeof users.$inferSelect, keyof typeof PROFILE_COLUMNS>;

/**
 * Reads and writes of the traveller's own `users` row, through
 * `users_self_all` (0005) on the request transaction.
 *
 * There is no `findById(otherId)` here on purpose. A public profile view
 * (`GET /users/:id`, FR-061) is a different serialiser with a different column
 * list — `display_name`, `avatar_url`, `bio` and nothing else — and arrives
 * with the social story, behind the sync gate.
 */
@Injectable()
export class UsersRepository {
  /** The authenticated traveller's own profile. */
  async findOwnProfile(): Promise<UserProfile> {
    const userId = requireCurrentUserId();

    const [row] = await rlsDb()
      .select(PROFILE_COLUMNS)
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      // A valid access token for a row the policies no longer return: the
      // account was removed between the token being minted and now.
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in again.');
    }

    return toProfile(row);
  }

  /** FR-008 — the fields a traveller may set about themselves, nothing else. */
  async patchOwnProfile(patch: PatchMeRequest): Promise<UserProfile> {
    const userId = requireCurrentUserId();

    const [row] = await rlsDb()
      .update(users)
      .set({
        ...(patch.display_name !== undefined && { displayName: patch.display_name }),
        ...(patch.bio !== undefined && { bio: patch.bio }),
        ...(patch.avatar_url !== undefined && { avatarUrl: patch.avatar_url }),
        ...(patch.home_currency !== undefined && { homeCurrency: patch.home_currency }),
        ...(patch.is_profile_public !== undefined && {
          isProfilePublic: patch.is_profile_public,
        }),
        // The sync cursor. DB time, so it agrees with every other row written
        // in this transaction.
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, userId))
      .returning(PROFILE_COLUMNS);

    if (!row) {
      throw apiError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in again.');
    }

    return toProfile(row);
  }
}

/** Row → wire shape: snake_case, timestamps as ISO 8601 (contracts/scalars.ts). */
function toProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    display_name: row.displayName,
    avatar_url: row.avatarUrl,
    bio: row.bio,
    home_currency: row.homeCurrency,
    is_profile_public: row.isProfilePublic,
    email_verified_at: row.emailVerifiedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  };
}
