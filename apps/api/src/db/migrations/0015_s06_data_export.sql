-- 0015_s06_data_export.sql (T190; FR-007; spec 009)
--
-- Export my data: one row per request, and the two keyholes of the daily cleanup.
--
-- `data_exports` is owner-only, structurally. The API creates a row as the traveller
-- (`POST /me/export`), reads it back as the traveller (`GET /me/export/:id`), and the worker builds
-- the archive by taking the traveller's identity for the whole job (`set_config`, as the request
-- path does), so the rows it reads and the row it updates are filtered by the same policies a
-- request is. There is no policy for anyone else and no public read: an export is the whole of one
-- traveller's data in one file.
--
-- The cleanup runs with NO identity (it must see every traveller's expired archive), so it goes
-- through two SECURITY DEFINER keyholes owned by the migration role, in the pattern of 0013:
--
--   1. data_exports_expired()        — lists the object keys of `ready` archives past `expires_at`;
--   2. data_exports_mark_expired(ids) — marks those rows `expired` and forgets the key, only for
--      ids that are really due, so a caller cannot expire a live archive by naming it.
--
-- The object goes before the row is changed (the worker removes it, then calls the second): the row
-- is the only place the key is recorded, as for photos and documents (Constitution V).
--
-- Visibility posture: owner-only, no visibility flag, no public-read policy. What the keyholes
-- reveal is object keys of archives that have already expired, to the API role only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER data_exports_* functions it owns are otherwise subject to FORCE '
      || 'ROW LEVEL SECURITY and the cleanup could reach no row. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS data_exports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'ready', 'failed', 'expired')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  expires_at    timestamptz,
  /** `<userId>/exports/<id>.zip` in the documents bucket while the archive exists. */
  object_key    text,
  byte_size     bigint,
  CONSTRAINT data_exports_ready_has_archive
    CHECK (status <> 'ready' OR (object_key IS NOT NULL AND expires_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS data_exports_user_requested_idx
  ON data_exports (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS data_exports_expiry_idx
  ON data_exports (expires_at) WHERE status = 'ready';

ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_exports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_exports_owner_only ON data_exports;
CREATE POLICY data_exports_owner_only ON data_exports
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

-- ---------------------------------------------------------------------------
-- The cleanup's keyholes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION data_exports_expired()
RETURNS TABLE (
  export_id   UUID,
  object_key  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT e.id, e.object_key
  FROM data_exports e
  WHERE e.status = 'ready' AND e.expires_at < now() AND e.object_key IS NOT NULL;
$fn$;

CREATE OR REPLACE FUNCTION data_exports_mark_expired(p_ids UUID[])
RETURNS BIGINT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count BIGINT;
BEGIN
  UPDATE data_exports e
  SET status = 'expired', object_key = NULL
  WHERE e.id = ANY (p_ids) AND e.status = 'ready' AND e.expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$fn$;

REVOKE ALL ON FUNCTION data_exports_expired() FROM PUBLIC;
REVOKE ALL ON FUNCTION data_exports_mark_expired(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION data_exports_expired() TO triptrackr_api;
GRANT EXECUTE ON FUNCTION data_exports_mark_expired(UUID[]) TO triptrackr_api;
