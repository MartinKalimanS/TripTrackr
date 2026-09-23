-- 0006_auth_functions.sql
--
-- The narrow, audited bypass that authentication requires.
--
-- THE PROBLEM
--
-- Every policy in 0005 keys on `app.current_user_id`. Authentication is the one
-- part of the system that runs BEFORE there is a current user: /auth/login must
-- find an account from an email address, and /auth/refresh must find a token row
-- from a token hash, and in both cases the whole point is that the caller has not
-- yet proved who they are. Under forced RLS those lookups return nothing, so
-- nobody can ever sign in. The chicken has no egg.
--
-- THE OPTIONS, AND WHY THIS ONE
--
--   1. Leave `users` and `refresh_tokens` unpoliced. Rejected outright: they hold
--      password hashes and session credentials, and Constitution I does not have
--      an exception clause for convenience.
--   2. Add a policy permitting reads when no session is set. Rejected: that is
--      precisely the "must never default to a value" failure in
--      data-access-policy.md §1, and it would open every row on the table to any
--      unauthenticated request, not just the one row the caller can already name.
--   3. Connect as the migration role for auth routes. Rejected: that role bypasses
--      every policy on every table, so one mistake in routing would disable the
--      entire privacy layer for that request.
--   4. SECURITY DEFINER functions, one per auth operation, each taking the exact
--      identifier the caller already possesses and returning only what that
--      operation needs. Chosen.
--
-- WHY (4) IS ACTUALLY SAFE
--
-- Each function is a keyhole, not a door. `auth_find_user_by_email` requires the
-- caller to already know the email address and returns three columns — never the
-- profile, never the trips, never a way to enumerate. `auth_find_refresh_token`
-- requires a SHA-256 hash of a 256-bit random token, which cannot be guessed.
-- None of them accept a predicate, so none can be widened by their argument. The
-- surface is fixed at the four operations below and is visible in one file.
--
-- Anything that is NOT a pre-authentication operation must go through the
-- policies. A new function here is a privacy change and is reviewed as one.

-- ---------------------------------------------------------------------------
-- auth_find_user_by_email — POST /auth/login
-- ---------------------------------------------------------------------------
--
-- Returns the minimum needed to verify a password and decide whether the account
-- may sign in. Note what is absent: display_name, bio, avatar. A login attempt
-- must not become a profile lookup for an address someone merely guessed.
--
-- The caller MUST run Argon2 verification even when this returns no row, and must
-- return the same message either way. The contract calls the alternative what it
-- is: "an account-enumeration oracle" (rest-api.md §1).
CREATE OR REPLACE FUNCTION auth_find_user_by_email(p_email TEXT)
RETURNS TABLE (id UUID, password_hash TEXT, email_verified_at TIMESTAMPTZ)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT u.id, u.password_hash, u.email_verified_at
  FROM users u
  WHERE u.email = p_email::citext
    AND u.deletion_requested_at IS NULL;
$fn$;

-- ---------------------------------------------------------------------------
-- auth_find_refresh_token — POST /auth/refresh, POST /auth/logout
-- ---------------------------------------------------------------------------
--
-- `revoked_at` is returned rather than filtered on, because a revoked row is not
-- "not found" — presenting one is the reuse signal that FR-005 requires the
-- caller to act on by revoking the whole family. Filtering it here would destroy
-- the evidence before anyone could read it.
CREATE OR REPLACE FUNCTION auth_find_refresh_token(p_token_hash TEXT)
RETURNS TABLE (id UUID, user_id UUID, revoked_at TIMESTAMPTZ, expired BOOLEAN)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT t.id, t.user_id, t.revoked_at, (t.expires_at <= now()) AS expired
  FROM refresh_tokens t
  WHERE t.token_hash = p_token_hash;
$fn$;

-- ---------------------------------------------------------------------------
-- auth_insert_refresh_token — issuing a token during login, register, refresh
-- ---------------------------------------------------------------------------
--
-- Takes the user id as an argument rather than reading it from the session,
-- because during login there is no session yet. The caller has just verified a
-- password or just rotated a valid token, and that verification is what
-- authorises this call.
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
  INSERT INTO refresh_tokens (user_id, token_hash, device_info, expires_at, replaced_by_id)
  VALUES (p_user_id, p_token_hash, p_device_info, now() + p_ttl, p_replaces_id)
  RETURNING id;
$fn$;

-- ---------------------------------------------------------------------------
-- auth_revoke_refresh_tokens — rotation, logout, logout-all, reuse response
-- ---------------------------------------------------------------------------
--
-- One function for all four, because they are the same operation with different
-- selectors, and two of them (rotation, reuse response) happen before the request
-- has an authenticated session.
--
-- Exactly one selector must be supplied. Both, or neither, revokes nothing rather
-- than revoking everything — a bug in a caller must not become a mass logout.
CREATE OR REPLACE FUNCTION auth_revoke_refresh_tokens(
  p_token_hash TEXT DEFAULT NULL,
  p_user_id    UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  affected INTEGER;
BEGIN
  IF (p_token_hash IS NULL) = (p_user_id IS NULL) THEN
    RAISE EXCEPTION
      'auth_revoke_refresh_tokens requires exactly one of p_token_hash or p_user_id';
  END IF;

  UPDATE refresh_tokens
  SET revoked_at = now()
  WHERE revoked_at IS NULL
    AND (
      (p_token_hash IS NOT NULL AND token_hash = p_token_hash)
      OR (p_user_id IS NOT NULL AND user_id = p_user_id)
    );

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
--
-- REVOKE FROM PUBLIC first, then grant to the API role only. A SECURITY DEFINER
-- function is executable by PUBLIC by default, which would extend this bypass to
-- every role in the database.
REVOKE ALL ON FUNCTION auth_find_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_find_refresh_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_insert_refresh_token(UUID, TEXT, TEXT, INTERVAL, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_revoke_refresh_tokens(TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_find_user_by_email(TEXT) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_find_refresh_token(TEXT) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_insert_refresh_token(UUID, TEXT, TEXT, INTERVAL, UUID) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_revoke_refresh_tokens(TEXT, UUID) TO triptrackr_api;
