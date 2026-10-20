# Phase 1 — Data Model: TripTrackr MVP

**Branch**: `001-triptrackr-mvp` | **Date**: 2026-08-26 | **Plan**: [plan.md](./plan.md)

## How to read this document

The server schema is the authority. `docs/travelappfullspec.md` §3 supplies the baseline; this document
records it in requirement terms, and marks every place where the specification's requirements
extended or changed it.

Every table carries a **Visibility posture** line. That is a Constitution I obligation, not
decoration — a table without a stated posture must not merge. Three postures exist:

- **Owner-only, structurally** — no visibility column exists. There is nothing to set wrongly, and no
  public-read policy is ever written. Enforced by absence.
- **Owner + explicit public** — an `is_public` boolean, gated additionally by an RLS policy.
- **Reference** — not traveller-owned. World-readable, never written by a traveller.

Column-level rules that the policies depend on live in
[contracts/data-access-policy.md](./contracts/data-access-policy.md).

---

## 1. Reference geography

Pre-imported from a GeoNames extract during migration. Travellers never create geography (FR-014,
spec Assumptions).

### `countries`

| Column      | Type                      | Notes              |
| ----------- | ------------------------- | ------------------ |
| `id`        | `SMALLSERIAL` PK          |                    |
| `iso_code`  | `CHAR(2)` UNIQUE NOT NULL | ISO 3166-1 alpha-2 |
| `name`      | `TEXT` NOT NULL           |                    |
| `continent` | `TEXT` NOT NULL           |                    |

**Visibility posture**: Reference.

### `cities`

| Column       | Type                                 | Notes                              |
| ------------ | ------------------------------------ | ---------------------------------- |
| `id`         | `SERIAL` PK                          |                                    |
| `country_id` | `SMALLINT` → `countries.id` NOT NULL |                                    |
| `name`       | `TEXT` NOT NULL                      | Local name, displayed              |
| `ascii_name` | `TEXT` NOT NULL                      | Accent-stripped, searched (FR-014) |
| `location`   | `GEOGRAPHY(POINT,4326)` NOT NULL     | Globe positioning, distance totals |
| `timezone`   | `TEXT` NOT NULL                      | IANA identifier                    |
| `population` | `INT` DEFAULT 0                      | Prominence ranking (FR-014)        |

Indexes: `(country_id)`; GIST on `location`; GIN trigram on `ascii_name`.

**Visibility posture**: Reference.

**Requirement note**: `location` being `geography` rather than a lat/lng pair is what lets SC "total
distance travelled" be a `ST_Distance` sum rather than hand-written haversine arithmetic, and it is
what makes the date-line edge case (a trip crossing 180°) correct by default instead of by
special-casing.

---

## 2. Accounts

### `users`

| Column                     | Type                               | Notes                                                   |
| -------------------------- | ---------------------------------- | ------------------------------------------------------- |
| `id`                       | `UUID` PK                          |                                                         |
| `email`                    | `CITEXT` UNIQUE NOT NULL           |                                                         |
| `password_hash`            | `TEXT` NULL                        | Null for an OAuth-only account (FR-002)                 |
| `display_name`             | `TEXT` NOT NULL                    |                                                         |
| `avatar_url`, `bio`        | `TEXT` NULL                        | FR-008                                                  |
| `home_currency`            | `CHAR(3)` NOT NULL DEFAULT `'USD'` | ISO 4217                                                |
| `is_profile_public`        | `BOOLEAN` NOT NULL DEFAULT `false` | FR-008, FR-052 — private by default                     |
| `email_verified_at`        | `TIMESTAMPTZ` NULL                 | **Added** — spec Assumptions puts verification in scope |
| `created_at`, `updated_at` | `TIMESTAMPTZ` NOT NULL             |                                                         |
| `deletion_requested_at`    | `TIMESTAMPTZ` NULL                 | **Added** — FR-006, see §9                              |

**Visibility posture**: Owner + explicit public. Only `display_name`, `avatar_url`, and `bio` are
ever exposed publicly, and only when `is_profile_public` is true. `email` is never public.

### `oauth_identities`

`id`, `user_id` → `users` ON DELETE CASCADE, `provider` ∈ `{google, apple}` (enforced by a
`CHECK` constraint, not by convention), `provider_uid`, `created_at`. UNIQUE `(provider, provider_uid)`.

