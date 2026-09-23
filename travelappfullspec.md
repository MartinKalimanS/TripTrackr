# TripTrackr — Full Technical Specification

_Companion to `travel-app-blueprint.md`. Where the blueprint made the case for decisions, this document specifies them concretely enough to prompt Claude Code module-by-module. Confirmed stack: React Native (Expo dev-client) · NestJS · PostgreSQL + PostGIS (self-hosted via Docker, dev and prod) · Redis · S3-compatible storage (MinIO in Docker) · Mapbox GL (globe projection, Geocoding API, Directions API) · Claude API for the planner._

---

## 1. Scope & how to use this document

This spec is organized so each numbered section can be lifted almost directly into a Claude Code prompt ("build the schema in §3", "implement the endpoints in §4.3", etc.). Sections are ordered to match the recommended build order from the blueprint (§11): schema and auth first, globe and planner last. Where a decision was open in the blueprint, it's now resolved: geocoding/places/directions all run through **Mapbox**, and production Postgres is **self-hosted in Docker**, matching your original plan.

**Priority note:** the offline sync engine (§4.11, §5.3) is now a hard gate before the social module (§4.9) — see §12 for the reasoning and the reordered build sequence.

---

## 2. System architecture

```
                         ┌─────────────────────────┐
                         │   Mobile App (RN/Expo)   │
                         │  - Mapbox GL (globe/map) │
                         │  - WatermelonDB (local)  │
                         │  - React Query + Zustand │
                         └────────────┬─────────────┘
                                      │ HTTPS (REST, JWT)
                         ┌────────────▼─────────────┐
                         │   Nginx / Traefik (TLS,   │
                         │   rate limiting, routing)  │
                         └────────────┬─────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
   ┌──────────▼─────────┐  ┌──────────▼──────────┐  ┌──────────▼──────────┐
   │  API service        │  │  Planner service     │  │  Media worker        │
   │  (NestJS)            │  │  (NestJS module or   │  │  (queue consumer:    │
   │  - Auth               │  │   separate service)  │  │   thumbnails, EXIF,  │
   │  - Trips/Notes/       │  │  - Claude API call    │  │   NSFW scan)         │
   │    Expenses/Social    │  │  - Mapbox Geocoding   │  │                      │
   │                        │  │  - Mapbox Directions  │  │                      │
   └──────────┬────────────┘  └──────────┬────────────┘  └──────────┬───────────┘
              │                            │                          │
              └─────────────┬──────────────┴─────────────┬────────────┘
                             │                             │
                  ┌──────────▼──────────┐        ┌─────────▼─────────┐
                  │ PostgreSQL + PostGIS │        │  Redis             │
                  │ (Docker, self-hosted)│        │  (sessions, cache, │
                  │  + RLS policies      │        │   rate limits,     │
                  └───────────────────────┘        │   planner cache)   │
                                                     └────────────────────┘
                             │
                  ┌──────────▼──────────┐
                  │ MinIO / S3           │
                  │ (photos, documents)  │
                  └───────────────────────┘
```

All client traffic terminates at a reverse proxy (Nginx or Traefik) that handles TLS termination and coarse-grained rate limiting before reaching the API. The planner is deliberately a separate module/service boundary even if co-deployed initially, because it has a different latency and cost profile (LLM + external API calls) than the CRUD-heavy main API, and you'll likely want to scale, cache, and rate-limit it independently.

---

## 3. Database schema (PostgreSQL + PostGIS)

Enable extensions first:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 3.1 Reference geo data

```sql
CREATE TABLE countries (
  id            SMALLSERIAL PRIMARY KEY,
  iso_code      CHAR(2) UNIQUE NOT NULL,       -- ISO 3166-1 alpha-2
  name          TEXT NOT NULL,
  continent     TEXT NOT NULL
);

CREATE TABLE cities (
  id            SERIAL PRIMARY KEY,
  country_id    SMALLINT NOT NULL REFERENCES countries(id),
  name          TEXT NOT NULL,
  ascii_name    TEXT NOT NULL,                  -- for search without diacritics
  location      GEOGRAPHY(POINT, 4326) NOT NULL, -- lat/lng
  timezone      TEXT NOT NULL,                   -- IANA tz, e.g. Europe/Rome
  population    INT DEFAULT 0                    -- for ranking city-picker results
);
CREATE INDEX idx_cities_country ON cities(country_id);
CREATE INDEX idx_cities_location ON cities USING GIST(location);
CREATE INDEX idx_cities_name_trgm ON cities USING GIN(ascii_name gin_trgm_ops); -- requires pg_trgm
```

Seed `countries`/`cities` once from a GeoNames extract (cities15000 or cities5000 dataset) in a migration/seed script — don't build this by hand.

### 3.2 Users & auth

```sql
CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT UNIQUE NOT NULL,       -- requires citext extension
  password_hash     TEXT,                          -- null if OAuth-only account
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  bio               TEXT,
  home_currency     CHAR(3) NOT NULL DEFAULT 'USD', -- ISO 4217
  is_profile_public BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE oauth_identities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_uid TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_uid)
);

CREATE TABLE refresh_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,          -- store hash, never the raw token
  device_info  TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
```

