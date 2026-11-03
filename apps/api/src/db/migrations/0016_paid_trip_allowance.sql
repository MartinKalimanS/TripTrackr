-- 0016_paid_trip_allowance.sql (spec 014; research D14-01 to D14-12; data-model.md)
--
-- The paid trip allowance: single-trip credits, Tier 1 and Unlimited subscription years, and the
-- spend ledger that says which trips are covered by what.
--
--   trip_credits          one row per single-trip purchase (unique store transaction id)
--   subscription_periods  one row per paid subscription year
--   trip_covers           the spend ledger: one row per covered trip, NO foreign key to `trips`
--                         so the 90-day tombstone purge can never hand a spent credit back (D14-02)
--   allowance_shadow      while charging is off, who would have been stopped (aggregate only)
--
-- Visibility posture: all four tables are the traveller's own commerce records. None has a visibility
-- flag, none is readable by anyone but its owner, and NO policy, view, list or export of another table
-- may mention them (Constitution V). They decide whether a NEW trip can be created and nothing else.
--
-- Who writes:
--   - the request path (the API role under a traveller identity) may only INSERT a `trip_covers` row
--     for itself and read its own rows; `allowance_shadow` it may also update;
--   - the credits and the periods are written by the signature-verified webhook, which has no
--     traveller identity, through the SECURITY DEFINER `billing_*` functions at the end of this file
--     (the pattern of 0009, 0012, 0013 and 0014);
--   - the grandfather script runs as the owner role (research D14-06) and needs no keyhole.
--
-- Default privileges (0003) hand the API role SELECT, INSERT, UPDATE and DELETE on every new table,
-- so each table below REVOKEs what the design withholds, at the grant level beneath RLS.

-- ---------------------------------------------------------------------------
-- Precondition: the migration role must bypass RLS
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'The migration role must be a superuser or hold BYPASSRLS.',
      ERRCODE = '42501';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. trip_credits
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trip_credits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider       text NOT NULL,
  transaction_id text NOT NULL,
  product_id     text NOT NULL,
  purchased_at   timestamptz NOT NULL,
  refunded_at    timestamptz,
  CONSTRAINT trip_credits_provider_check CHECK (provider IN ('app_store', 'play_store')),
  -- A notification delivered twice must grant once (FR-023).
  CONSTRAINT trip_credits_transaction_id_key UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS trip_credits_user_idx ON trip_credits (user_id, purchased_at);

ALTER TABLE trip_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_credits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_credits_owner_read ON trip_credits;
CREATE POLICY trip_credits_owner_read ON trip_credits FOR SELECT
  USING (user_id = current_user_id());

REVOKE INSERT, UPDATE, DELETE ON trip_credits FROM triptrackr_api;

-- ---------------------------------------------------------------------------
-- 2. subscription_periods
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscription_periods (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                text NOT NULL,
  tier                    text NOT NULL,
  ladder_step             integer NOT NULL,
  original_transaction_id text NOT NULL,
  transaction_id          text NOT NULL,
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  uses_total              integer,
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  refunded_at             timestamptz,
  CONSTRAINT subscription_periods_provider_check CHECK (provider IN ('app_store', 'play_store')),
  CONSTRAINT subscription_periods_tier_check CHECK (tier IN ('tier1', 'unlimited')),
  CONSTRAINT subscription_periods_step_check CHECK (ladder_step BETWEEN 1 AND 3),
  CONSTRAINT subscription_periods_range_check CHECK (ends_at > starts_at),
  -- Tier 1 carries its yearly count; Unlimited has none to exceed.
  CONSTRAINT subscription_periods_uses_check CHECK (
    (tier = 'tier1' AND uses_total IS NOT NULL AND uses_total > 0)
    OR (tier = 'unlimited' AND uses_total IS NULL)
  ),
  -- A renewal delivered twice is one period.
  CONSTRAINT subscription_periods_renewal_key UNIQUE (original_transaction_id, starts_at)
);

CREATE INDEX IF NOT EXISTS subscription_periods_user_idx
  ON subscription_periods (user_id, ends_at DESC);
