-- 0007_sync_tombstones_and_write_pinning.sql
--
-- Four corrections recorded on 2026-09-23, applied together because they were
-- found together and each is small on its own:
--
--   1. Sync columns for `trip_stops` and `expense_categories` (data-model.md §3,
--      §6; research D-16). Both are mirrored on the device and synchronised, and
--      a table with no `deleted_at` cannot propagate a deletion at all (FR-039).
--   2. `oauth_identities.provider` constrained by CHECK, not convention.
--   3. Write policies that pin the actor (contracts/data-access-policy.md §2,
--      "Write policies must pin the actor"). The scaffold's `follows` and
--      `expense_categories` policies were written with USING alone, which
--      doubles as WITH CHECK — correct where the tested column is the ownership
--      column, and wrong where a row names two parties or has a shared variant.
--   4. `refresh_tokens` and `subscriptions` become SELECT-only for the API
--      role, with writes confined to the SECURITY DEFINER functions, and the
--      refresh-token rotation is made atomic.
--
-- 0006 is left untouched; the functions it defined that change here are
-- replaced with CREATE OR REPLACE. Statements are idempotent where PostgreSQL
-- offers a form for it, and guarded where it does not, so a partially applied
-- run (impossible under the runner's transaction, but cheap to allow for) can
-- be re-run.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS
-- ---------------------------------------------------------------------------
--
-- Every `auth_*` function is SECURITY DEFINER and owned by the role running this
-- file. Under FORCE ROW LEVEL SECURITY (0004) a table owner is subject to its
-- own policies, and the policies key on a session variable that does not exist
-- when a traveller is signing in. The functions therefore work only because the
-- owner is a superuser or has BYPASSRLS — which is what the database's
-- bootstrap role is, and what MIGRATION_DATABASE_URL must name (research D-20).
-- Checked here so that a wrong role fails one migration with a sentence rather
-- than every login with "unrecognized configuration parameter".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER auth_* functions it owns are otherwise subject to FORCE '
      || 'ROW LEVEL SECURITY and no traveller could sign in. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Sync cursor and tombstone columns
-- ---------------------------------------------------------------------------
--
-- Same three columns, same index, as every other synchronised table (0002).
-- `DEFAULT now()` backfills the existing rows: a stop that predates this
-- migration reads as "updated now", so the next pull carries it, which is the
-- safe direction for a client whose mirror predates the column.
ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS trip_stops_updated_at_idx ON trip_stops (updated_at);

ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS expense_categories_updated_at_idx
  ON expense_categories (updated_at);

-- ---------------------------------------------------------------------------
-- 2. oauth_identities.provider
-- ---------------------------------------------------------------------------
--
-- data-model.md §2: `provider ∈ {google, apple}`, "enforced by a CHECK
-- constraint, not by convention". ADD CONSTRAINT has no IF NOT EXISTS form.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'oauth_identities_provider_check'
      AND conrelid = 'oauth_identities'::regclass
  ) THEN
    ALTER TABLE oauth_identities
      ADD CONSTRAINT oauth_identities_provider_check
      CHECK (provider IN ('google', 'apple'));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. current_user_id()
-- ---------------------------------------------------------------------------
--
-- The cast and the raise-when-unset behaviour, in one place. Deliberately calls
-- current_setting WITHOUT missing_ok: an unauthenticated request sets nothing,
-- the call raises, and the query fails closed (data-access-policy.md §1). A
-- default here would be a default for *who you are*.
--
-- Not SECURITY DEFINER — it reads the caller's own session — and simple enough
-- that the planner inlines it, so `pg_policies.qual` still resolves to the
-- same predicate the 0005 policies spell out by hand.
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $fn$
  SELECT current_setting('app.current_user_id')::uuid
$fn$;

GRANT EXECUTE ON FUNCTION current_user_id() TO triptrackr_api;

-- ---------------------------------------------------------------------------
-- 4. follows — request only as the follower, accept only as the followee
-- ---------------------------------------------------------------------------
--
-- Normative text: data-access-policy.md §2 "Write policies must pin the actor".
-- Under the single `follows_participant` policy, B could INSERT a row with
-- follower_id = A (a follow A never requested) or UPDATE a request addressed to
-- A to `accepted` (an approval A never gave), because being either party
-- satisfied USING and USING was the only check.
DROP POLICY IF EXISTS follows_participant ON follows;

DROP POLICY IF EXISTS follows_participant_read ON follows;
CREATE POLICY follows_participant_read ON follows FOR SELECT
  USING (follower_id = current_user_id() OR followee_id = current_user_id());

-- A request is created by its follower, and it is created pending. FR-058's
-- immediate acceptance for a public profile is the followee-side rule applied
-- by the service, not a state the follower may assert.
DROP POLICY IF EXISTS follows_follower_insert ON follows;
CREATE POLICY follows_follower_insert ON follows FOR INSERT
  WITH CHECK (follower_id = current_user_id() AND status = 'pending');

DROP POLICY IF EXISTS follows_followee_update ON follows;
CREATE POLICY follows_followee_update ON follows FOR UPDATE
  USING (followee_id = current_user_id())
  WITH CHECK (followee_id = current_user_id());

-- Either party may end the relationship: the follower by unfollowing, the
-- followee by removing a follower or declining a request.
DROP POLICY IF EXISTS follows_participant_delete ON follows;
CREATE POLICY follows_participant_delete ON follows FOR DELETE
  USING (follower_id = current_user_id() OR followee_id = current_user_id());

