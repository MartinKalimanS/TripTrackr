-- 0010_fx_backfill_from_row.sql
--
-- fx_backfill_expense (0009) took the home amount as an argument, computed by
-- the worker from the amount it had READ earlier through
-- fx_pending_expenses(). A traveller who edited a pending expense's amount
-- between that read and the backfill (the PATCH writes a new amount and leaves
-- the row pending) ended up with the new amount beside a home amount converted
-- from the old one — and FR-022 then froze the wrong value for good.
--
-- The keyhole now takes only the rate and computes the home amount from the
-- row it updates. UPDATE locks the row and re-reads it after any concurrent
-- write commits, so `expenses.amount` here is the amount being frozen.
-- round(numeric, 2) rounds half away from zero, which is exactly
-- convertAmount's ROUND_HALF_UP in @triptrackr/contracts (research D-26), for
-- refunds (negative amounts) as well.
--
-- The guarantees of 0009 are unchanged: SECURITY DEFINER, owned by the
-- migration role, reaching only live rows with fx_pending = true, executable
-- by the API role alone.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must own these functions (as 0009)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING MESSAGE =
      'Migrations must run as the database owner, a role with BYPASSRLS. '
      || 'Check MIGRATION_DATABASE_URL.';
  END IF;
END
$$;

DROP FUNCTION IF EXISTS fx_backfill_expense(UUID, NUMERIC, NUMERIC);

CREATE FUNCTION fx_backfill_expense(
  p_id    UUID,
  p_rate  NUMERIC(14,6)
)
RETURNS TABLE (id UUID)
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  UPDATE expenses
  SET fx_rate_to_home = p_rate,
      amount_home     = round(expenses.amount * p_rate, 2),
      fx_pending      = false,
      updated_at      = now()
  WHERE expenses.id = p_id
    AND expenses.fx_pending = true
    AND expenses.deleted_at IS NULL
  RETURNING expenses.id;
$fn$;

REVOKE ALL ON FUNCTION fx_backfill_expense(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fx_backfill_expense(UUID, NUMERIC) TO triptrackr_api;
