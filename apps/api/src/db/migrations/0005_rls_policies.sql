-- 0005_rls_policies.sql (T025)
--
-- The authority on who may read what (contracts/data-access-policy.md §2).
-- Constitution I requires visibility to be enforced where data is retrieved, so
-- that a defect in a screen, a route, or a query cannot disclose another
-- traveller's content. Everything above this file is convenience.
--
-- Every predicate names `current_setting('app.current_user_id')` inline rather
-- than calling a helper. That is deliberate: `pg_policies.qual` then reads as the
-- rule itself, and the catalogue assertions in test/privacy/catalogue.spec.ts can
-- verify a predicate is user-scoped by reading the catalogue rather than by
-- trusting a function name.
--
-- `current_setting()` is called WITHOUT the missing_ok argument. An
-- unauthenticated request sets no session variable, the call raises, and the
-- query fails closed. It must never default to a value (§1, adversarial row 13).

-- ---------------------------------------------------------------------------
-- is_blocked_between
-- ---------------------------------------------------------------------------
--
-- True when a block exists in EITHER direction. FR-061 must hold on the profile
-- route, the trip route, the feed route and the discovery route at once; one
-- predicate covers all four, where four separate query filters would be four
-- chances to miss one.
--
-- SECURITY DEFINER is load-bearing, not incidental. `blocks` is itself under
-- forced RLS and a traveller can only see the blocks they created. If this
-- function ran as the caller, then when C reads A's profile it would look for
-- A's block of C, find it filtered out, return false, and the block would
-- silently do nothing. A privacy predicate that depends on RLS-filtered data
-- defeats itself. Running as the definer lets it see every block while the
-- caller still cannot read the table.
--
-- search_path is pinned for the reason every SECURITY DEFINER function pins it:
-- without it, the caller chooses which `blocks` table this reads.
CREATE OR REPLACE FUNCTION is_blocked_between(a UUID, b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS 'SELECT EXISTS (SELECT 1 FROM blocks WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a))';

REVOKE ALL ON FUNCTION is_blocked_between(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_blocked_between(UUID, UUID) TO triptrackr_api;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
--
-- Column-level exposure — only display_name, avatar_url and bio reach a public
-- view — is the serialiser's job. RLS is row-level; the two work together and
-- neither substitutes for the other.
CREATE POLICY users_self_all ON users
  USING (id = current_setting('app.current_user_id')::uuid);

-- deletion_requested_at IS NULL covers the spec edge case where a traveller with
-- a public trip deletes their account: profile and trips stop being publicly
-- reachable immediately, before the sweep has finished running.
CREATE POLICY users_public_read ON users FOR SELECT
  USING (
    is_profile_public = true
    AND deletion_requested_at IS NULL
    AND NOT is_blocked_between(id, current_setting('app.current_user_id')::uuid)
  );

-- Credentials. Never public, under any condition.
CREATE POLICY oauth_identities_owner_only ON oauth_identities
  USING (user_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY refresh_tokens_owner_only ON refresh_tokens
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
CREATE POLICY trips_owner_all ON trips
  USING (owner_id = current_setting('app.current_user_id')::uuid);

-- deleted_at IS NULL appears in the *public* policy specifically: a tombstoned
-- trip must stop being publicly reachable at once, which is also FR-057's
-- requirement when visibility is revoked. The owner policy above deliberately
-- omits it, because /sync/pull must still see tombstones (sync-protocol.md §1).
CREATE POLICY trips_public_read ON trips FOR SELECT
  USING (
    is_public = true
    AND deleted_at IS NULL
    AND NOT is_blocked_between(owner_id, current_setting('app.current_user_id')::uuid)
  );

-- The route is part of the curated public view (FR-055), so a public trip's stops
-- are publicly readable. `trip_stops` carries no visibility of its own — the trip
-- is the whole envelope.
CREATE POLICY trip_stops_owner_all ON trip_stops
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY trip_stops_public_read ON trip_stops FOR SELECT
  USING (trip_id IN (SELECT id FROM trips
                     WHERE is_public = true AND deleted_at IS NULL));

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
--
-- Both the note and its trip must be public. FR-053's independent visibility
-- means a public note inside a private trip stays private — the trip is the
-- outer envelope (adversarial row 7).
CREATE POLICY notes_owner_all ON notes
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY notes_public_read ON notes FOR SELECT
  USING (
    is_public = true
    AND deleted_at IS NULL
    AND trip_id IN (SELECT id FROM trips WHERE is_public = true AND deleted_at IS NULL)
  );

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
CREATE POLICY photos_owner_all ON photos
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

-- moderation_state = 'approved' is inside the predicate deliberately. FR-056
-- withholds a photo from public visibility until it has passed screening
-- *irrespective of the visibility its owner set*. Checking that in a service
-- method would leave the guarantee one bug away from failing; here, an unscreened
-- photo is unreachable publicly even if every layer above it is wrong.
CREATE POLICY photos_public_read ON photos FOR SELECT
  USING (
    is_public = true
    AND moderation_state = 'approved'
    AND deleted_at IS NULL
    AND trip_id IN (SELECT id FROM trips WHERE is_public = true AND deleted_at IS NULL)
  );

-- ---------------------------------------------------------------------------
-- expenses and documents
-- ---------------------------------------------------------------------------
--
-- No public-read policy exists for either table, and none may ever be added.
--
-- This is the single most important property in the schema. FR-027 and FR-032
-- are enforced by the ABSENCE of a mechanism, not by a flag that application code
-- has to remember to check. There is no is_public column to set wrongly, and no
-- policy that could return someone else's row. A change that adds either is a
-- constitutional violation (Principle I), not a feature, and must be rejected in
-- review regardless of what it enables.
--
-- test/privacy/catalogue.spec.ts asserts this absence directly (adversarial row
-- 14), because a behavioural suite cannot prove that a policy does not exist.
CREATE POLICY expenses_owner_only ON expenses
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY documents_owner_only ON documents
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

-- A category with a NULL user_id is a system default offered to everyone; one
-- with a user_id is that traveller's own. Categories name spending habits, so a
-- traveller's own list is as private as the expenses filed under it.
CREATE POLICY expense_categories_owner_or_default ON expense_categories
  USING (
    user_id IS NULL
    OR user_id = current_setting('app.current_user_id')::uuid
  );

-- ---------------------------------------------------------------------------
-- planner
-- ---------------------------------------------------------------------------
--
-- Owner-only, with no public-read counterpart. FR-055 lists what a public trip
-- shows — route, cover image, cities, chosen notes and photos — and an itinerary
-- is not among them. Absence here is the enforcement.
CREATE POLICY itinerary_days_owner_only ON itinerary_days
  USING (trip_id IN (SELECT id FROM trips
                     WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY itinerary_items_owner_only ON itinerary_items
  USING (itinerary_day_id IN (SELECT d.id FROM itinerary_days d
                    JOIN trips t ON t.id = d.trip_id
                    WHERE t.owner_id = current_setting('app.current_user_id')::uuid));

-- The daily request allowance (FR-069) is counted from these rows, so a traveller
-- must never see anyone else's.
CREATE POLICY planner_requests_owner_only ON planner_requests
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- social
-- ---------------------------------------------------------------------------
--
-- A follow edge is visible to both ends: the follower needs their following list,
-- the followee needs their follower list and their pending approvals (FR-058).
CREATE POLICY follows_participant ON follows
  USING (
    follower_id = current_setting('app.current_user_id')::uuid
    OR followee_id = current_setting('app.current_user_id')::uuid
  );

-- Visible only to the blocker. The blocked traveller must not be able to discover
-- that they were blocked — FR-061 makes content unreachable, and a readable block
-- row would announce the fact instead.
CREATE POLICY blocks_blocker_only ON blocks
  USING (blocker_id = current_setting('app.current_user_id')::uuid);

-- A reporter can see what they filed (FR-062). Review happens out of band, under
-- the migration role, not through the API.
CREATE POLICY reports_reporter_only ON reports
  USING (reporter_id = current_setting('app.current_user_id')::uuid);

-- ---------------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------------
--
-- No other policy in this file references this table. That absence is the
-- mechanism behind Constitution V and FR-080: entitlement state cannot affect the
-- visibility, retention or readability of anything recorded, because no read path
-- can see it. Adversarial row 12 asserts the consequence — B's view of A's rows is
-- identical whether A's entitlement is active or lapsed.
CREATE POLICY subscriptions_owner_only ON subscriptions
  USING (user_id = current_setting('app.current_user_id')::uuid);