CREATE INDEX IF NOT EXISTS subscription_periods_txn_idx
  ON subscription_periods (transaction_id);

ALTER TABLE subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_periods FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscription_periods_owner_read ON subscription_periods;
CREATE POLICY subscription_periods_owner_read ON subscription_periods FOR SELECT
  USING (user_id = current_user_id());

REVOKE INSERT, UPDATE, DELETE ON subscription_periods FROM triptrackr_api;

-- ---------------------------------------------------------------------------
-- 3. trip_covers — the spend ledger
-- ---------------------------------------------------------------------------
-- `trip_id` is a plain uuid on purpose: the tombstone purge hard-deletes a deleted trip after 90
-- days, and a cover that cascaded away with it would make a spent credit spendable again (FR-006).
CREATE TABLE IF NOT EXISTS trip_covers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trip_id    uuid NOT NULL,
  source     text NOT NULL,
  credit_id  uuid REFERENCES trip_credits(id),
  period_id  uuid REFERENCES subscription_periods(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A trip is covered once; a replayed create spends nothing.
  CONSTRAINT trip_covers_trip_id_key UNIQUE (trip_id),
  -- A credit is spent once.
  CONSTRAINT trip_covers_credit_id_key UNIQUE (credit_id),
  CONSTRAINT trip_covers_source_check CHECK (
    source IN ('credit', 'year', 'unlimited', 'grandfathered')
    AND ((source = 'credit') = (credit_id IS NOT NULL))
    AND ((source IN ('year', 'unlimited')) = (period_id IS NOT NULL))
  )
);

CREATE INDEX IF NOT EXISTS trip_covers_user_idx ON trip_covers (user_id);
CREATE INDEX IF NOT EXISTS trip_covers_period_idx ON trip_covers (period_id) WHERE period_id IS NOT NULL;

ALTER TABLE trip_covers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_covers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_covers_owner_read ON trip_covers;
CREATE POLICY trip_covers_owner_read ON trip_covers FOR SELECT
  USING (user_id = current_user_id());

DROP POLICY IF EXISTS trip_covers_owner_insert ON trip_covers;
CREATE POLICY trip_covers_owner_insert ON trip_covers FOR INSERT
  WITH CHECK (user_id = current_user_id());

-- No UPDATE and no DELETE for the API role: a cover is never edited or erased by a request. A refund
-- removes it through `billing_refund`.
REVOKE UPDATE, DELETE ON trip_covers FROM triptrackr_api;

-- The guard behind the service (research D14-04). It takes the same per-traveller advisory lock the
-- service takes (re-entrant within one transaction) and refuses a `year` cover past the year's count
-- or outside its dates, and an `unlimited` cover outside an active Unlimited period. SECURITY
-- DEFINER only so it can read the period whatever the caller's grants are; it writes nothing.
CREATE OR REPLACE FUNCTION trip_covers_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  p subscription_periods%ROWTYPE;
  v_spent integer;
BEGIN
  IF NEW.source NOT IN ('year', 'unlimited') THEN
    RETURN NEW;
  END IF;

  -- A year or unlimited cover with no period is the CHECK constraint's to refuse, with its own name.
  IF NEW.period_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));

  SELECT * INTO p FROM subscription_periods WHERE id = NEW.period_id;

  IF NOT FOUND
     OR p.user_id <> NEW.user_id
     OR p.refunded_at IS NOT NULL
     OR NOT (p.starts_at <= now() AND now() < p.ends_at)
     OR (NEW.source = 'year' AND p.tier <> 'tier1')
     OR (NEW.source = 'unlimited' AND p.tier <> 'unlimited') THEN
    RAISE EXCEPTION USING
      MESSAGE = 'The subscription period is not active for this cover.',
      ERRCODE = 'P0001';
  END IF;

  IF NEW.source = 'year' THEN
    SELECT count(*)::integer INTO v_spent
    FROM trip_covers c WHERE c.period_id = NEW.period_id AND c.source = 'year';

    IF v_spent >= p.uses_total THEN
      RAISE EXCEPTION USING
        MESSAGE = 'The subscription year has no uses left.',
        ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION trip_covers_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trip_covers_guard ON trip_covers;
