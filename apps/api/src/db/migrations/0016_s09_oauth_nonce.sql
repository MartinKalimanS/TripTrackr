-- 0016_s09_oauth_nonce.sql
--
-- Server-issued, single-use nonces for Sign in with Google / Apple (spec 012; FR-001 to FR-005).
--
-- The table has no owner and is deny-all to the API role: ENABLE + FORCE ROW LEVEL SECURITY with
-- a policy that admits nothing. The two SECURITY DEFINER functions below are the only way in, as
-- for the other pre-session tables (0008). Only a hash of the nonce is stored.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER auth_*_oauth_nonce functions it owns are otherwise subject to FORCE '
      || 'ROW LEVEL SECURITY and no sign-in could issue a nonce. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS oauth_nonces (
  nonce_hash  text PRIMARY KEY,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oauth_nonces_expiry_idx ON oauth_nonces (expires_at);

ALTER TABLE oauth_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_nonces FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oauth_nonces_deny_all ON oauth_nonces;
CREATE POLICY oauth_nonces_deny_all ON oauth_nonces
  USING (false)
  WITH CHECK (false);

-- Stores the hash of a freshly issued nonce, and removes every expired one while it is here, so
-- the table stays small without a scheduled job.
CREATE OR REPLACE FUNCTION auth_issue_oauth_nonce(p_hash TEXT, p_ttl INTERVAL)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  DELETE FROM oauth_nonces WHERE expires_at < now();
  INSERT INTO oauth_nonces (nonce_hash, expires_at)
  VALUES (p_hash, now() + p_ttl)
  ON CONFLICT (nonce_hash) DO NOTHING;
END
$fn$;

-- True exactly once per live nonce: the row is deleted by the call that finds it. Unknown, spent
-- and expired are one answer (false).
CREATE OR REPLACE FUNCTION auth_consume_oauth_nonce(p_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_found BOOLEAN;
BEGIN
  DELETE FROM oauth_nonces
  WHERE nonce_hash = p_hash AND expires_at > now()
  RETURNING true INTO v_found;
  RETURN COALESCE(v_found, false);
END
$fn$;

REVOKE ALL ON FUNCTION auth_issue_oauth_nonce(TEXT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_consume_oauth_nonce(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_issue_oauth_nonce(TEXT, INTERVAL) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION auth_consume_oauth_nonce(TEXT) TO triptrackr_api;
