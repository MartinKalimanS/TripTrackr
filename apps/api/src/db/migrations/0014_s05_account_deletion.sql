-- 0014_s05_account_deletion.sql (T188; FR-006, SC-015; data-model §9; Constitution V)
--
-- The two keyholes of the account-deletion sweep, in the pattern of 0009, 0012 and 0013.
--
-- `DELETE /me` runs as the traveller (RLS, the request path): it sets
-- `users.deletion_requested_at`, ends every session and queues a job. Everything after
-- that is the worker's, and the worker connects as the API role with NO traveller
-- identity (workers/bootstrap.ts), which under FORCE ROW LEVEL SECURITY sees no
-- traveller's rows. So the sweep cannot be a plain query; it goes through two
-- SECURITY DEFINER functions owned by the migration role:
--
--   1. account_deletion_objects(user) — LISTS the private-bucket objects the traveller's
--      rows point at: every photo (live or tombstoned) with the thumbnail the media
--      worker derives beside it (`<key>.thumb.jpg`, listed whether or not `thumb_key`
--      was ever recorded, as 0013 does), and every sealed document. The worker also
--      removes whatever else sits under `<userId>/` in the buckets (storage keys are
--      `<ownerId>/<uuid>`, buildKey), so an object no row points at cannot survive.
--   2. account_deletion_finalise(user) — deletes the `users` row. Every table that
--      belongs to a traveller references `users` or `trips` with ON DELETE CASCADE
--      (0002, 0008), so the cascade takes the trips, stops, notes, expenses, photos,
--      documents, categories, tokens, identities, subscription, planner requests,
--      follows and blocks. `reports` are different: a report names its target by a
--      type and an id (no foreign key), so the reports ABOUT this traveller or about
--      their trips, notes and photos are deleted here first; the reports the
--      traveller made cascade with the user.
--
-- The bytes go before the rows (Constitution V): the worker lists, removes the objects
-- (and stops if the store refuses), then finalises. A crash or a refusing store leaves
-- the account marked and intact, and BullMQ's retry resumes from the same place.
--
-- What bounds them:
--   - Both refuse unless `deletion_requested_at` is set on that traveller: the one
--     thing only the traveller (or a verified operator) does. With the flag unset they
--     raise, so a bug that passes the wrong id cannot delete or list a live account.
--   - A traveller that no longer exists is not an error: the second run of a finished
--     job lists nothing and deletes nothing (idempotent), which is what a retry needs.
--   - They take a traveller id and nothing a traveller wrote, and return keys and a
--     boolean; no row content leaves the database.
--   - Only the API role can call them (REVOKE FROM PUBLIC, then GRANT), like the
--     other keyholes. The request path connects as that role too and never calls them.
--
-- Visibility posture: no policy is added or altered. What a caller learns is object
-- keys, into private buckets that only a signature opens, of an account that has asked
-- to be deleted; and one true or false.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0009, 0012, 0013)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER account_deletion* functions it owns are otherwise '
      || 'subject to FORCE ROW LEVEL SECURITY and the worker could reach no '
      || 'row. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. account_deletion_objects — the keys the rows point at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION account_deletion_objects(p_user UUID)
RETURNS TABLE (
  bucket      TEXT,
  object_key  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.deletion_requested_at IS NULL) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Deletion has not been requested for this account.',
      ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 'photos'::text, p.storage_key
  FROM photos p JOIN trips t ON t.id = p.trip_id
  WHERE t.owner_id = p_user
  UNION ALL
  SELECT 'photos'::text, p.storage_key || '.thumb.jpg'
  FROM photos p JOIN trips t ON t.id = p.trip_id
  WHERE t.owner_id = p_user
  UNION ALL
  SELECT 'photos'::text, p.thumb_key
  FROM photos p JOIN trips t ON t.id = p.trip_id
  WHERE t.owner_id = p_user AND p.thumb_key IS NOT NULL
  UNION ALL
  SELECT 'documents'::text, d.storage_key
  FROM documents d JOIN trips t ON t.id = d.trip_id
  WHERE t.owner_id = p_user;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 2. account_deletion_finalise — the rows, by cascade
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION account_deletion_finalise(p_user UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_deleted BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.deletion_requested_at IS NULL) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Deletion has not been requested for this account.',
      ERRCODE = 'P0001';
  END IF;

  -- Reports about this traveller or about what they made: no foreign key points at a
  -- target, so the cascade would leave them.
  DELETE FROM reports r
  WHERE (r.target_type = 'user' AND r.target_id = p_user)
     OR (r.target_type = 'trip' AND r.target_id IN (
           SELECT t.id FROM trips t WHERE t.owner_id = p_user))
     OR (r.target_type = 'note' AND r.target_id IN (
           SELECT n.id FROM notes n JOIN trips t ON t.id = n.trip_id WHERE t.owner_id = p_user))
     OR (r.target_type = 'photo' AND r.target_id IN (
           SELECT p.id FROM photos p JOIN trips t ON t.id = p.trip_id WHERE t.owner_id = p_user));

  DELETE FROM users WHERE id = p_user;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END
$fn$;

-- Grants — REVOKE FROM PUBLIC first, then the API role only (as 0009, 0012, 0013).
REVOKE ALL ON FUNCTION account_deletion_objects(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION account_deletion_finalise(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION account_deletion_objects(UUID) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION account_deletion_finalise(UUID) TO triptrackr_api;