CREATE TRIGGER trip_covers_guard
  BEFORE INSERT ON trip_covers
  FOR EACH ROW EXECUTE FUNCTION trip_covers_guard();

-- ---------------------------------------------------------------------------
-- 4. allowance_shadow — who would have been stopped, while charging is off (FR-027)
-- ---------------------------------------------------------------------------
-- A user id and two counters. No trip title, date or place is ever written here.
CREATE TABLE IF NOT EXISTS allowance_shadow (
  user_id          uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_blocked_at timestamptz NOT NULL DEFAULT now(),
  attempts         integer NOT NULL DEFAULT 1,
  CONSTRAINT allowance_shadow_attempts_check CHECK (attempts > 0)
);

ALTER TABLE allowance_shadow ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_shadow FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allowance_shadow_owner_only ON allowance_shadow;
CREATE POLICY allowance_shadow_owner_only ON allowance_shadow
  USING (user_id = current_user_id())
  WITH CHECK (user_id = current_user_id());

REVOKE DELETE ON allowance_shadow FROM triptrackr_api;

-- ---------------------------------------------------------------------------
-- 5. The keyholes the webhook calls (SECURITY DEFINER, owned by the migration role)
-- ---------------------------------------------------------------------------
-- RevenueCat calls the API with NO traveller identity, so under FORCE ROW LEVEL SECURITY the webhook
-- sees no row and holds no write grant. Each function does one thing, takes the store's identifiers
-- and a traveller id, and never a trip, a title or anything a traveller wrote. They are reachable
-- only from the signature-verified webhook handler (REVOKE FROM PUBLIC, GRANT to the API role, like
-- the other keyholes); a traveller id for an account that no longer exists is discarded, not an error,
-- so a late notification can never recreate or touch a deleted account.

