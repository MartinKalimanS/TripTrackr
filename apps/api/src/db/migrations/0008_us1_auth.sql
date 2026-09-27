-- 0008_us1_auth.sql
--
-- What User Story 1 needs from the database that 0006 and 0007 did not give it:
--
--   1. A way to CREATE an account. `users_self_all` (0005) is USING-only, so its
--      derived WITH CHECK is `id = current_user_id()` — and a traveller who is
--      registering has no id yet. No policy can admit that INSERT without also
--      admitting an INSERT of anyone, so it goes through a keyhole (0006's
--      option 4): a SECURITY DEFINER function that takes exactly the three
--      fields FR-001 names and returns exactly the new id.
--   2. The same for an OAuth first sign-in (FR-002), which may create, or may
--      attach an identity to an account that already exists with the same
--      verified address (data-model.md §2, "the link is by verified email").
--   3. Two token tables — email verification and password reset (spec
--      Assumptions place both in scope) — shaped like `refresh_tokens`: a hash,
--      never the token; SELECT-only for the API role; every write behind a
--      function, so a request path cannot mint itself a reset link.
--
-- Every function here returns NULL, or a row naming an outcome, where 0006
-- would have let a constraint raise. That is deliberate and load-bearing: the
-- request transaction (RlsSessionMiddleware) is committed on a 4xx, and
-- postgres.js treats ANY failed statement inside `begin()` as grounds to roll
-- the whole transaction back after the response has gone out. A 409 that was
-- produced by catching a unique_violation would therefore be a 409 whose
-- side effects quietly vanished. `ON CONFLICT DO NOTHING` and a NULL return
-- keep the transaction clean and let the service decide the status code.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0007)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER auth_* functions it owns are otherwise subject to FORCE '
      || 'ROW LEVEL SECURITY and nobody could register. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. Token tables
-- ---------------------------------------------------------------------------
--
-- Visibility posture: owner-only, structurally. A traveller may read their own
-- rows (so a future "pending verification" indicator has something to read);
-- nobody writes them directly. The hash is SHA-256 of 32 random bytes, for the
-- same reason refresh tokens are (token.service.ts): there is nothing for a
-- slow hash to defend against.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_verification_tokens_hash_key
  ON email_verification_tokens (token_hash);
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_id_idx
  ON email_verification_tokens (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_hash_key
  ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);

-- ENABLE and FORCE, as 0004 does for every owned table. test/privacy/
-- catalogue.spec.ts requires both on any table not on its reference-data list.
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_verification_tokens_owner_read ON email_verification_tokens;
CREATE POLICY email_verification_tokens_owner_read ON email_verification_tokens FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS password_reset_tokens_owner_read ON password_reset_tokens;
CREATE POLICY password_reset_tokens_owner_read ON password_reset_tokens FOR SELECT
  USING (user_id = current_user_id());

-- 0003's default privileges granted the API role INSERT/UPDATE/DELETE on these
-- the moment they were created. Taken back at the grant level, beneath RLS, as
-- 0007 did for refresh_tokens — so no future policy can quietly hand it back.
REVOKE INSERT, UPDATE, DELETE ON email_verification_tokens, password_reset_tokens
  FROM triptrackr_api;