**Visibility posture**: Owner-only, structurally.

**Requirement note**: FR-002 and the spec's edge case "someone registers with an email that already
has an account created via Google sign-in" mean the link is by verified email, not by a new account.
Registration must detect the existing user and attach an identity rather than conflicting on the
unique email.

### `refresh_tokens`

`id`, `user_id` → `users` ON DELETE CASCADE, `token_hash` (never the raw token), `device_info`,
`expires_at`, `revoked_at`, `replaced_by_id` (**added** — reuse detection, FR-005), `created_at`.

**Visibility posture**: Owner-only, structurally.

**Requirement note**: FR-004 (sign out on one device or all) is `revoked_at` on one row or on every
row for the user. FR-005 (detect reuse of a retired token) needs `replaced_by_id`: presenting a
token that has already been rotated means the chain was stolen, and the correct response is to
revoke the whole family and notify the account holder — not merely to reject the one request.

---

## 3. Trips

### `trips`

| Column                     | Type                                           | Notes                                                |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `id`                       | `UUID` PK                                      |                                                      |
| `owner_id`                 | `UUID` → `users.id` ON DELETE CASCADE NOT NULL | FR-085: single owner, additive seam                  |
| `title`                    | `TEXT` NOT NULL                                | FR-009                                               |
| `status`                   | `TEXT` ∈ `{planning, active, past}`            | FR-013 — **derived, never user-set**                 |
| `is_public`                | `BOOLEAN` NOT NULL DEFAULT `false`             | FR-052, FR-053                                       |
| `home_currency`            | `CHAR(3)` NOT NULL                             | FR-009                                               |
| `cover_photo_id`           | `UUID` → `photos.id` NULL                      | FR-055                                               |
| `created_at`, `updated_at` | `TIMESTAMPTZ` NOT NULL                         |                                                      |
| `deleted_at`               | `TIMESTAMPTZ` NULL                             | Tombstone (FR-039); frees an allowance slot (FR-075) |

Indexes: `(owner_id)`; partial on `(is_public) WHERE is_public`; `(updated_at)` for the sync cursor.

**Visibility posture**: Owner + explicit public.

**Requirement notes**:

- FR-013 requires status to stay current _without user action_. It is computed from the stop date
  range on read rather than stored and swept by a job — the spec's edge case is a trip whose dates
  pass while the app is closed, and a computed value cannot be stale. The column remains as a
  materialised cache for the globe query, refreshed on write and by a nightly job; the read path
  recomputes and does not trust it if it disagrees.
- FR-085 is satisfied by keeping every child record's ownership route through `trip_id` alone.
  Nothing outside `trips` stores an `owner_id`. Introducing a `trip_members` table later therefore
  changes the RLS predicates and nothing else — no child table is restructured.

### `trip_stops`

| Column                       | Type                                           | Notes                                         |
| ---------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `id`                         | `UUID` PK                                      |                                               |
| `trip_id`                    | `UUID` → `trips.id` ON DELETE CASCADE NOT NULL |                                               |
| `city_id`                    | `INT` → `cities.id` NOT NULL                   | FR-010                                        |
| `sort_order`                 | `SMALLINT` NOT NULL                            | FR-012                                        |
| `arrive_date`, `depart_date` | `DATE` NOT NULL                                | `CHECK (depart_date >= arrive_date)` — FR-011 |
| `created_at`, `updated_at`   | `TIMESTAMPTZ` NOT NULL                         | **Added 2026-09-23** — sync cursor            |
| `deleted_at`                 | `TIMESTAMPTZ` NULL                             | **Added 2026-09-23** — tombstone (FR-039)     |

Indexes: `(trip_id, sort_order)`; `(updated_at)` for the sync cursor.

**Visibility posture**: Inherits the parent trip.

**Requirement notes**:

- Stops are mirrored on the device (§10) and therefore synchronised (contracts/sync-protocol.md).
  A stop removed on one device must disappear on the other, which under FR-039 requires a tombstone
  rather than a hard delete. The original design omitted these three columns and could not
  propagate a stop deletion at all — recorded as a corrected defect in research D-16.

