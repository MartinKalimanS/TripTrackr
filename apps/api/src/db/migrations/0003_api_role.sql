-- 0003_api_role.sql (T023)
--
-- The API connects as `triptrackr_api`. Three properties of this role are what
-- make every policy in 0005 real rather than decorative
-- (contracts/data-access-policy.md §1):
--
--   1. It is NOT a superuser. RLS does not apply to superusers, so a superuser
--      connection would silently disable every policy while the behavioural
--      privacy tests continued to pass.
--   2. It does NOT own the tables. A table owner bypasses its own policies
--      unless FORCE is set — and relying on FORCE alone leaves one setting
--      between a traveller's expenses and a stranger. Not owning them means two
--      independent things must both fail before data leaks.
--   3. It has NO policy-alter rights. The API must never be able to rewrite the
--      rules it is subject to.
--
-- Migrations run as a different, privileged role. That separation is the point.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'triptrackr_api') THEN
    -- NOSUPERUSER / NOCREATEROLE / NOBYPASSRLS are stated explicitly rather than
    -- left to defaults, so that reading this file answers the question.
    CREATE ROLE triptrackr_api
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOBYPASSRLS
      NOINHERIT;
  END IF;
END
$$;

-- Reading and writing rows: yes. Changing the shape of the schema, or the
-- policies that govern it: no.
GRANT USAGE ON SCHEMA public TO triptrackr_api;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO triptrackr_api;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO triptrackr_api;

-- Tables created by later migrations inherit the same grants, so a new table is
-- never accidentally unreachable — nor accidentally over-granted.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO triptrackr_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO triptrackr_api;

-- Explicitly withheld: CREATE on the schema. Without it the role cannot create a
-- table it would then own, and therefore cannot manufacture a table that bypasses
-- the policies below.
REVOKE CREATE ON SCHEMA public FROM triptrackr_api;