-- ---------------------------------------------------------------------------
-- 2. auth_register_user — POST /auth/register (FR-001)
-- ---------------------------------------------------------------------------
--
-- Returns the new account's id, or NULL when the address is already taken —
-- by a password account or by an OAuth-only one, indistinguishably. The
-- caller answers 409 either way and does not say which kind of account holds
-- the address (spec edge case: "registers with an email that already has an
-- account created via Google or Apple sign-in").
--
-- The hash arrives already computed (Argon2id, password.service.ts). This
-- function never sees a password.
CREATE OR REPLACE FUNCTION auth_register_user(
  p_email          TEXT,
  p_password_hash  TEXT,
  p_display_name   TEXT
)
RETURNS UUID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  INSERT INTO users (email, password_hash, display_name)
  VALUES (p_email::citext, p_password_hash, p_display_name)
  ON CONFLICT (email) DO NOTHING
  RETURNING id;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. auth_upsert_oauth_identity — POST /auth/oauth/{google,apple} (FR-002)
-- ---------------------------------------------------------------------------
--
-- The provider has already vouched for (provider, provider_uid) and, when
-- p_email_verified is true, for the address. Three outcomes, in order:
--
--   existing   the identity is known — sign that traveller in.
--   linked     no identity, but an account holds this VERIFIED address — attach
--              the identity to it (data-model.md §2). An unverified address is
--              never linked: that would let anyone who can register an
--              unverified provider account with a victim's address take the
--              victim's account.
--   created    nobody holds the address — create the account transparently.
--
-- and two refusals, returned rather than raised so the request transaction
-- stays clean: `email_unverified` (the address is taken and the provider did
-- not verify it) and `email_required` (the provider sent no address at all,
-- and users.email is NOT NULL).
--
-- Concurrency: two first sign-ins racing on one address both pass the lookups
-- and both attempt the INSERT; the loser's ON CONFLICT DO NOTHING waits for
-- the winner to commit, re-reads the account, and links to it instead. A
-- second identity INSERT for the same (provider, uid) is likewise a no-op.
CREATE OR REPLACE FUNCTION auth_upsert_oauth_identity(
  p_provider        TEXT,
  p_provider_uid    TEXT,
  p_email           TEXT,
  p_email_verified  BOOLEAN,
  p_display_name    TEXT
)
RETURNS TABLE (user_id UUID, outcome TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT i.user_id INTO v_user_id
  FROM oauth_identities i
  WHERE i.provider = p_provider AND i.provider_uid = p_provider_uid;

  IF FOUND THEN
    user_id := v_user_id; outcome := 'existing';
    RETURN NEXT; RETURN;
  END IF;

  IF p_email IS NULL THEN
    user_id := NULL; outcome := 'email_required';
    RETURN NEXT; RETURN;
  END IF;

  SELECT u.id INTO v_user_id
  FROM users u
  WHERE u.email = p_email::citext AND u.deletion_requested_at IS NULL;

  IF NOT FOUND THEN
    INSERT INTO users (email, password_hash, display_name, email_verified_at)
    VALUES (
      p_email::citext,
      NULL,
      COALESCE(p_display_name, split_part(p_email, '@', 1)),
      CASE WHEN p_email_verified THEN now() END
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id INTO v_user_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO oauth_identities (user_id, provider, provider_uid)
      VALUES (v_user_id, p_provider, p_provider_uid)
      ON CONFLICT (provider, provider_uid) DO NOTHING;

      user_id := v_user_id; outcome := 'created';
      RETURN NEXT; RETURN;
    END IF;

    -- Lost the race described above: the address now belongs to someone who
    -- committed a moment ago. Fall through to the link path against that row.
    SELECT u.id INTO v_user_id
    FROM users u
    WHERE u.email = p_email::citext AND u.deletion_requested_at IS NULL;

    IF NOT FOUND THEN
      -- Taken by an account mid-deletion. Nothing safe to do with it.
      user_id := NULL; outcome := 'email_unverified';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF NOT COALESCE(p_email_verified, false) THEN
    user_id := NULL; outcome := 'email_unverified';
    RETURN NEXT; RETURN;
  END IF;

  INSERT INTO oauth_identities (user_id, provider, provider_uid)
  VALUES (v_user_id, p_provider, p_provider_uid)
  ON CONFLICT (provider, provider_uid) DO NOTHING;

  -- The provider has just vouched for the address, which is what a
  -- verification email would have proven.
  UPDATE users
  SET email_verified_at = now(), updated_at = now()
  WHERE id = v_user_id AND email_verified_at IS NULL;

  user_id := v_user_id; outcome := 'linked';
  RETURN NEXT; RETURN;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Email verification
-- ---------------------------------------------------------------------------
--
-- Issued at registration for an account the caller has just created — the
-- id is passed in because, as with auth_insert_refresh_token, there is no
-- session yet. Verification then arrives from a link with no session at all.
CREATE OR REPLACE FUNCTION auth_create_email_verification_token(
  p_user_id     UUID,
  p_token_hash  TEXT,
  p_ttl         INTERVAL
)
RETURNS UUID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
  VALUES (p_user_id, p_token_hash, now() + p_ttl)
  RETURNING id;
$fn$;

-- Consumes a live token and marks the address verified. Returns the user id,
-- or NULL for a token that is unknown, spent, or expired — one answer for all
-- three, so a link cannot be probed for which it is.
CREATE OR REPLACE FUNCTION auth_verify_email(p_token_hash TEXT)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE email_verification_tokens t
  SET used_at = now()
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
  RETURNING t.user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE users
  SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
  WHERE id = v_user_id;

  RETURN v_user_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Password reset
-- ---------------------------------------------------------------------------
--
-- Request: creates a token for the account holding the address and returns
-- its user id, or NULL when no account does. The caller answers 202 in both
-- cases and only sends the email in the first (rest-api.md §1: the response
-- must not be an account-enumeration oracle).
CREATE OR REPLACE FUNCTION auth_create_password_reset_token(
  p_email       TEXT,
  p_token_hash  TEXT,
  p_ttl         INTERVAL
)
RETURNS UUID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
  SELECT u.id, p_token_hash, now() + p_ttl
  FROM users u
  WHERE u.email = p_email::citext
    AND u.deletion_requested_at IS NULL
  RETURNING user_id;
$fn$;

-- Confirm: consumes a live token, installs the new hash, spends every other
-- outstanding reset token for the account, and revokes every refresh token —
-- a password reset is the traveller declaring the old credentials
-- compromised, and every signed-in device is a place the old credentials
-- still work. Proving control of the mailbox also proves the address, so an
-- unverified account is marked verified.
CREATE OR REPLACE FUNCTION auth_reset_password(
  p_token_hash     TEXT,
  p_password_hash  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id UUID;
BEGIN
  UPDATE password_reset_tokens t
  SET used_at = now()
  WHERE t.token_hash = p_token_hash
    AND t.used_at IS NULL
    AND t.expires_at > now()
  RETURNING t.user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE users
  SET password_hash = p_password_hash,
      email_verified_at = COALESCE(email_verified_at, now()),
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE password_reset_tokens
  SET used_at = now()
  WHERE user_id = v_user_id AND used_at IS NULL;

  UPDATE refresh_tokens
  SET revoked_at = now()
  WHERE user_id = v_user_id AND revoked_at IS NULL;

  RETURN v_user_id;
END
$fn$;

-- ---------------------------------------------------------------------------
-- Grants — REVOKE FROM PUBLIC first, then the API role only (as 0006)
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION auth_register_user(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_upsert_oauth_identity(TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_create_email_verification_token(UUID, TEXT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_verify_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_create_password_reset_token(TEXT, TEXT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_reset_password(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION auth_register_user(TEXT, TEXT, TEXT) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_upsert_oauth_identity(TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_create_email_verification_token(UUID, TEXT, INTERVAL) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_verify_email(TEXT) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_create_password_reset_token(TEXT, TEXT, INTERVAL) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_reset_password(TEXT, TEXT) TO triptrackr_api;