- Globe arcs are **derived** from consecutive stops, never stored (FR-016). Inserting a stop
  mid-trip requires no arc maintenance because there is no arc table to maintain.
- Overlapping or widely gapped stop date ranges are legitimate and must not be rejected (spec edge
  cases). Only `depart >= arrive` is constrained.
- A single-stop trip yields zero arcs. The globe renders a point (FR-051-adjacent edge case), so the
  arc query must return an empty set rather than error.

---

## 4. Notes

### `notes`

| Column                                   | Type                                           | Notes                        |
| ---------------------------------------- | ---------------------------------------------- | ---------------------------- |
| `id`                                     | `UUID` PK                                      |                              |
| `trip_id`                                | `UUID` → `trips.id` ON DELETE CASCADE NOT NULL | FR-019                       |
| `country_id`                             | `SMALLINT` → `countries.id` NULL               | Set for a country-level note |
| `city_id`                                | `INT` → `cities.id` NULL                       | Set once narrowed to a city  |
| `title`                                  | `TEXT` NULL                                    |                              |
| `body`                                   | `TEXT` NOT NULL                                |                              |
| `is_public`                              | `BOOLEAN` NOT NULL DEFAULT `false`             | FR-052, FR-053               |
| `created_at`, `updated_at`, `deleted_at` | `TIMESTAMPTZ`                                  |                              |

`CHECK (country_id IS NOT NULL OR city_id IS NOT NULL)` — FR-019.

Indexes: `(trip_id)`; `(updated_at)` for the sync cursor.

**Visibility posture**: Owner + explicit public, additionally requiring the parent trip to be public.

**Requirement notes**:

- FR-017's three levels are one shape, not three: trip-level is `city_id NULL` with the trip's sole
  country; country-level is `country_id` set, `city_id` null; city-level is both set. FR-018 (moving
  between levels without losing content or creation date) is then an `UPDATE` of two nullable
  foreign keys, which is why the levels are not modelled as separate tables.
- The spec's edge case "a note attached to a city later removed from the trip" is why `city_id`
  references `cities` (reference data, permanent) rather than `trip_stops` (removable). Removing a
  stop leaves the note anchored to a real city; it does not orphan or cascade-delete it.

---

## 5. Photos and documents

### `photos`

| Column                                   | Type                                                       | Notes                                |
| ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `id`                                     | `UUID` PK                                                  |                                      |
| `trip_id`                                | `UUID` → `trips.id` ON DELETE CASCADE NOT NULL             |                                      |
| `city_id`                                | `INT` → `cities.id` NULL                                   | FR-028                               |
| `storage_key`                            | `TEXT` NOT NULL                                            | Private bucket object key            |
| `thumb_key`                              | `TEXT` NULL                                                | Written by the media worker (FR-030) |
| `taken_at`, `exif_lat`, `exif_lng`       | from EXIF, nullable                                        | FR-029                               |
| `is_public`                              | `BOOLEAN` NOT NULL DEFAULT `false`                         | FR-052, FR-053                       |
| `moderation_state`                       | `TEXT` ∈ `{pending, approved, rejected}` DEFAULT `pending` | FR-056                               |
| `upload_state`                           | `TEXT` ∈ `{pending, uploaded, failed}` DEFAULT `pending`   | **Added** — FR-041                   |
| `created_at`, `updated_at`, `deleted_at` | `TIMESTAMPTZ`                                              |                                      |

Indexes: `(trip_id)`; `(updated_at)`; partial on `(moderation_state) WHERE moderation_state =
'pending'` for the worker queue.

**Visibility posture**: Owner + explicit public, **and** `moderation_state = 'approved'`, **and** the
parent trip public.

**Requirement notes**:

- `moderation_state` sits inside the RLS predicate, not in application code. FR-056 says a photo is
  withheld from public visibility until screened _irrespective of what its owner set_, and the only
  way to make that true against an interface defect is to put it where the database evaluates it.
- `upload_state` exists because FR-041 forbids treating a record as saved before its bytes arrive.
  Metadata syncs through the normal path; the byte transfer is a separate queue. A photo with
  `upload_state = 'pending'` renders with a visible pending treatment rather than as a broken image.