### 3.3 Trips & stops

```sql
CREATE TABLE trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','active','past')),
  is_public     BOOLEAN NOT NULL DEFAULT false,
  home_currency CHAR(3) NOT NULL,
  cover_photo_id UUID,                 -- FK to photos, added after photos table exists
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_trips_owner ON trips(owner_id);
CREATE INDEX idx_trips_public ON trips(is_public) WHERE is_public = true;

CREATE TABLE trip_stops (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city_id      INT NOT NULL REFERENCES cities(id),
  sort_order   SMALLINT NOT NULL,
  arrive_date  DATE NOT NULL,
  depart_date  DATE NOT NULL,
  CHECK (depart_date >= arrive_date)
);
CREATE INDEX idx_trip_stops_trip ON trip_stops(trip_id, sort_order);
```

Origin/destination arcs for the globe are derived, not stored: an arc is simply the great-circle line between `trip_stops[i].city.location` and `trip_stops[i+1].city.location` for each consecutive pair, computed client-side (Turf.js) from the stop list. This keeps the data model normalized and means adding a mid-trip stop doesn't require touching an "arcs" table.

### 3.4 Notes, photos, documents

```sql
CREATE TABLE notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  country_id  SMALLINT REFERENCES countries(id),   -- set when note is country-level
  city_id     INT REFERENCES cities(id),            -- set when moved into a specific city
  title       TEXT,
  body        TEXT NOT NULL,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ,              -- soft-delete: sync engine (§4.11) needs deletes to be syncable changes
  CHECK (country_id IS NOT NULL OR city_id IS NOT NULL)
);
CREATE INDEX idx_notes_trip ON notes(trip_id);
CREATE INDEX idx_notes_sync ON notes(updated_at);  -- supports the §4.11 pull cursor

CREATE TABLE photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city_id      INT REFERENCES cities(id),
  storage_key  TEXT NOT NULL,          -- S3 object key, private bucket
  thumb_key    TEXT,                    -- generated by media worker
  taken_at     TIMESTAMPTZ,             -- from EXIF, if present
  exif_lat     DOUBLE PRECISION,
  exif_lng     DOUBLE PRECISION,
  is_public    BOOLEAN NOT NULL DEFAULT false,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending','approved','rejected')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_photos_trip ON photos(trip_id);
CREATE INDEX idx_photos_sync ON photos(updated_at);

ALTER TABLE trips ADD CONSTRAINT fk_trips_cover_photo FOREIGN KEY (cover_photo_id) REFERENCES photos(id);

CREATE TABLE documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('boarding_pass','booking','other')),
  storage_key  TEXT NOT NULL,
  encrypted    BOOLEAN NOT NULL DEFAULT true,
  parsed_json  JSONB,                  -- extracted flight no/date/PNR if boarding pass barcode was parsed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
  -- no is_public column at all: documents are never shareable, by omission not by flag
);
CREATE INDEX idx_documents_sync ON documents(updated_at);
```

### 3.5 Expenses

```sql
CREATE TABLE expense_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,  -- null = system default category
  name       TEXT NOT NULL,
  icon       TEXT,
  UNIQUE(user_id, name)
);
-- seed system defaults with user_id = NULL: Food, Lodging, Transport, Activities, Shopping, Other

CREATE TABLE expenses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city_id            INT REFERENCES cities(id),
  category_id        UUID NOT NULL REFERENCES expense_categories(id),
  amount             NUMERIC(12,2) NOT NULL,
  currency           CHAR(3) NOT NULL,
  fx_rate_to_home    NUMERIC(14,6) NOT NULL,        -- rate at time of entry
  amount_home        NUMERIC(12,2) NOT NULL,        -- amount * fx_rate_to_home, precomputed
  spent_at           DATE NOT NULL,
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
  -- deliberately NO is_public column: expenses are never public, enforced by omission + RLS below
);
CREATE INDEX idx_expenses_trip ON expenses(trip_id);
CREATE INDEX idx_expenses_trip_category ON expenses(trip_id, category_id);
CREATE INDEX idx_expenses_sync ON expenses(updated_at);
```

### 3.6 Planner / itinerary

```sql
CREATE TABLE itinerary_days (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  city_id    INT NOT NULL REFERENCES cities(id),
  day_date   DATE NOT NULL,
  UNIQUE(trip_id, day_date)
);

CREATE TABLE itinerary_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_day_id UUID NOT NULL REFERENCES itinerary_days(id) ON DELETE CASCADE,
  sort_order       SMALLINT NOT NULL,
  place_name       TEXT NOT NULL,
  location         GEOGRAPHY(POINT, 4326) NOT NULL,
  mapbox_place_id  TEXT,                 -- from Geocoding API, for re-lookup/dedup
  source           TEXT NOT NULL CHECK (source IN ('ai_suggested','user_added')),
  note             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_items_day ON itinerary_items(itinerary_day_id, sort_order);
```

### 3.7 Social

```sql
CREATE TABLE follows (
  follower_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('pending','accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);

CREATE TABLE reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   UUID NOT NULL REFERENCES users(id),
  target_type   TEXT NOT NULL CHECK (target_type IN ('trip','note','photo','user')),
  target_id     UUID NOT NULL,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','dismissed','actioned')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
  blocker_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
```

