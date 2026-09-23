-- 0001_extensions.sql (T014)
--
-- Extensions must exist before any table that depends on their types is created,
-- which is why this runs ahead of the generated table migration rather than
-- alongside it. `cities.location` is GEOGRAPHY and `users.email` is CITEXT — both
-- are parse errors without the extension already installed.

-- Spatial types and functions. Globe arcs, distance totals, and the date-line
-- edge case all rely on GEOGRAPHY rather than a lat/lng pair (data-model.md §1).
CREATE EXTENSION IF NOT EXISTS postgis;

-- Case-insensitive text for email. Comparing lower(email) everywhere is the
-- alternative, and it only takes one query forgetting to do so for two accounts
-- to exist for the same address.
CREATE EXTENSION IF NOT EXISTS citext;

-- Trigram matching for the city picker's accent-stripped search (FR-014).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- gen_random_uuid() for primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