-- 5a. billing_grant_credit — one credit per store transaction, idempotent.
CREATE OR REPLACE FUNCTION billing_grant_credit(
  p_user        UUID,
  p_provider    TEXT,
  p_txn         TEXT,
  p_product     TEXT,
  p_purchased   TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_inserted BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user) THEN
    RETURN FALSE;
  END IF;

  INSERT INTO trip_credits (user_id, provider, transaction_id, product_id, purchased_at)
  VALUES (p_user, p_provider, p_txn, p_product, p_purchased)
  ON CONFLICT (transaction_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN v_inserted > 0;
END
$fn$;

-- 5b. billing_refresh_entitlement — keeps the `subscriptions` cache (spec 013) in step with the
--     periods. Internal: called by the functions below, not granted to anyone.
CREATE OR REPLACE FUNCTION billing_refresh_entitlement(p_user UUID, p_provider TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_active BOOLEAN;
  v_end    TIMESTAMPTZ;
BEGIN
  SELECT
    COALESCE(bool_or(starts_at <= now() AND now() < ends_at AND refunded_at IS NULL), FALSE),
    max(ends_at) FILTER (WHERE refunded_at IS NULL)
  INTO v_active, v_end
  FROM subscription_periods WHERE user_id = p_user;

  INSERT INTO subscriptions (user_id, is_active, current_period_end, provider, entitlement_synced_at)
  VALUES (p_user, v_active, v_end, p_provider, now())
  ON CONFLICT (user_id) DO UPDATE
    SET is_active = EXCLUDED.is_active,
        current_period_end = EXCLUDED.current_period_end,
        provider = EXCLUDED.provider,
        entitlement_synced_at = EXCLUDED.entitlement_synced_at;
END
$fn$;

-- 5c. billing_open_period — a purchase, renewal or cancel-flag change of a subscription year.
--     Idempotent on (original transaction, start). The ladder step counts the unbroken chain of
--     earlier periods behind this one (gap of up to 3 days tolerated) and stops at the floor, 3.
CREATE OR REPLACE FUNCTION billing_open_period(
  p_user           UUID,
  p_provider       TEXT,
  p_tier           TEXT,
  p_orig_txn       TEXT,
  p_txn            TEXT,
  p_starts         TIMESTAMPTZ,
  p_ends           TIMESTAMPTZ,
  p_uses_total     INTEGER,
  p_cancel_at_end  BOOLEAN
) RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_cursor TIMESTAMPTZ := p_starts;
  v_chain  INTEGER := 0;
  v_prev   subscription_periods%ROWTYPE;
  v_id     UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user) THEN
    RETURN NULL;
  END IF;

  LOOP
    SELECT * INTO v_prev FROM subscription_periods s
    WHERE s.user_id = p_user
      AND s.refunded_at IS NULL
      AND s.starts_at < v_cursor
      AND s.ends_at BETWEEN v_cursor - interval '3 days' AND v_cursor + interval '3 days'
    ORDER BY s.ends_at DESC LIMIT 1;
    EXIT WHEN NOT FOUND OR v_chain >= 2;
    v_chain := v_chain + 1;
    v_cursor := v_prev.starts_at;
  END LOOP;

  INSERT INTO subscription_periods
    (user_id, provider, tier, ladder_step, original_transaction_id, transaction_id,
     starts_at, ends_at, uses_total, cancel_at_period_end)
  VALUES
    (p_user, p_provider, p_tier, LEAST(v_chain + 1, 3), p_orig_txn, p_txn,
     p_starts, p_ends, p_uses_total, p_cancel_at_end)
  ON CONFLICT (original_transaction_id, starts_at) DO UPDATE
    SET ends_at = EXCLUDED.ends_at,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end
  RETURNING id INTO v_id;

  PERFORM billing_refresh_entitlement(p_user, p_provider);
  RETURN v_id;
END
$fn$;

-- 5d. billing_end_period — an expiration: the year stops at that moment if it would have run on.
--     Trips it covered stay covered.
CREATE OR REPLACE FUNCTION billing_end_period(p_orig_txn TEXT, p_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user     UUID;
  v_provider TEXT;
BEGIN
  UPDATE subscription_periods
     SET ends_at = p_at
   WHERE original_transaction_id = p_orig_txn
     AND ends_at > p_at AND starts_at < p_at
  RETURNING user_id, provider INTO v_user, v_provider;

  IF v_user IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM billing_refresh_entitlement(v_user, v_provider);
  RETURN TRUE;
END
$fn$;

-- 5e. billing_refund — a refund of a credit or of a subscription year, by the store's transaction id.
--     An unspent credit becomes unspendable. A spent credit's cover is removed, so its trip becomes an
--     ordinary trip: the trip itself is never touched (FR-024). A refunded year covers nothing more;
--     trips it covered stay covered. A second call changes nothing.
CREATE OR REPLACE FUNCTION billing_refund(p_txn TEXT, p_at TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_credit  trip_credits%ROWTYPE;
  v_period  subscription_periods%ROWTYPE;
BEGIN
  SELECT * INTO v_credit FROM trip_credits WHERE transaction_id = p_txn;
  IF FOUND THEN
    UPDATE trip_credits SET refunded_at = COALESCE(refunded_at, p_at) WHERE id = v_credit.id;
    DELETE FROM trip_covers WHERE credit_id = v_credit.id;
    RETURN 'credit';
  END IF;

  SELECT * INTO v_period FROM subscription_periods WHERE transaction_id = p_txn;
  IF FOUND THEN
    UPDATE subscription_periods SET refunded_at = COALESCE(refunded_at, p_at)
     WHERE id = v_period.id;
    PERFORM billing_refresh_entitlement(v_period.user_id, v_period.provider);
    RETURN 'period';
  END IF;

  RETURN 'none';
END
$fn$;

-- Grants — REVOKE FROM PUBLIC first, then the API role only. `billing_refresh_entitlement` is an
-- internal helper and is granted to no one.
REVOKE ALL ON FUNCTION billing_grant_credit(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing_refresh_entitlement(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing_open_period(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing_end_period(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION billing_refund(TEXT, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION billing_grant_credit(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION billing_open_period(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION billing_end_period(TEXT, TIMESTAMPTZ) TO triptrackr_api;
GRANT EXECUTE ON FUNCTION billing_refund(TEXT, TIMESTAMPTZ) TO triptrackr_api;
