-- 0009_us2_categories_and_fx.sql (T205)
--
-- What User Story 2 needs from the database that 0002–0008 did not give it:
--
--   1. The six system expense categories (FR-023), seeded with the FIXED ids
--      published in @triptrackr/contracts as SYSTEM_EXPENSE_CATEGORIES
--      (research D-29). The sync feed excludes system rows on purpose
--      (sync-protocol.md §1), so the device must know these ids without a
--      fetch — a first expense logged in aeroplane mode carries a category_id
--      the server already recognises. Changing an id here without changing the
--      contract breaks every offline device; the contract test pins both.
--   2. An index for the FX lookup the expense path makes on every write: the
--      latest snapshot for one (base, quote) pair. The primary key already
--      covers (base, quote, as_of); this is the descending variant so "latest"
--      is an index-only scan rather than a sort.
--   3. Two keyholes for the worker's FX backfill (research D-10, D-28). The
--      worker connects as the API role with NO traveller identity, and
--      `expenses_owner_only` (0005) therefore shows it nothing — correct, and
--      exactly why a backfill cannot be a plain UPDATE from that process. The
--      functions below are SECURITY DEFINER, owned by the migration role, and
--      see ONLY rows with `fx_pending = true`: they can read a pending row's
--      amount and currency, and write a rate onto a pending row once. A row
--      that already carries a rate is out of their reach by construction,
--      which is FR-022 enforced where the constitution says enforcement belongs.
--
-- `fx_rates` itself is reference data outside RLS (0004 lists it as
-- deliberately absent), and 0003's default privileges already give the API
-- role INSERT/UPDATE on it — which is what the worker's daily upsert uses,
-- through DATABASE_URL, never the owner (research D-20). `expense_categories`
-- writes by travellers stay pinned to their own user_id (0007 §5); the rows
-- seeded here are inserted by the migration role, which the policy does not
-- bind.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS (as 0007, 0008)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. '
      || 'Seeding system categories (user_id IS NULL) is refused by the write '
      || 'policy for any other role. Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. System expense categories — ids match SYSTEM_EXPENSE_CATEGORIES
-- ---------------------------------------------------------------------------
--
-- ON CONFLICT DO NOTHING on the primary key, so re-running is a no-op and a
-- deployment that seeded them earlier by hand keeps what it has. The unique
-- (user_id, name) NULLS NOT DISTINCT key (0002) is what makes a second "Food"
-- system row impossible by any path.
INSERT INTO expense_categories (id, user_id, name, icon) VALUES
  ('00000000-0000-4000-8000-000000000001', NULL, 'Food',       'food'),
  ('00000000-0000-4000-8000-000000000002', NULL, 'Lodging',    'lodging'),
  ('00000000-0000-4000-8000-000000000003', NULL, 'Transport',  'transport'),
  ('00000000-0000-4000-8000-000000000004', NULL, 'Activities', 'activities'),
  ('00000000-0000-4000-8000-000000000005', NULL, 'Shopping',   'shopping'),
  ('00000000-0000-4000-8000-000000000006', NULL, 'Other',      'other')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Latest-snapshot lookup for the expense write path
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS fx_rates_pair_latest_idx
  ON fx_rates (base_currency, quote_currency, as_of DESC);

-- ---------------------------------------------------------------------------
-- 3. fx_pending_expenses / fx_backfill_expense — the worker's backfill keyholes
-- ---------------------------------------------------------------------------
--
-- Read: every live expense still awaiting a rate, with the home currency of
-- its trip — the two facts the cross rate needs. Nothing else about the row,
-- and nothing about a row that already converted.
CREATE OR REPLACE FUNCTION fx_pending_expenses()
RETURNS TABLE (
  id            UUID,
  amount        NUMERIC(12,2),
  currency      CHAR(3),
  home_currency CHAR(3)
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT e.id, e.amount, e.currency, t.home_currency
  FROM expenses e
  JOIN trips t ON t.id = e.trip_id
  WHERE e.fx_pending = true
    AND e.deleted_at IS NULL
    AND t.deleted_at IS NULL
  ORDER BY e.created_at, e.id;
$fn$;

-- Write: freeze one rate onto one pending row. The WHERE clause is the
-- guarantee: a row whose `fx_pending` is already false matches nothing, so
-- calling this with any id, any number of times, can only ever perform the
-- one-time backfill data-model.md §6 describes. `updated_at` moves so the
-- device learns the conversion on its next pull (sync-protocol.md §1).
CREATE OR REPLACE FUNCTION fx_backfill_expense(
  p_id           UUID,
  p_rate         NUMERIC(14,6),
  p_amount_home  NUMERIC(12,2)
)
RETURNS TABLE (id UUID)
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE expenses
  SET fx_rate_to_home = p_rate,
      amount_home     = p_amount_home,
      fx_pending      = false,
      updated_at      = now()
  WHERE expenses.id = p_id
    AND expenses.fx_pending = true
    AND expenses.deleted_at IS NULL
  RETURNING expenses.id;
$fn$;

-- Grants — REVOKE FROM PUBLIC first, then the API role only (as 0006, 0008).
REVOKE ALL ON FUNCTION fx_pending_expenses() FROM PUBLIC;
REVOKE ALL ON FUNCTION fx_backfill_expense(UUID, NUMERIC, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fx_pending_expenses() TO triptrackr_api;
GRANT EXECUTE ON FUNCTION fx_backfill_expense(UUID, NUMERIC, NUMERIC) TO triptrackr_api;