- The spec's edge case "a photo's embedded location contradicts the city it was filed under" is
  resolved by keeping `city_id` and the EXIF columns independent. EXIF is recorded as observed; the
  filing is the traveller's. Neither overwrites the other, and a mismatch is surfaced rather than
  silently reconciled (Constitution IV). The media worker files a photo that has **no** city under
  the nearest city among its trip's stops within 50 km of its EXIF position; it never replaces a
  filing (research D-34).
- The uploaded bytes carry no EXIF — the device re-encodes before upload — so `exif_lat`/`exif_lng`
  are the only copy of where a photo was taken. A public projection (User Story 7, FR-055) must
  leave them out.

### `documents`

| Column                                   | Type                                           | Notes                                                   |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `id`                                     | `UUID` PK                                      |                                                         |
| `trip_id`                                | `UUID` → `trips.id` ON DELETE CASCADE NOT NULL |                                                         |
| `type`                                   | `TEXT` ∈ `{boarding_pass, booking, other}`     | FR-031                                                  |
| `storage_key`                            | `TEXT` NOT NULL                                | Object key of the **ciphertext**                        |
| `content_type`                           | `TEXT` ∈ `{image/jpeg, image/png}` NOT NULL    | **Added** 2026-09-29 — served back on read (D-32)       |
| `byte_size`                              | `INT` NOT NULL, `> 0`                          | **Added** 2026-09-29 — plaintext size, for the list     |
| `wrapped_dek`                            | `BYTEA` NOT NULL                               | **Added** — envelope encryption, FR-033 (research D-04) |
| `dek_key_id`                             | `TEXT` NOT NULL                                | **Added** — which master key wrapped it, for rotation   |
| `parsed_sealed`                          | `BYTEA` NULL                                   | **Changed** 2026-09-29 from `parsed_json JSONB` (D-33)  |
| `parsed_confirmed_at`                    | `TIMESTAMPTZ` NULL                             | **Added** — Constitution IV: confirmed, not assumed     |
| `upload_state`                           | `TEXT`                                         | **Added** — FR-041, as for photos                       |
| `created_at`, `updated_at`, `deleted_at` | `TIMESTAMPTZ`                                  |                                                         |

**Visibility posture**: **Owner-only, structurally.** There is no `is_public` column and no
public-read policy exists for this table (FR-032). This is deliberate and must not be "fixed".

**Requirement notes**:

- `wrapped_dek` + `dek_key_id` implement FR-033: a database dump yields wrapped keys that are inert
  without the master key, which is held as a Docker secret and never stored in PostgreSQL. The full
  specification's `encrypted BOOLEAN` flag is replaced by these — a boolean asserting that something
  is encrypted is not a mechanism.
- `parsed_confirmed_at` distinguishes extracted-but-unconfirmed from traveller-confirmed data.
  FR-035 says "offer them for confirmation rather than requiring manual entry", and Constitution IV
  forbids presenting unconfirmed extraction as fact. An unreadable or unrecognised barcode (spec edge
  case) simply leaves the fields null and falls back to manual entry — it is not an error state.
- `parsed_sealed` holds the extracted fields — flight number, flight date, passenger name, and
  nothing else from the barcode — as AES-256-GCM under the document's own key with the associated
  data `<id>:parsed` (research D-33). A database dump reveals neither a name nor a flight. On the
  wire (REST and sync) the owner's fields travel decrypted as `parsed_json` over TLS.
- The object at `storage_key` is ciphertext written by the API (research D-32); the bucket never
  holds a document in the clear, and no pre-signed URL is ever issued for this bucket.

---

## 6. Money

### `expense_categories`

`id`, `user_id` → `users` ON DELETE CASCADE **nullable** (null = system default), `name`, `icon`,
`created_at`, `updated_at`, `deleted_at` (**added 2026-09-23** — sync cursor and tombstone).
UNIQUE `(user_id, name)`; index `(updated_at)`.

Seeded with six system rows at `user_id IS NULL`: Food, Lodging, Transport, Activities, Shopping,
Other (FR-023).

**Visibility posture**: Owner-only, structurally, plus world-readable system rows. The system rows
are **read-only for every traveller**: the write policies pin `user_id` to the caller, so no account
can insert a row with `user_id IS NULL`, nor update or delete one (contracts/data-access-policy.md).