### 3.8 Row-level security (defense-in-depth for privacy)

Enable RLS and set the app's DB role to a non-superuser so policies actually apply; the API sets `app.current_user_id` per request via `SET LOCAL`.

Note on the `deleted_at` columns added in §3.4–3.5 for sync support: every normal read endpoint (§4.4–4.6) filters `deleted_at IS NULL`; only `GET /sync/pull` (§4.11) intentionally returns soft-deleted rows, since the whole point there is telling other devices "this was deleted." Keep that filter in the query layer (a repository base class or ORM default scope) rather than repeating `WHERE deleted_at IS NULL` by hand in every query — a forgotten one silently resurrects deleted content.

```sql
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY trips_owner_full_access ON trips
  USING (owner_id = current_setting('app.current_user_id')::uuid);

CREATE POLICY trips_public_read ON trips
  FOR SELECT
  USING (is_public = true);

CREATE POLICY notes_owner_full_access ON notes
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY notes_public_read ON notes
  FOR SELECT
  USING (is_public = true AND trip_id IN (SELECT id FROM trips WHERE is_public = true));

-- same pattern repeated for photos

-- expenses and documents: NO public-read policy is ever defined.
-- Only an owner-access policy exists, so there is no code path — buggy or
-- otherwise — that can return another user's expense or document row.
CREATE POLICY expenses_owner_only ON expenses
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = current_setting('app.current_user_id')::uuid));

CREATE POLICY documents_owner_only ON documents
  USING (trip_id IN (SELECT id FROM trips WHERE owner_id = current_setting('app.current_user_id')::uuid));
```

This is the single most important security property in the schema: **the "expenses are never public" rule is enforced by the absence of a public-read policy**, not by an `is_public` flag the application layer has to remember to check.

---

## 4. REST API specification

Base URL: `https://api.triptrackr.app/v1`. All endpoints except auth/register/login/oauth require `Authorization: Bearer <access_token>`. Standard error shape:

```json
{
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "Trip does not exist or you do not have access."
  }
}
```

### 4.1 Auth

| Method | Path                 | Body                              | Notes                                                                                |
| ------ | -------------------- | --------------------------------- | ------------------------------------------------------------------------------------ |
| POST   | `/auth/register`     | `{email, password, display_name}` | Creates account, sends verification email, returns tokens                            |
| POST   | `/auth/login`        | `{email, password}`               | Returns `{access_token, refresh_token, user}`                                        |
| POST   | `/auth/oauth/google` | `{id_token}`                      | Verifies Google ID token server-side; creates account if none exists; returns tokens |
| POST   | `/auth/oauth/apple`  | `{identity_token}`                | Same, for Sign in with Apple                                                         |
| POST   | `/auth/refresh`      | `{refresh_token}`                 | Rotates refresh token (old one revoked), returns new pair                            |
| POST   | `/auth/logout`       | `{refresh_token}`                 | Revokes the given refresh token                                                      |
| POST   | `/auth/logout-all`   | —                                 | Revokes all refresh tokens for the user (e.g. "log out everywhere")                  |

Access tokens: JWT, 15 min expiry. Refresh tokens: opaque random string, hashed before storage, 30-day expiry, rotated on every use (old token marked `revoked_at`, reuse of a revoked token revokes the entire token family — standard refresh-token-rotation theft detection).

### 4.2 Users / profile