-- ---------------------------------------------------------------------------
-- 5. expense_categories — system rows read-only, custom rows owner-only
-- ---------------------------------------------------------------------------
--
-- Under `expense_categories_owner_or_default`, `user_id IS NULL` satisfied
-- USING, and therefore WITH CHECK, for everyone: any traveller could insert a
-- new "system" row every other traveller would see, or rename Food to
-- something else for the whole user base. The read stays shared; every write
-- is pinned to the caller, and a NULL user_id satisfies neither side of the
-- write policy.
DROP POLICY IF EXISTS expense_categories_owner_or_default ON expense_categories;

DROP POLICY IF EXISTS expense_categories_read ON expense_categories;
CREATE POLICY expense_categories_read ON expense_categories FOR SELECT
  USING (user_id IS NULL OR user_id = current_user_id());

DROP POLICY IF EXISTS expense_categories_owner_write ON expense_categories;
CREATE POLICY expense_categories_owner_write ON expense_categories
  FOR ALL USING (user_id = current_user_id()) WITH CHECK (user_id = current_user_id());

-- ---------------------------------------------------------------------------
-- 6. refresh_tokens and subscriptions — SELECT-only for the API role
-- ---------------------------------------------------------------------------
--
-- Their writes go through SECURITY DEFINER functions owned by the migration role
-- (`auth_*` below and in 0006; `billing_*` when the billing story lands), so a
-- compromised or buggy request path cannot mint a credential or grant itself an
-- entitlement by writing the row directly. The policy grants the read; the
-- REVOKE removes the write at the grant level, beneath RLS, so no future policy
-- can quietly hand it back.
DROP POLICY IF EXISTS refresh_tokens_owner_only ON refresh_tokens;
DROP POLICY IF EXISTS refresh_tokens_owner_read ON refresh_tokens;
CREATE POLICY refresh_tokens_owner_read ON refresh_tokens FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS subscriptions_owner_only ON subscriptions;
DROP POLICY IF EXISTS subscriptions_owner_read ON subscriptions;
CREATE POLICY subscriptions_owner_read ON subscriptions FOR SELECT
  USING (user_id = current_user_id());

REVOKE INSERT, UPDATE, DELETE ON refresh_tokens, subscriptions FROM triptrackr_api;

-- ---------------------------------------------------------------------------
-- 7. auth_consume_refresh_token — atomic rotation (FR-005)
-- ---------------------------------------------------------------------------
--
-- THE RACE. 0006 split rotation into a STABLE lookup (`auth_find_refresh_token`)
-- followed by a revoke and an insert. Two requests presenting the same token at
-- the same moment both read `revoked_at IS NULL`, both revoke, and both mint a
-- fresh pair — a stolen token replayed in the same instant as the legitimate
-- refresh yields two live chains, and the reuse detection FR-005 requires never
-- fires.
--
-- THE FIX. The check and the revocation are one UPDATE. Under READ COMMITTED
-- the second caller blocks on the row lock, re-evaluates `revoked_at IS NULL`
-- against the committed row, finds it false, and updates nothing. Zero rows is
-- then either an unknown hash (no row; the caller learns nothing) or a token
-- that was already retired — by an earlier rotation, a sign-out, or the caller
-- that won the race — and that is the reuse signal, returned with `reused`
-- set so the caller revokes the family.
--
-- A keyhole like the rest of 0006: it takes the SHA-256 of a 256-bit random
-- token and returns four columns about that one row.
CREATE OR REPLACE FUNCTION auth_consume_refresh_token(p_token_hash TEXT)
RETURNS TABLE (id UUID, user_id UUID, expired BOOLEAN, reused BOOLEAN)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  consumed refresh_tokens%ROWTYPE;
BEGIN
  UPDATE refresh_tokens t
  SET revoked_at = now()
  WHERE t.token_hash = p_token_hash
    AND t.revoked_at IS NULL
  RETURNING t.* INTO consumed;

  IF FOUND THEN
    id      := consumed.id;
    user_id := consumed.user_id;
    expired := consumed.expires_at <= now();
    reused  := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- VOLATILE, so this statement takes a fresh snapshot and sees the revocation
  -- the concurrent winner has just committed.
  RETURN QUERY
    SELECT t.id, t.user_id, (t.expires_at <= now()), true
    FROM refresh_tokens t
    WHERE t.token_hash = p_token_hash;
END
$fn$;

REVOKE ALL ON FUNCTION auth_consume_refresh_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_consume_refresh_token(TEXT) TO triptrackr_api;

-- ---------------------------------------------------------------------------
-- 8. auth_insert_refresh_token — replaced_by_id points forward
-- ---------------------------------------------------------------------------
--
-- data-model.md §2 defines `replaced_by_id` on the *retired* row: "presenting a
-- token that has already been rotated means the chain was stolen". 0006 wrote
-- it on the new row, pointing backwards at its predecessor — a valid chain, but
-- the inverse of the column's name and of the model, and useless for the
-- forward walk the reuse response needs. Same signature, so this is a
-- CREATE OR REPLACE and the grants from 0006 carry over; the new row is inserted
-- and its predecessor, if any, is linked to it in one statement.
CREATE OR REPLACE FUNCTION auth_insert_refresh_token(
  p_user_id      UUID,
  p_token_hash   TEXT,
  p_device_info  TEXT,
  p_ttl          INTERVAL,
  p_replaces_id  UUID
)
RETURNS UUID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH inserted AS (
    INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at)
    VALUES (p_user_id, p_token_hash, p_device_info, now() + p_ttl)
    RETURNING id
  ),
  linked AS (
    UPDATE refresh_tokens
    SET replaced_by_id = inserted.id
    FROM inserted
    WHERE refresh_tokens.id = p_replaces_id
  )
  SELECT id FROM inserted;
$fn$;