**Requirement notes**:

- FR-024 requires a custom category to be reusable across _all_ of that traveller's trips. Scoping
  to `user_id` rather than `trip_id` is what delivers that; a trip-scoped category would have to be
  re-created per trip.
- Custom categories are created offline at the moment an expense needs them, so they are mirrored on
  the device (§10) and synchronised ahead of `expenses` (contracts/sync-protocol.md §2, "parents
  before children"). The tombstone exists for the same reason as on `trip_stops`.

### `expenses`

| Column                                   | Type                                           | Notes                                  |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| `id`                                     | `UUID` PK                                      |                                        |
| `trip_id`                                | `UUID` → `trips.id` ON DELETE CASCADE NOT NULL |                                        |
| `city_id`                                | `INT` → `cities.id` NULL                       | FR-020                                 |
| `category_id`                            | `UUID` → `expense_categories.id` NOT NULL      |                                        |
| `amount`                                 | `NUMERIC(12,2)` NOT NULL                       | As paid                                |
| `currency`                               | `CHAR(3)` NOT NULL                             | As paid                                |
| `fx_rate_to_home`                        | `NUMERIC(14,6)` **NULL**                       | Rate at entry (FR-021)                 |
| `amount_home`                            | `NUMERIC(12,2)` **NULL**                       | Precomputed (FR-021)                   |
| `fx_pending`                             | `BOOLEAN` NOT NULL DEFAULT `false`             | **Added** — no rate available at entry |
| `spent_at`                               | `DATE` NOT NULL                                |                                        |
| `note`                                   | `TEXT` NULL                                    |                                        |
| `created_at`, `updated_at`, `deleted_at` | `TIMESTAMPTZ`                                  |                                        |

Indexes: `(trip_id)`; `(trip_id, category_id)`; `(trip_id, spent_at)` for the by-day breakdown;
`(updated_at)`.

**Visibility posture**: **Owner-only, structurally.** No `is_public` column exists and no public-read
policy is ever written for this table (FR-027). This is the single most important property in the
schema. Adding a visibility column here is a constitutional violation, not a feature.

**Requirement notes**:

- The full specification made `fx_rate_to_home` and `amount_home` `NOT NULL`. The spec's edge case —
  an expense logged in a currency with no retrievable rate — makes that unshippable offline: it would
  force the app to either block the entry or invent a rate. Both are wrong. They become nullable with
  an explicit `fx_pending` flag, backfilled when a rate arrives, and totals disclose the pending
  amount rather than silently omitting it (FR-026).
- `NUMERIC`, never floating point. SC-016 requires totals to reconcile _exactly_.
- Zero and negative amounts are permitted — a refund is an expense (spec edge case). No `CHECK
(amount > 0)`.
- FR-022 (rates never retroactively alter recorded values) is a property of storing the rate on the
  row. Nothing recomputes a historical `amount_home`, and the only write to it is the one-time
  backfill of a genuinely pending conversion.
- The spec's "traveller changes a trip's home currency after expenses are logged" case: existing
  rows keep the rate and converted amount they were recorded with. The trip's totals are recomputed
  against the new home currency for _display_, disclosing that mixed bases are in play. Rewriting
  history would violate FR-022.

### `fx_rates` — **added table**

`base_currency CHAR(3)`, `quote_currency CHAR(3)`, `rate NUMERIC(14,6)`, `as_of DATE`,
PK `(base_currency, quote_currency, as_of)`.

**Visibility posture**: Reference.

**Requirement note**: Refreshed daily. Serving conversions from a local table rather than a live call
per entry keeps FR-020 fast, survives the provider being briefly unavailable (spec Dependencies), and
lets the device carry a recent snapshot so an expense logged in aeroplane mode still converts.

---

## 7. Planner

### `itinerary_days`

`id`, `trip_id` → `trips` ON DELETE CASCADE, `city_id` → `cities`, `day_date`.
UNIQUE `(trip_id, day_date)`.

### `itinerary_items`

| Column             | Type                                           | Notes                                    |
| ------------------ | ---------------------------------------------- | ---------------------------------------- |
| `id`               | `UUID` PK                                      |                                          |
| `itinerary_day_id` | `UUID` → `itinerary_days.id` ON DELETE CASCADE |                                          |
| `sort_order`       | `SMALLINT` NOT NULL                            | FR-066, FR-067                           |
| `place_name`       | `TEXT` NOT NULL                                |                                          |
| `location`         | `GEOGRAPHY(POINT,4326)` **NOT NULL**           | From the geocoder only — never the model |
| `mapbox_place_id`  | `TEXT` NULL                                    | Re-lookup and de-duplication             |
| `source`           | `TEXT` ∈ `{ai_suggested, user_added}`          | FR-067                                   |
| `note`             | `TEXT` NULL                                    |                                          |

Index: `(itinerary_day_id, sort_order)`.

**Visibility posture**: Inherits the parent trip.

**Requirement notes**:

- `location NOT NULL` is the schema-level expression of FR-065 and Constitution IV. A place whose
  location cannot be confirmed has no row to insert, so an unverifiable suggestion cannot reach the
  map. The "every suggested place fails verification, leaving an empty day" edge case therefore
  produces an honest empty day rather than a guessed one.
- FR-067 (move an activity between days, redraw only the affected days) is an `UPDATE` of
  `itinerary_day_id` and `sort_order`. No regeneration is involved, and no LLM call is made — which
  is also what keeps the cost ceiling meaningful.

### `planner_requests` — **added table**

`id`, `user_id` → `users`, `cache_key TEXT`, `requested_at TIMESTAMPTZ`, `status`, `cost_tokens INT`.
Index `(user_id, requested_at)`.

**Visibility posture**: Owner-only, structurally.

**Requirement note**: FR-069 (a per-person daily limit, communicated clearly) needs a durable count,
not just a Redis counter that a restart forgets. The Redis cache serves FR-070; this table is the
audit and quota record.

---

## 8. Social — _blocked on the sync gate_

These tables must not be built until the User Story 6 acceptance suite passes (Constitution II).

### `follows`

`follower_id`, `followee_id`, `status` ∈ `{pending, accepted}`, `created_at`.
PK `(follower_id, followee_id)`, `CHECK (follower_id <> followee_id)`.

FR-058: `accepted` immediately for a public profile, `pending` for a private one.

### `blocks`

`blocker_id`, `blocked_id`, `created_at`. PK `(blocker_id, blocked_id)`.

**Requirement note**: FR-061 is enforced in the RLS predicate for every public read, not in a feed
query filter. A block must hold on the profile route, the trip route, the discovery route, and the
feed route — one predicate covers all four; four filters is four chances to miss one.

### `reports`

`id`, `reporter_id`, `target_type` ∈ `{trip, note, photo, user}`, `target_id`, `reason`,
`status` ∈ `{open, reviewed, dismissed, actioned}`, `created_at`. FR-062.

**Visibility posture**: Owner-only for the reporter; staff review is out of band. Human moderation
tooling is explicitly out of scope (spec Assumptions).

---

## 9. Commerce

### `subscriptions` — **added table**

| Column                  | Type                                     | Notes                            |
| ----------------------- | ---------------------------------------- | -------------------------------- |
| `user_id`               | `UUID` PK → `users.id` ON DELETE CASCADE | One row per traveller            |
| `is_active`             | `BOOLEAN` NOT NULL DEFAULT `false`       |                                  |
| `current_period_end`    | `TIMESTAMPTZ` NULL                       | FR-082 — the date stated plainly |
| `provider`              | `TEXT` ∈ `{app_store, play_store}`       |                                  |
| `provider_customer_id`  | `TEXT` NULL                              | RevenueCat app-user id           |
| `entitlement_synced_at` | `TIMESTAMPTZ`                            | Last webhook reconciliation      |

**Visibility posture**: Owner-only, structurally. Never exposed on any public surface.

**Requirement notes**:

- This table is a **cache of the store's truth**, refreshed by webhook (research D-07). It holds no
  card data of any kind (FR-081) — that is structural, since payment happens inside the platform's
  own sheet and this system never sees a card field.
- It is referenced by exactly one code path, `POST /trips`, and by no RLS policy. That is what makes
  Constitution V and FR-080 true rather than promised: there is no read, update, list, or export path
  that could consult entitlement state, because none of them join to this table.
- The spec's edge case "subscribes on one device while a second still believes them free" resolves
  because the server, not the client, decides. The client's cached entitlement only decides whether
  to show a paywall.

### Allowance accounting

No column stores a trip count. The allowance is evaluated as
`count(*) FROM trips WHERE owner_id = $1 AND deleted_at IS NULL`, inside the `POST /trips`
transaction, against a configured limit (5 at launch, FR-074).

**Requirement note**: FR-075 (a deleted trip frees a slot immediately) is then automatic, and the
spec's "delete and re-create repeatedly" edge case cannot drift, because there is no denormalised
counter to drift. The launch value of 5 is configuration, not a constant in code — FR-074 calls it
business-tunable, and the spec warns that nothing should assume the specific number.

### Account deletion

`users.deletion_requested_at` starts the process. The database cascade removes rows; a queued sweep
removes every object-storage key belonging to that traveller. Deletion is not complete until the
sweep confirms.

**Requirement note**: FR-006 and Constitution V both require deletion to reach stored files. SC-015
demands an automated check that finds no residue — a `ON DELETE CASCADE` alone will pass a
database-only assertion while leaving every photo and boarding pass sitting in the bucket. The sweep
is the requirement; the cascade is the easy half.

---

## 10. The on-device schema

The local SQLite database (SQLCipher-encrypted, research D-01) mirrors a subset of the above:
`trips`, `trip_stops`, `notes`, `expenses`, `expense_categories`, `photos`, `documents`, plus a
cached slice of `cities`/`countries` for offline trip creation and a recent `fx_rates` snapshot.

**Every one of the seven mirrored tables is synchronised** through contracts/sync-protocol.md — the
protocol's scope and this list are the same list by definition, and a table added to one must be
added to the other. The geography slice and `fx_rates` are read-only caches refreshed from the
lookups endpoints; they are never pushed.

**Identity** (research D-15): a synchronised row's `id` is a UUID generated on the device that
creates it, and the server adopts it unchanged. There is no separate server identifier. This is what
lets an expense created offline reference a trip created offline with no remapping step, and it is
what makes a retried push an idempotent upsert rather than a potential duplicate.

Every mirrored table adds these local-only columns:

| Column                               | Purpose                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| `is_dirty` (boolean)                 | Set on every local write, cleared only when the server confirms                       |
| `synced_at` (nullable)               | When the server last acknowledged this row; null for a row that has never been pushed |
| `local_file_uri` (photos, documents) | Where the bytes live on device until the upload queue drains                          |

`updated_at` and `deleted_at` mirror the server's and drive both the conflict comparison and the
tombstone propagation.

**Requirement notes**:

- Documents are stored in the encrypted local database and their bytes in app-private storage. The
  same FR-033 reasoning applies on the device as on the server: a device backup or a filesystem dump
  must not reveal a boarding pass.
- The cached geography slice is what allows FR-014's city picker — and therefore trip creation — to
  work in aeroplane mode, which the spec's "trip created offline by a traveller at the allowance"
  edge case assumes is possible.
- No social table is mirrored. Social data is online-only by design, which keeps the offline
  correctness problem and the privacy correctness problem from overlapping — the exact separation
  Constitution II's rationale asks for.

---

## 11. Entity coverage against the spec

Every entity named in the spec's Key Entities section maps to a table above.

| Spec entity      | Table(s)                                      |
| ---------------- | --------------------------------------------- |
| Traveller        | `users`, `oauth_identities`, `refresh_tokens` |
| Trip             | `trips`                                       |
| Stop             | `trip_stops`                                  |
| Country / City   | `countries`, `cities`                         |
| Note             | `notes`                                       |
| Photo            | `photos`                                      |
| Document         | `documents`                                   |
| Expense          | `expenses`                                    |
| Expense Category | `expense_categories`                          |
| Itinerary Day    | `itinerary_days`                              |
| Itinerary Item   | `itinerary_items`                             |
| Follow           | `follows`                                     |
| Block            | `blocks`                                      |
| Report           | `reports`                                     |
| Subscription     | `subscriptions`                               |

Tables added beyond the spec's entity list, each traceable to a requirement rather than to
speculation: `fx_rates` (FR-021 offline path), `planner_requests` (FR-069 durable quota).
