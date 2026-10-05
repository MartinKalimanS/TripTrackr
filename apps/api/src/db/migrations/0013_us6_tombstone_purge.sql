-- 0013_us6_tombstone_purge.sql (T129)
--
-- The tombstone purge's two keyholes (sync-protocol.md §5; research D-16,
-- D-28; the pattern of 0009 and 0012). A deletion is a tombstone — a row with
-- `deleted_at` set — kept so a device that has not synchronised yet is told the
-- row is gone (FR-039). The protocol promises the keeping lasts 90 days and no
-- longer; the worker's daily `tombstone-purge` job honours that, and it cannot
-- be a plain DELETE: the worker connects as the API role with NO traveller
-- identity (workers/bootstrap.ts), so under FORCE ROW LEVEL SECURITY the
-- owner policies (0005) show it no row at all. The functions below are
-- SECURITY DEFINER, owned by the migration role, and each does one thing:
--
--   1. tombstone_purge_objects(days) — LISTS the private-bucket objects of
--      every photo and document whose tombstone is past the window: the photo's
--      original, the thumbnail the media worker derives beside it
--      (`<key>.thumb.jpg`, 0012 — listed whether or not `thumb_key` was ever
--      recorded, because the worker writes the object before it records the
--      key and a photo deleted in between has the object and no key), and the
--      sealed document. It also LOCKS those rows.
--   2. tombstone_purge(days) — hard-deletes the rows whose tombstone is past
--      the window, and reports how many of each.
--
-- They are two functions, called in ONE transaction, because the bytes must go
-- before the rows (Constitution V): a photo or document row is the only place
-- its object's key is written down, so deleting the row first and the object
-- second — with a crash, or a refusing store, in between — strands a traveller's
-- deleted file in a private bucket that nothing will ever sweep. The worker
-- lists the keys, removes the objects (and stops if the store refuses), then
-- purges the rows. `now()` is the transaction's start, so inside one
-- transaction both functions compute the same cutoff and the second deletes
-- exactly the rows the first listed; the first takes the row locks, so a late
-- push that would un-delete one of them waits for the purge instead of racing
-- it between the two steps.
--
-- What bounds them:
--   - A window under 90 days is refused by clamping: `GREATEST(p_days, 90)`.
--     NULL is treated as 90. No argument makes either function reach a
--     tombstone younger than the protocol's promise — the floor is written here,
--     where a caller cannot argue with it, and again as a constant in the
--     worker.
--   - They take no row id, no traveller id and no key: there is nothing to aim
--     at a row. They read `deleted_at` and nothing a traveller wrote.
--   - Only the seven tombstoned tables the protocol lists are touched, and
--     `expense_categories` only where `user_id IS NOT NULL`: the six system
--     categories are reference data and are never purged, whatever their
--     `deleted_at` says.
--   - Live rows are out of reach: every DELETE and every lock is conditioned
--     on `deleted_at < cutoff`, and a NULL `deleted_at` is never less than
--     anything.
--
-- Order of the deletes, children before parents:
--   expenses, notes, photos, documents, trip_stops  — nothing references them;
--   expense_categories — only where no surviving expense still references it
--       (the FK is NO ACTION: deleting a referenced category would raise);
--   trips — only when nothing beneath it survives. The FKs cascade, so a trip
--       delete would otherwise take with it a child that is live or was
--       tombstoned inside the window: a note a device pushed onto the deleted
--       trip after the fact is content the traveller recorded, and is not ours
--       to cascade away (Constitution V; and "never purge a tombstone younger
--       than 90 days" holds for the children as much as the parent). Such a
--       trip stays until its last child is itself due. The planner tables,
--       which have no tombstone and are not synchronised, go with the trip.
-- The parent rows are locked before their children are looked at, so a child
-- inserted concurrently either commits first — and is seen — or waits for the
-- purge and then fails its foreign key, never cascaded.
--
-- Visibility posture: no policy is added or altered, and nothing here reads a
-- column a traveller could want hidden. What a caller learns is object keys —
-- into private buckets that only a signature opens — of rows that have been
-- deleted for over 90 days, and counts. Both are callable by the API role only,
-- the role the request path connects as, which never calls them (0009's and
-- 0012's keyholes share that exposure).

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0009, 0012)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER tombstone_purge* functions it owns are otherwise '
      || 'subject to FORCE ROW LEVEL SECURITY and the worker could reach no '
      || 'row. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. tombstone_purge_objects — the keys to remove, and the rows held for it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tombstone_purge_objects(p_days INTEGER)
RETURNS TABLE (
  bucket      TEXT,
  object_key  TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - make_interval(days => GREATEST(p_days, 90));
BEGIN
  RETURN QUERY
  WITH due_photos AS (
    SELECT p.storage_key AS k
    FROM photos p
    WHERE p.deleted_at < v_cutoff
    FOR UPDATE
  ),
  due_documents AS (
    SELECT d.storage_key AS k
    FROM documents d
    WHERE d.deleted_at < v_cutoff
    FOR UPDATE
  )
  SELECT 'photos'::text, dp.k FROM due_photos dp
  UNION ALL
  SELECT 'photos'::text, dp.k || '.thumb.jpg' FROM due_photos dp
  UNION ALL
  SELECT 'documents'::text, dd.k FROM due_documents dd;
END
$fn$;

-- ---------------------------------------------------------------------------
-- 2. tombstone_purge — the rows, children before parents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tombstone_purge(p_days INTEGER)
RETURNS TABLE (
  table_name  TEXT,
  purged      BIGINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - make_interval(days => GREATEST(p_days, 90));
  v_count  BIGINT;
BEGIN
  DELETE FROM expenses WHERE deleted_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'expenses'; purged := v_count; RETURN NEXT;

  DELETE FROM notes WHERE deleted_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'notes'; purged := v_count; RETURN NEXT;

  DELETE FROM photos WHERE deleted_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'photos'; purged := v_count; RETURN NEXT;

  DELETE FROM documents WHERE deleted_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'documents'; purged := v_count; RETURN NEXT;

  DELETE FROM trip_stops WHERE deleted_at < v_cutoff;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'trip_stops'; purged := v_count; RETURN NEXT;

  -- A category goes only when no expense still names it, and never a system one.
  PERFORM c.id FROM expense_categories c
  WHERE c.deleted_at < v_cutoff AND c.user_id IS NOT NULL
  FOR UPDATE;

  DELETE FROM expense_categories c
  WHERE c.deleted_at < v_cutoff
    AND c.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.category_id = c.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'expense_categories'; purged := v_count; RETURN NEXT;

  -- A trip goes only when nothing beneath it survives. The locks come first, in
  -- a statement of their own, so the existence checks below run on a snapshot
  -- that already includes any child a concurrent push has just committed.
  PERFORM t.id FROM trips t WHERE t.deleted_at < v_cutoff FOR UPDATE;

  DELETE FROM trips t
  WHERE t.deleted_at < v_cutoff
    AND NOT EXISTS (SELECT 1 FROM trip_stops s WHERE s.trip_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.trip_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM expenses e WHERE e.trip_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM photos p WHERE p.trip_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.trip_id = t.id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'trips'; purged := v_count; RETURN NEXT;
END
$fn$;

-- Grants — REVOKE FROM PUBLIC first, then the API role only (as 0009, 0012).
REVOKE ALL ON FUNCTION tombstone_purge_objects(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION tombstone_purge(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION tombstone_purge_objects(INTEGER) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION tombstone_purge(INTEGER) TO triptrackr_api;
