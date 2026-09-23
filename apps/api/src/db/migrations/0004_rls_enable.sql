-- 0004_rls_enable.sql (T024)
--
-- ENABLE and FORCE row level security on every traveller-owned table
-- (contracts/data-access-policy.md §1).
--
-- Both are required, and for different reasons:
--
--   ENABLE  makes the policies in 0005 apply at all. Without it they are inert
--           rows in pg_policy that never run.
--   FORCE   makes them apply to the *table owner* as well. Without FORCE, the
--           owner bypasses its own policies. Combined with 0003 — where the API
--           role deliberately does not own these tables — this means two
--           independent things must both be wrong before a policy stops running.
--
-- This file is hand-authored and must stay that way. A schema diff cannot
-- express intent, and the decision about which tables are traveller-owned is the
-- privacy decision this whole system rests on.
--
-- Deliberately absent: countries, cities, fx_rates. These are reference data —
-- a country's name and a Tuesday exchange rate belong to everyone. Their absence
-- here is asserted by test/privacy/catalogue.spec.ts, which requires every other
-- table in `public` to appear below.

DO $$
DECLARE
  owned_table TEXT;
BEGIN
  FOREACH owned_table IN ARRAY ARRAY[
    -- Accounts (data-model.md §2)
    'users',
    'oauth_identities',
    'refresh_tokens',
    -- Trips (§3)
    'trips',
    'trip_stops',
    -- Content (§4-5)
    'notes',
    'photos',
    'documents',
    -- Money (§6)
    'expense_categories',
    'expenses',
    -- Planner (§7)
    'itinerary_days',
    'itinerary_items',
    'planner_requests',
    -- Social (§8)
    'follows',
    'blocks',
    'reports',
    -- Commerce (§9)
    'subscriptions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', owned_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', owned_table);
  END LOOP;
END
$$;