| Method | Path         | Notes                                                                                |
| ------ | ------------ | ------------------------------------------------------------------------------------ |
| GET    | `/me`        | Current user profile + stats (countries visited, trips count)                        |
| PATCH  | `/me`        | Update display name, bio, avatar, home currency, `is_profile_public`                 |
| GET    | `/users/:id` | Public profile view (404s if profile is private and requester doesn't follow)        |
| DELETE | `/me`        | Account deletion — cascades per §7.4                                                 |
| GET    | `/me/export` | GDPR data export, returns a signed URL to a generated JSON+media archive (async job) |

### 4.3 Trips & stops

| Method | Path                       | Body / Notes                                                                                               |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| GET    | `/trips`                   | List own trips, filter by `status`                                                                         |
| POST   | `/trips`                   | `{title, home_currency}` — creates trip in `planning` status                                               |
| GET    | `/trips/:id`               | Full trip detail (owner) or public view (non-owner, only if `is_public`)                                   |
| PATCH  | `/trips/:id`               | Update title, status, `is_public`, cover_photo_id                                                          |
| DELETE | `/trips/:id`               | Cascades stops/notes/photos/expenses/documents                                                             |
| POST   | `/trips/:id/stops`         | `{city_id, arrive_date, depart_date, sort_order}`                                                          |
| PATCH  | `/trips/:id/stops/:stopId` | Update dates / reorder                                                                                     |
| DELETE | `/trips/:id/stops/:stopId` | Remove a stop                                                                                              |
| GET    | `/trips/:id/arcs`          | Derived: array of `{from: [lng,lat], to: [lng,lat]}` great-circle pairs for the globe, computed from stops |

### 4.4 Notes

| Method | Path                   | Body / Notes                                                       |
| ------ | ---------------------- | ------------------------------------------------------------------ |
| GET    | `/trips/:tripId/notes` | Optional `?city_id=` / `?country_id=` filter                       |
| POST   | `/trips/:tripId/notes` | `{title, body, country_id, city_id?, is_public}`                   |
| PATCH  | `/notes/:id`           | Including moving a note from country-level to a specific `city_id` |
| DELETE | `/notes/:id`           |                                                                    |

### 4.5 Photos

| Method | Path                               | Body / Notes                                                                                                                  |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/photos/upload-url` | Returns a pre-signed S3 PUT URL; client uploads directly to storage                                                           |
| POST   | `/trips/:tripId/photos`            | `{storage_key, city_id, taken_at, exif_lat, exif_lng}` — registers metadata after upload completes; triggers media worker job |
| GET    | `/trips/:tripId/photos`            | List, with signed GET URLs for private objects                                                                                |
| PATCH  | `/photos/:id`                      | Toggle `is_public` (only allowed once `moderation_status = 'approved'` for public)                                            |
| DELETE | `/photos/:id`                      |                                                                                                                               |

### 4.6 Documents (boarding passes / bookings)

| Method | Path                                  | Body / Notes                                                                                                                                 |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/documents/upload-url` | Pre-signed upload URL                                                                                                                        |
| POST   | `/trips/:tripId/documents`            | `{storage_key, type}` — server encrypts at rest; if `type=boarding_pass` and a barcode payload was parsed client-side, accepts `parsed_json` |
| GET    | `/trips/:tripId/documents`            | Owner only, always                                                                                                                           |
| DELETE | `/documents/:id`                      |                                                                                                                                              |

### 4.7 Expenses

| Method | Path                              | Body / Notes                                                                                                 |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/trips/:tripId/expenses`         | Filter by `city_id`, `category_id`, date range                                                               |
| POST   | `/trips/:tripId/expenses`         | `{amount, currency, category_id, city_id, spent_at, note}` — server looks up FX rate, computes `amount_home` |
| PATCH  | `/expenses/:id`                   |                                                                                                              |
| DELETE | `/expenses/:id`                   |                                                                                                              |
| GET    | `/trips/:tripId/expenses/summary` | `{by_category: [...], by_day: [...], total_home}` — precomputed aggregates for charts                        |
| GET    | `/expense-categories`             | System defaults + the current user's custom categories                                                       |
| POST   | `/expense-categories`             | `{name, icon}` — creates a user-scoped custom category                                                       |

### 4.8 Planner

| Method | Path                                         | Body / Notes                                                                                 |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/planner/generate`            | `{city_id, day_date, prompt}` e.g. "2 days, love art and food" — async job, returns `job_id` |
| GET    | `/planner/jobs/:jobId`                       | Poll job status; on completion returns generated `itinerary_days`/`items`                    |
| GET    | `/trips/:tripId/itinerary`                   | Full itinerary, all days                                                                     |
| POST   | `/trips/:tripId/itinerary/days/:dayId/items` | Manually add an item                                                                         |
| PATCH  | `/itinerary-items/:id`                       | Reorder (change `sort_order`/`itinerary_day_id` — i.e. drag between days)                    |
| DELETE | `/itinerary-items/:id`                       |                                                                                              |
| GET    | `/trips/:tripId/itinerary/days/:dayId/route` | Returns the Mapbox Directions walking route (GeoJSON) through that day's items in order      |

### 4.9 Social

| Method | Path                          | Body / Notes                                                                                                                     |
| ------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/users/:id/follow`           | Creates follow (auto-accepted if target profile is public, `pending` if private)                                                 |
| DELETE | `/users/:id/follow`           | Unfollow                                                                                                                         |
| POST   | `/follow-requests/:id/accept` | For private profiles                                                                                                             |
| GET    | `/feed`                       | Public trips from followed users, paginated, newest first                                                                        |
| GET    | `/discover`                   | Public trips globally, optionally filtered by `city_id`/`country_id` — powers "see other itineraries for a city you're visiting" |
| POST   | `/reports`                    | `{target_type, target_id, reason}`                                                                                               |
| POST   | `/users/:id/block`            |                                                                                                                                  |

### 4.10 Lookups

| Method | Path                    | Notes                                                                  |
| ------ | ----------------------- | ---------------------------------------------------------------------- |
| GET    | `/countries`            | Full list, cached aggressively (changes essentially never)             |
| GET    | `/countries/:id/cities` | `?q=` search param for autocomplete, ranked by population/prefix match |

### 4.11 Sync (offline-first engine — build & verify before §4.9 Social)

These endpoints exist specifically to support §5.3's local-first mobile store. They cover the four offline-authored tables: `notes`, `expenses`, `photos` (metadata only — binary upload still goes through §4.5), and `documents` (metadata only, §4.6).

| Method | Path                                                                | Body / Notes                                                                                                                                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/sync/pull?cursor=<opaque>&tables=notes,expenses,photos,documents` | Returns `{changes: {notes: [...], expenses: [...], ...}, next_cursor}` — all rows with `updated_at` (or `deleted_at`) after the given cursor, across all of the user's trips. Cursor is an opaque token wrapping a `(timestamp, id)` pair so pagination is stable even if two rows share a timestamp. First sync (no cursor) returns a full snapshot. |
| POST   | `/sync/push`                                                        | `{table, records: [{local_id, server_id?, ...fields, updated_at, deleted}]}` — batched upsert. Returns per-record `{local_id, server_id, status: "applied"\|"conflict", server_version?}` so the client can reconcile in one round trip rather than one request per row.                                                                              |

Conflict handling is server-authoritative: `POST /sync/push` compares each incoming record's `updated_at` against the current server row. If the incoming write is newer, it's applied and echoed back as `applied`. If the server row is newer, the push is rejected for that record (`status: "conflict"`) and the current server row is returned in `server_version` so the client can immediately reconcile locally instead of waiting for the next pull. This keeps §5.3's last-write-wins rule enforced in exactly one place (the server), rather than trusting every client to apply it consistently.

Soft-deletes only: every syncable table needs a `deleted_at` column (added alongside `updated_at`) so a deletion is itself a syncable change rather than a row disappearing out from under a client that hasn't pulled yet. A background job can hard-delete rows past some retention window (e.g. 90 days) once you're confident no client is still holding a stale reference.

---

## 5. Mobile app spec

### 5.1 Navigation structure

```
Auth Stack (unauthenticated)
  - Welcome
  - Login
  - Register
  (Google/Apple buttons on both Login and Register)

Main Tab Navigator (authenticated)
  - Globe (home)          → Trip Detail → {Stops, Notes, Expenses, Photos, Documents, Itinerary}
  - Discover               → Public Trip Detail (read-only) → User Public Profile
  - Add Trip (modal, center tab button)
  - Feed                   → Public Trip Detail
  - Profile                → Settings, Edit Profile, Export Data, Logout
```

### 5.2 State management

- **Server state**: React Query (TanStack Query) for all API calls — handles caching, retries, and background refetch.
- **Local-first data** (notes, expenses, photos captured offline): WatermelonDB, schema mirroring the Postgres tables in §3.4–3.5 (subset of columns needed client-side). A sync engine pushes local changes to the API when connectivity returns and pulls remote changes since the last sync cursor.
- **Ephemeral UI state** (globe camera position, active tab, form drafts): Zustand or React Context, kept out of React Query entirely.
- **Auth tokens**: `expo-secure-store` (Keychain/Keystore-backed), never AsyncStorage.

### 5.3 Offline sync engine (build & verify this before starting the social module)

This is a gating milestone, not a polish item: the build order in the blueprint now puts a fully working, tested sync engine _before_ the social module (§4.9), specifically because social introduces public/private visibility state that has to survive sync correctly. It's much easier to prove that against a simple, private-only data model first than to debug sync correctness and privacy correctness at the same time.

**Local schema.** WatermelonDB tables mirror `notes`, `expenses`, `photos` (metadata), and `documents` (metadata) from §3.4–3.5, each with a local `dirty` boolean and `updated_at`/`deleted_at` timestamps in addition to their normal columns. `server_id` is nullable — a row created offline has none until its first successful push.

**Push flow.** On a timer (e.g. every 30s while foregrounded) and on reconnect, batch every `dirty` row per table and call `POST /sync/push` (§4.11). For each response record: `applied` → clear `dirty`, store the returned `server_id` if this was a first-time create; `conflict` → overwrite the local row with `server_version` and clear `dirty` (the server wins per §4.11's rule), surfacing a lightweight toast ("This note was updated elsewhere") only if the local content actually differs from what got overwritten.

**Pull flow.** Store the last-received `next_cursor` locally. On reconnect and periodically thereafter, call `GET /sync/pull?cursor=...` and upsert the returned changes, treating any row with a non-null `deleted_at` as a local delete. A brand-new device (no stored cursor) does a full-snapshot pull before the user sees any trip data — show a one-time "syncing your trips…" state rather than an empty screen.

**Why last-write-wins, not CRDTs.** True conflict-free merge types are overkill for single-owner journal data where conflicts are rare (the same user editing the same note on two devices within the sync window) and low-stakes (losing a few seconds of typing to the other device's version is an acceptable trade for simplicity). Revisit this if/when collaborative trips (multi-editor, from the blueprint's later feature ideas) are built — that's a case where two _different_ people's edits to the same trip need to both survive, and last-write-wins would silently drop one of them.

**Binary assets (photos/documents).** Metadata syncs through §4.11 like any other record, but the underlying file has its own offline path: capture writes to local device storage immediately and queues an upload job; the upload job runs opportunistically (Wi-Fi-preferred, retries with backoff) and only marks the photo/document record's `dirty` flag clear once the actual S3 upload has succeeded — a synced-but-uploadless record would otherwise look "done" while the photo itself is still stuck on-device.

**What "done" means for this milestone**, concretely — this should be the acceptance test before moving on to social: a user can create/edit/delete notes, expenses, photo captures, and documents entirely in airplane mode, across an app kill/restart, and have all of it reconcile correctly once connectivity returns — including the case where the same record was edited on two devices before either had synced. Write this as an actual E2E test (§11) using Detox/Maestro with network conditions toggled mid-test, not just a manual check.

### 5.4 Screen-level notes

- **Add Trip modal**: country picker (searchable) → city picker (filtered, searchable, `/countries/:id/cities?q=`) → date range picker → repeat "add another stop" → confirm. Each stop added optimistically renders a temporary arc on the globe preview before saving.
- **Trip Detail**: tab bar for Notes / Expenses / Photos / Documents / Itinerary, scoped to the trip; a per-stop selector filters all four to "this city" vs "whole trip/country."
- **Expense entry**: amount input defaults to the last-used currency for that trip's current city; category picker shows the 6 defaults plus the user's custom ones with a "+ New" affordance inline.

---

## 6. Globe & map module spec

- **Library**: `@rnmapbox/maps`, `MapView` with `projection="globe"`.
- **Home screen**: one `MapView` covering the whole screen, camera centered on the user's "travel centroid" (average lat/lng of all trip cities) at low zoom (~1.5) so the globe is fully visible.
- **Arcs**: for each trip, fetch `/trips/:id/arcs`; render as a `ShapeSource` of `LineString` features, each densified into ~64 points along the great-circle path (Turf `greatCircle()`) so it renders as a smooth curve over the sphere rather than a chord through it. Style: `line-width` 2, `line-color` by trip status (planning = dashed grey, active = animated gradient/pulse, past = dimmed blue), using `line-dasharray` for planning trips and a small animated "beacon" `SymbolLayer` traveling along the active trip's arc (driven by `requestAnimationFrame` updating the symbol's position property).
- **Tap targets**: `onPress` on the arc `ShapeSource` and on city point markers opens the relevant Trip Detail screen.
- **Zoom transition**: no manual code needed — Mapbox's globe projection auto-interpolates to Mercator as zoom increases past ~zoom 5; at that point enable `fillExtrusionLayer` (3D buildings) and a `terrainSource` (hillshade) for the "see details when zoomed in" requirement.
- **Offline regions**: when a trip's stops are finalized, prompt "Download this city for offline use" → `Mapbox.offlineManager.createPack()` bounded to a radius around the city center at the zoom levels needed for the itinerary screen.
- **Public profile globe**: same component, data-sourced from `/discover` or the target user's public trips only — the component itself doesn't know or care about privacy, it just renders whatever arcs the API returned (privacy is enforced server-side per §3.8, not by hiding arcs client-side).

---

## 7. AI planner pipeline spec

### 7.1 Flow

1. Client calls `POST /trips/:tripId/planner/generate` with a free-text prompt + `city_id` + `day_date`(s). Returns `job_id` immediately (202 Accepted); client polls or subscribes via a WebSocket/SSE channel.
2. **LLM call** (Claude API) with a system prompt constraining output to strict JSON:

   ```json
   {
     "days": [
       {
         "day_offset": 0,
         "items": [
           {
             "name": "Colosseum",
             "type": "landmark",
             "duration_minutes": 90,
             "reason": "iconic Roman amphitheater"
           }
         ]
       }
     ]
   }
   ```

   The prompt includes the city name, country, trip dates, and any user preferences from the free-text request. Ask the model explicitly not to invent addresses/coordinates — it supplies names only; geocoding is a separate, verifiable step.

3. **Geocoding**: for each `item.name`, call the **Mapbox Geocoding API** scoped to a bounding box around the city (using the city's stored `location` + a radius) to resolve a real lat/lng and a `mapbox_place_id`. If a name doesn't resolve with reasonable confidence, drop it and log it rather than placing an unverified pin.
4. **Ordering/routing**: within a day, keep the LLM's suggested order as a starting point, but call **Mapbox Directions** (walking profile) across the resolved points and, if the naive LLM order produces obvious backtracking (a simple heuristic: compare total route distance against the nearest-neighbor-ordered distance), re-order to the more efficient sequence before presenting it — but always leave it user-editable afterward.
5. Persist as `itinerary_days`/`itinerary_items` rows (`source = 'ai_suggested'`), mark the job complete.
6. Client renders the day as pins + a Directions polyline; user can drag items between days (`PATCH /itinerary-items/:id`), delete, or add their own (`source = 'user_added'`) — any edit triggers a route re-fetch from `GET /trips/:tripId/itinerary/days/:dayId/route`, not a full regeneration.

### 7.2 Caching & cost control

Cache the raw LLM response in Redis keyed by a hash of `(city_id, day_count, normalized_prompt)` for a short TTL (e.g. 1 hour) — repeated similar requests for the same city are common and expensive to regenerate. Geocoding results are cached indefinitely keyed by `(city_id, place_name)` since a place's coordinates don't change. Rate-limit `/planner/generate` per user (e.g. 20/day on a free tier) since it's the most expensive endpoint in the system.

---

## 8. Security spec (implementation-level)

- **Password storage**: bcrypt or argon2id, never anything reversible.
- **JWT**: signed with RS256 (asymmetric — lets the planner/media services verify tokens without holding the signing key), 15-minute access token expiry, `kid` header for key rotation support.
- **Refresh token theft detection**: as described in §4.1 — reuse of a revoked refresh token immediately revokes the whole token family and should trigger a "new device login" style alert to the user.
- **DB session variable**: every request sets `SET LOCAL app.current_user_id = '<uuid>'` inside the transaction before any query, so RLS policies (§3.8) apply automatically — this must happen in a shared middleware/interceptor, not per-endpoint, so it can't be forgotten.
- **Field-level encryption**: `documents.storage_key` objects are encrypted client-side or server-side with an envelope encryption scheme (a per-object data key, itself encrypted with a master key) before hitting S3/MinIO — not relying on bucket-level encryption alone. No AWS KMS needed at this scale: hold the master key as a Docker secret, or use self-hosted **HashiCorp Vault**'s free Transit engine if you want key rotation without managing raw key material by hand.
- **Rate limits** (Redis token bucket, enforced at the Nginx/Traefik layer and again in NestJS):

  | Endpoint group                    | Limit                                   |
  | --------------------------------- | --------------------------------------- |
  | `/auth/login`, `/auth/register`   | 5 / 15 min / IP                         |
  | `/auth/refresh`                   | 30 / hour / user                        |
  | `/planner/generate`               | 20 / day / user (tunable per plan tier) |
  | All other authenticated endpoints | 300 / 5 min / user                      |

- **Content moderation**: any photo transitioning `is_public` from false→true is blocked until `moderation_status = 'approved'`; the media worker runs an automated NSFW/CSAM scan on upload and only flips status to `approved` if it passes — public-facing endpoints must never expose a `pending` or `rejected` photo regardless of the `is_public` flag the owner set. No AWS Rekognition: **Google Cloud Vision SafeSearch** (1,000 images/month free, ~$1.50/1,000 after) is the cheapest managed option and covers early volume entirely for free; **NSFWJS**/**NudeNet** (open-source, MIT-licensed, run as a small container in the media-worker pipeline) is the zero-marginal-cost option once volume grows past the free tier, at the price of running the inference yourself.
- **GDPR**: `DELETE /me` cascades through all FKs (already `ON DELETE CASCADE` in the schema) and additionally issues delete calls against S3/MinIO for every `storage_key` owned by the user before the DB row disappears, since object storage isn't covered by the FK cascade. `GET /me/export` runs as an async job producing a signed, time-limited download URL.
- **Mobile-side**: certificate pinning for the API host, Keychain/Keystore for tokens, and disabling screenshots/screen recording on the boarding-pass/document viewing screen (`expo-screen-capture`) since those often contain barcodes usable for fraud if leaked.

---

## 9. Infrastructure spec

### 9.1 Docker Compose (dev and prod topology, same shape)

Services: `postgres` (postgis/postgis image), `redis`, `minio`, `api` (NestJS), `planner` (NestJS module, can start co-located in `api` and split out later), `media-worker` (queue consumer), `migrate` (one-shot migration runner on deploy), `reverse-proxy` (Traefik, handles TLS via Let's Encrypt in prod).

Key environment variables to externalize (never commit): `DATABASE_URL`, `REDIS_URL`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, `S3_ENDPOINT`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, `MAPBOX_SECRET_TOKEN` (server-side geocoding/directions calls), `MAPBOX_PUBLIC_TOKEN` (client, URL-restricted), `ANTHROPIC_API_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `APPLE_OAUTH_*`, `KMS_MASTER_KEY` (or Docker secret path).

### 9.2 Backup & DR (self-hosted Postgres specifics)

Since Postgres is self-hosted rather than managed, this needs explicit setup rather than coming for free: nightly `pg_dump` to the MinIO/S3 bucket (or an external bucket, so backups don't live on the same disk as the DB) plus WAL archiving for point-in-time recovery. Test the restore path before launch, not after an incident — a backup you haven't restored from isn't a verified backup.

### 9.3 CI/CD

GitHub Actions: on PR — lint, unit tests, run migrations against an ephemeral Postgres service container, integration tests. On merge to main — build/push Docker images, run `migrate` service against prod DB, rolling-restart `api`/`planner`/`media-worker`. Mobile: EAS Build triggered on release tags, submitting to TestFlight/Play internal track.

### 9.4 Monitoring

Sentry (mobile + backend) for errors; structured JSON logs shipped to a log aggregator; Prometheus metrics from NestJS (`@willsoto/nestjs-prometheus` or similar) with Grafana dashboards separating **core API** latency/error-rate from **planner** latency/cost (LLM + Mapbox call counts) so a slow/expensive planner run doesn't get lost in aggregate API metrics.

### 9.5 Hosting & cost-conscious service choices (no AWS)

Every external service in this spec has a non-AWS default, chosen for cost:

| Need                                                                                     | No-AWS choice                                                                                           | Why                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPS (runs the Docker Compose stack from §9.1)                                            | **Hetzner** CX22 (2 vCPU/4GB/40GB NVMe)                                                                 | ~~$3.60–5/month, vs. a comparable AWS EC2 + RDS combo running $50+/month before storage/backup. DigitalOcean (~~$6/month) is a fine, slightly pricier alternative if you want their managed-add-on ecosystem; Contabo is cheaper still but oversells CPU more aggressively, which matters for a database workload.                                                                        |
| Object storage (photos, documents — §3.4, §4.5–4.6)                                      | **Cloudflare R2**                                                                                       | 10GB free, then $0.015/GB storage with **zero egress fees** — the egress waiver is the actual saving versus AWS S3, since photo-heavy apps serve far more than they store. **MinIO** stays as the local-dev equivalent (already in §9.1); **Backblaze B2** is a cheaper-storage alternative (~$0.006/GB) if you're optimizing for storage over egress, e.g. as the backup target in §9.2. |
| Image moderation (§8, content moderation)                                                | **Google Cloud Vision SafeSearch** (1,000/month free) or self-hosted **NSFWJS**/**NudeNet**             | Free tier covers early volume; self-hosting removes the per-image cost entirely once you outgrow it, at the cost of running the inference container yourself.                                                                                                                                                                                                                             |
| Secrets management (§8)                                                                  | **Docker secrets**, or **Infisical** (open-source, self-hostable) if you want a UI/access control later | Both free; neither is AWS Secrets Manager's ~$0.40/secret/month.                                                                                                                                                                                                                                                                                                                          |
| Encryption key management (§8, field-level encryption)                                   | Docker secret, or self-hosted **HashiCorp Vault**'s free Transit engine                                 | No AWS KMS bill.                                                                                                                                                                                                                                                                                                                                                                          |
| Transactional email (verification, password reset — not yet in §4, add as `/auth` sends) | **Resend** (3,000 emails/month free)                                                                    | Free tier alone likely covers an app at this stage; no AWS SES setup/deliverability overhead.                                                                                                                                                                                                                                                                                             |
| Backups (§9.2)                                                                           | **Backblaze B2** as the off-box target                                                                  | Cheapest raw storage of the options above, appropriate for cold backup data you rarely read.                                                                                                                                                                                                                                                                                              |

None of this requires an AWS account anywhere in the stack. If the app eventually outgrows a single Hetzner box, the next step is more/bigger Hetzner instances (or a comparable low-cost provider) behind a load balancer, still well short of needing a hyperscaler — that's a scale problem worth having, not one to design for on day one.

---

## 10. Non-functional targets

- API p95 latency: < 300ms for CRUD endpoints, excluding the planner (which is async by design, §7.1).
- Globe: sustain 60fps with up to ~50 rendered arcs on a mid-tier device; beyond that, cluster/simplify.
- Cold start: < 3s to interactive globe on the home screen.
- Offline: notes, expenses, and photo capture must work with zero connectivity and sync automatically within 30s of reconnecting.
- Availability target for MVP: no formal SLA, but backups verified restorable within 1 hour (RTO), max 24h data loss window (RPO) given nightly dumps + WAL archiving.

---

## 11. Testing strategy

- **Backend**: Jest unit tests per service/module; Supertest integration tests per endpoint group, run against a real Postgres in CI (not mocked) so RLS policies are actually exercised — this is the layer most worth testing thoroughly, since a privacy bug here is the worst-case failure mode for this app.
- **Mobile**: component tests (Jest + React Native Testing Library); E2E flows (Detox or Maestro) covering the critical paths: register → create trip → add note/expense → toggle public → verify a second (non-owner) account cannot see the expense.
- **Load**: k6 or similar against `/planner/generate` and `/feed` specifically before launch, since these are the two endpoints most likely to be both popular and expensive.

---

## 12. Suggested first Claude Code prompts

Given this spec, a reasonable first sequence of Claude Code sessions — reordered so **offline sync (step 5) is built and verified before the social module (step 8)**, per the updated build order:

1. "Set up the NestJS project structure with the Docker Compose stack from §9.1 and the full schema/migrations from §3."
2. "Implement the auth module from §4.1 and §8, including refresh token rotation and Google/Apple OAuth."
3. "Implement trips, stops, notes, and expenses endpoints from §4.3–4.7, with RLS wired through per §8's session-variable middleware."
4. "Scaffold the Expo app with the navigation structure from §5.1 and wire up auth screens against the API."
5. **"Implement the offline sync engine: the `/sync/pull` and `/sync/push` endpoints from §4.11, the WatermelonDB local schema and push/pull logic from §5.3, and an E2E test that kills connectivity mid-session and verifies notes/expenses reconcile correctly across two simulated devices. Do not proceed to step 8 until this passes."**
6. "Build the globe screen per §6, rendering real arcs from `/trips/:id/arcs`."
7. "Implement the photos and documents module from §4.5–4.6, including the offline capture/upload queue described in §5.3."
8. "Implement the social module: privacy toggles, follow system, and public profile/feed views from §4.9, relying on the RLS policies in §3.8 and the moderation flow in §8."
9. "Implement the planner pipeline from §7."

Each of these is scoped tightly enough to be a single focused Claude Code session rather than one sprawling "build the app" request. Step 5 is deliberately called out as a hard gate — the RLS/privacy model in §3.8 assumes offline-created records sync their `is_public` state correctly, and that's much easier to validate before the social module adds visibility rules on top.
