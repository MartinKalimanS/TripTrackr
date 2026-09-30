-- 0012_us5_media_worker.sql (T210)
--
-- The media worker's two keyholes (research D-12, D-34; the D-28 pattern of
-- 0009). The worker connects as the API role with NO traveller identity
-- (workers/bootstrap.ts), so `photos_owner_all` and `photos_public_read`
-- (0005) show it nothing — correct, and exactly why making a thumbnail cannot
-- be a plain SELECT and UPDATE from that process. The functions below are
-- SECURITY DEFINER, owned by the migration role, and each reaches ONE photo
-- by id, and only while that photo is live, its trip is live, and its bytes
-- have been confirmed (`upload_state = 'uploaded'`, set by registration only
-- after the object store answered — FR-041):
--
--   1. media_photo_for_processing(id) — the photo's storage key, and whether
--      registration carried any capture data. Not its position, not its time,
--      not its owner: the worker needs the bytes and one yes/no to decide
--      whether to read EXIF itself (FR-029), and nothing more.
--   2. media_record_photo(id, …) — records what the worker made and read:
--        - the thumbnail key, DERIVED here from the storage key rather than
--          taken as an argument, so no caller can point a photo's thumbnail
--          at another object (FR-030);
--        - capture time and position, filled ONLY where the row has none —
--          EXIF is recorded as observed, never over what the traveller's
--          device sent (data-model.md §5);
--        - the nearest city among the trip's LIVE stops within 50 km of the
--          photo's position, ONLY when the photo has no city — a filing the
--          traveller made is never overwritten (Acceptance 5.2, research D-34);
--        - a screening verdict, with a fail-closed asymmetry: a rejection
--          always lands, an approval can only lift a photo out of `pending`.
--          The only screener until User Story 7 answers `pending`
--          (research D-34), which changes nothing.
--      and moves `updated_at`, so a device learns all of it on its next pull
--      (sync-protocol.md §1). Re-running it is harmless: every fill is
--      conditional, and the thumbnail key is the same key each time — which
--      is what makes the worker idempotent under BullMQ's retries.
--
-- No policy is added or altered here. Public reachability is still decided by
-- `photos_public_read` alone, which requires `moderation_state = 'approved'`
-- AND the photo public AND its trip public: nothing in this file can make a
-- photo reachable that its owner has not made public.
--
-- Both are callable by the API role only — the same role the request path
-- connects as, which never calls them (0009's keyholes share that exposure).
-- What a caller learns from (1) is a key into a private bucket that only a
-- signature opens, for a photo id that is an unguessable uuid.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0009, 0010)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. The '
      || 'SECURITY DEFINER media_* functions it owns are otherwise subject to '
      || 'FORCE ROW LEVEL SECURITY and the worker could reach no photo. Check '
      || 'MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. media_photo_for_processing — the worker's read
-- ---------------------------------------------------------------------------
--
-- Nothing for a photo that is tombstoned, whose trip is tombstoned, or whose
-- bytes have not been confirmed: the worker then finishes the job quietly.
CREATE OR REPLACE FUNCTION media_photo_for_processing(p_id UUID)
RETURNS TABLE (
  id           UUID,
  storage_key  TEXT,
  needs_exif   BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.id,
         p.storage_key,
         (p.taken_at IS NULL AND p.exif_lat IS NULL AND p.exif_lng IS NULL)
  FROM photos p
  JOIN trips t ON t.id = p.trip_id
  WHERE p.id = p_id
    AND p.deleted_at IS NULL
    AND p.upload_state = 'uploaded'
    AND t.deleted_at IS NULL;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. media_record_photo — the worker's write
-- ---------------------------------------------------------------------------
--
-- The row is locked first, so a traveller's concurrent refile (PATCH
-- /photos/:id) either commits before this reads it — and is seen, and kept —
-- or waits and commits after, overwriting the worker's filing. In both orders
-- the traveller's filing is the one that stays.
--
-- A position is filled only as a pair and only inside the coordinate ranges,
-- and `ST_DWithin` on geography measures metres on the spheroid, so 50 km is
-- 50 km at the equator and at the poles alike. Ties in distance fall to the
-- lower city id, so the answer never depends on scan order.
--
-- Returns nothing when the photo is no longer live and uploaded — tombstoned
-- while the worker was thumbnailing it — and one row otherwise: the thumbnail
-- key it recorded, whether the worker filed the photo in this call, and the
-- moderation state the photo now has.
CREATE OR REPLACE FUNCTION media_record_photo(
  p_id                UUID,
  p_taken_at          TIMESTAMPTZ,
  p_exif_lat          DOUBLE PRECISION,
  p_exif_lng          DOUBLE PRECISION,
  p_moderation_state  TEXT
)
RETURNS TABLE (
  photo_id       UUID,
  thumbnail_key  TEXT,
  filed          BOOLEAN,
  moderation     TEXT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_trip_id  UUID;
  v_city_id  INTEGER;
  v_lat      DOUBLE PRECISION;
  v_lng      DOUBLE PRECISION;
  v_nearest  INTEGER;
BEGIN
  SELECT p.trip_id, p.city_id, p.exif_lat, p.exif_lng
  INTO v_trip_id, v_city_id, v_lat, v_lng
  FROM photos p
  JOIN trips t ON t.id = p.trip_id
  WHERE p.id = p_id
    AND p.deleted_at IS NULL
    AND p.upload_state = 'uploaded'
    AND t.deleted_at IS NULL
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- EXIF fills a position only where the row has none. A NULL argument fails
  -- BETWEEN, so "neither coordinate" and "half a pair" both leave it alone.
  IF v_lat IS NULL AND v_lng IS NULL
     AND p_exif_lat BETWEEN -90 AND 90
     AND p_exif_lng BETWEEN -180 AND 180 THEN
    v_lat := p_exif_lat;
    v_lng := p_exif_lng;
  END IF;

  IF v_city_id IS NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
    SELECT s.city_id INTO v_nearest
    FROM trip_stops s
    JOIN cities c ON c.id = s.city_id
    WHERE s.trip_id = v_trip_id
      AND s.deleted_at IS NULL
      AND ST_DWithin(
            c.location,
            ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
            50000
          )
    ORDER BY ST_Distance(
               c.location,
               ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography
             ),
             s.city_id
    LIMIT 1;
  END IF;

  UPDATE photos p
  SET thumb_key        = p.storage_key || '.thumb.jpg',
      taken_at         = COALESCE(p.taken_at, p_taken_at),
      exif_lat         = v_lat,
      exif_lng         = v_lng,
      city_id          = COALESCE(p.city_id, v_nearest),
      moderation_state = CASE
                           WHEN p_moderation_state = 'rejected' THEN 'rejected'
                           WHEN p_moderation_state = 'approved'
                                AND p.moderation_state = 'pending' THEN 'approved'
                           ELSE p.moderation_state
                         END,
      updated_at       = now()
  WHERE p.id = p_id
  RETURNING p.id,
            p.thumb_key,
            (v_city_id IS NULL AND p.city_id IS NOT NULL),
            p.moderation_state
  INTO photo_id, thumbnail_key, filed, moderation;

  RETURN NEXT;
END
$fn$;

-- Grants — REVOKE FROM PUBLIC first, then the API role only (as 0009, 0010).
REVOKE ALL ON FUNCTION media_photo_for_processing(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION media_record_photo(UUID, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION media_photo_for_processing(UUID) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION media_record_photo(UUID, TIMESTAMPTZ, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO triptrackr_api;
