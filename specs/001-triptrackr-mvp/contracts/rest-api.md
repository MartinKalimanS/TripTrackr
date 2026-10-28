# Contract — REST API

**Branch**: `001-triptrackr-mvp` | Conventions: [README.md](./README.md)

Baseline from `docs/travelappfullspec.md` §4. Endpoints added or changed by the requirements in
[../spec.md](../spec.md) are marked **added** or **changed**, with the reason.

---

## 1. Auth

| Method | Path                           | Access | Notes                                                                                              |
| ------ | ------------------------------ | ------ | -------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`               | public | `{email, password, display_name}`. Creates the account, sends verification, returns tokens. FR-001 |
| POST   | `/auth/login`                  | public | Returns `{access_token, refresh_token, user}`. FR-001                                              |
| POST   | `/auth/oauth/google`           | public | `{id_token}`, verified server-side. Creates transparently on first use. FR-002                     |
| POST   | `/auth/oauth/apple`            | public | `{identity_token}`. Same. FR-002                                                                   |
| POST   | `/auth/refresh`                | public | Rotates the refresh token; the old one is revoked. FR-003, FR-005                                  |
| POST   | `/auth/logout`                 | owner  | Revokes one refresh token. FR-004                                                                  |
| POST   | `/auth/logout-all`             | owner  | Revokes every refresh token for the account. FR-004                                                |
| POST   | `/auth/verify-email`           | public | **Added** — spec Assumptions places verification in scope                                          |
| POST   | `/auth/password-reset/request` | public | **Added** — same                                                                                   |
| POST   | `/auth/password-reset/confirm` | public | **Added** — same                                                                                   |

**Token contract**: access tokens are 15-minute JWTs; refresh tokens are opaque random strings,
stored only as hashes, valid 30 days, and rotated on every use.

**Reuse detection (FR-005)** is a contract obligation, not an implementation detail: presenting an
already-rotated refresh token revokes the _entire_ token family and notifies the account holder. A
plain rejection is insufficient — a rotated token in someone else's hands means the chain is
compromised, and only the thief benefits from failing quietly.

**Rate limiting (FR-071)**: `/auth/login`, `/auth/register`, and `/auth/password-reset/request` are
limited per IP and per account identifier. The limited response must not distinguish "no such
account" from "wrong password" — that distinction is an account-enumeration oracle.

---

## 2. Profile

| Method | Path         | Access          | Notes                                                                                                                                                                                                                                                                                       |
| ------ | ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/me`        | owner           | Profile plus stats: countries visited, total distance. FR-050                                                                                                                                                                                                                               |
| PATCH  | `/me`        | owner           | Display name, bio, avatar, home currency, `is_profile_public`. FR-008                                                                                                                                                                                                                       |
| GET    | `/users/:id` | owner-or-public | Returns not-found when the profile is private and the requester does not follow, and when the requester is blocked. FR-061                                                                                                                                                                  |
| DELETE | `/me`        | owner           | Body `{password?}` (required when the account has one; else `403 REAUTHENTICATION_REQUIRED`). **202** `{status:'deletion_requested'}`: the account is marked, every session ends, a sweep removes the objects and then the rows; complete only when it confirms. Idempotent. FR-006, SC-015 |
| POST   | `/me/export` | owner           | **Changed** from `GET` — this starts an async job and is not safely repeatable as a read. Returns a job id; the archive arrives as a signed URL. FR-007                                                                                                                                     |

---

## 3. Trips and stops

| Method | Path                       | Access          | Notes                                                                                                             |
| ------ | -------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/trips`                   | owner           | Own trips, filterable by status                                                                                   |
| POST   | `/trips`                   | owner           | `{title, home_currency}`. **The only endpoint in the entire API that consults entitlement state.** FR-009, FR-074 |
| GET    | `/trips/:id`               | owner-or-public | Owner sees everything; a non-owner sees the curated public view of FR-055                                         |
| PATCH  | `/trips/:id`               | owner           | Title, `is_public`, `cover_photo_id`. `status` is derived and rejected if supplied. FR-013                        |
| DELETE | `/trips/:id`               | owner           | Tombstones the trip and its children; frees an allowance slot immediately. FR-075                                 |
| POST   | `/trips/:id/stops`         | owner           | `{city_id, arrive_date, depart_date, sort_order}`. FR-010                                                         |
| PATCH  | `/trips/:id/stops/:stopId` | owner           | Dates and reordering. FR-012                                                                                      |
| DELETE | `/trips/:id/stops/:stopId` | owner           | FR-012                                                                                                            |
| GET    | `/trips/:id/arcs`          | owner-or-public | Derived great-circle pairs from consecutive stops. FR-016, FR-045                                                 |

### `POST /trips` — the allowance branch

This endpoint has two success shapes and one refusal shape, and the refusal is a designed response
rather than an error:

```json
// 201 — created. Note what is absent: no mention of allowance or payment (FR-084).
{ "trip": { "id": "…", "title": "Italy, spring 2026", "status": "planning" } }
```

```json
// 409 — allowance reached. FR-077 requires all three facts and both routes forward.
{
  "error": {
    "code": "TRIP_ALLOWANCE_REACHED",
    "message": "You have 5 of 5 trips. Subscribe for unlimited trips, or delete a trip to make room.",
    "details": { "trips_held": 5, "allowance": 5, "routes": ["subscribe", "delete_trip"] }
  }
}
```

**Contract obligations on this endpoint:**

- The traveller's submitted title and currency are echoed in the 409 `details` so the client can
  retry without asking them to type it again (FR-079, SC-022).
- The count comes from a live query inside the transaction, never a cached counter (data model §9).
- Entitlement is read from the server's own `subscriptions` row, refreshed by webhook — never from a
  client-supplied claim. This is what resolves the spec's "subscribed on one device, second device
  disagrees" edge case.
- A traveller below the allowance must receive **no** allowance or payment field at all, not a field
  set to false (FR-084).

---

## 4. Notes

| Method | Path                   | Access          | Notes                                                    |
| ------ | ---------------------- | --------------- | -------------------------------------------------------- |
| GET    | `/trips/:tripId/notes` | owner-or-public | `?city_id=` / `?country_id=` filters                     |
| POST   | `/trips/:tripId/notes` | owner           | `{title, body, country_id, city_id?, is_public}`. FR-017 |
| PATCH  | `/notes/:id`           | owner           | Including moving between levels. FR-018                  |
| DELETE | `/notes/:id`           | owner           | Tombstone, not a row removal. FR-039                     |

A public read returns only notes where the note **and** its trip are public. Both conditions live in
the RLS policy (FR-054).

---

## 5. Photos

| Method | Path                               | Access          | Notes                                                                              |
| ------ | ---------------------------------- | --------------- | ---------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/photos/upload-url` | owner           | Pre-signed PUT to a private bucket                                                 |
| POST   | `/trips/:tripId/photos`            | owner           | Registers metadata after the bytes land; enqueues the media worker. FR-028, FR-029 |
| GET    | `/trips/:tripId/photos`            | owner-or-public | Returns short-lived signed GET URLs, thumbnails by default. FR-030                 |
| GET    | `/photos/:id/original`             | owner-or-public | **Added** — a signed GET for the original, only on deliberate viewing. FR-030      |
| PATCH  | `/photos/:id`                      | owner           | Toggles `is_public`; refiles `city_id`                                             |
| DELETE | `/photos/:id`                      | owner           | Tombstone                                                                          |

Shapes (`@triptrackr/contracts` `api/photos.ts`; research D-34):

- `upload-url` takes `{content_type}` (`image/jpeg`, `image/png`, `image/webp`) and answers
  `{upload_url, storage_key, expires_in_seconds}`. The client PUTs with that same `Content-Type`.
- Registration takes `{id?, storage_key, city_id?, taken_at?, exif_lat?, exif_lng?}` — the EXIF the
  device read before re-encoding, both coordinates or neither. The server refuses a `storage_key`
  outside the caller's own prefix (`422 VALIDATION_FAILED`), answers `409 PHOTO_UPLOAD_MISSING` when
  the object is not there, and deletes an object over `MAX_PHOTO_BYTES` and answers
  `413 PHOTO_TOO_LARGE`. A registered photo is `uploaded` and `moderation_state = 'pending'`; a
  retried registration with the same client `id` answers with the stored photo.
- A photo on the wire is the pull record without `deleted_at`, plus `thumbnail_url` — a signed GET,
  or `null` until the worker has made the thumbnail. The list never carries an original's URL.

**Contract obligation on `PATCH /photos/:id`**: setting `is_public = true` is accepted at any time and
is **not** rejected while moderation is pending. The photo simply does not become publicly reachable
until `moderation_state = 'approved'`, because the RLS predicate requires it (FR-056). The response
states the pending status plainly so the traveller is not misled about what others can see.

This differs from `docs/travelappfullspec.md` §4.5, which gated the toggle in the endpoint. Gating at the
endpoint puts the guarantee in application code, where Constitution I says it must not solely live.

---

## 6. Documents

| Method | Path                       | Access              | Notes                                                                                  |
| ------ | -------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/documents` | owner, structurally | **Changed** — the bytes, base64, sealed by the API before storage. FR-033, FR-035      |
| GET    | `/trips/:tripId/documents` | owner, structurally | Owner only, always, at every parameterisation. Metadata and decrypted fields, no bytes |
| GET    | `/documents/:id/content`   | owner, structurally | **Added** — the decrypted bytes, base64, `Cache-Control: no-store`. FR-033             |
| PATCH  | `/documents/:id`           | owner, structurally | Confirms or corrects extracted fields — sets `parsed_confirmed_at`. Constitution IV    |
| DELETE | `/documents/:id`           | owner, structurally | Tombstone                                                                              |

**Changed** 2026-09-29 (research D-32, D-33): the pre-signed `upload-url` route is **removed**. A
pre-signed PUT would have put a boarding pass in the bucket in the clear; the API is the object
store's client and only ciphertext reaches the bucket.

Shapes (`@triptrackr/contracts` `api/documents.ts`):

- Upload: `{id?, type, content_type, content_base64, parsed_json?, confirmed?}`. `content_type` is
  `image/jpeg` or `image/png` and must match the bytes' signature; at most `MAX_DOCUMENT_BYTES`
  decoded (`413 DOCUMENT_TOO_LARGE`). `parsed_json` is `{flight_number, flight_date,
passenger_name}` — only on a `boarding_pass` — and `confirmed: true` means the traveller confirmed
  them on the device before uploading. A retried upload with the same client `id` answers with the
  stored document; an `id` owned by someone else answers `409 DOCUMENT_ID_UNAVAILABLE`.
- A document on the wire is `{id, trip_id, type, content_type, byte_size, parsed_json,
parsed_confirmed_at, upload_state, created_at, updated_at}` — no key, no storage key.
- `PATCH` takes `{type?, parsed_json?, confirmed?}`. Fields sent with `confirmed: true` are stored as
  confirmed; fields sent without it replace the proposal and clear any confirmation; `confirmed: true`
  alone confirms the stored proposal (`409 DOCUMENT_NOTHING_TO_CONFIRM` if there is none).

**Contract obligations:**

- There is no visibility parameter on any document route, and no route accepts one. FR-032.
- Documents do not appear in `/feed`, `/discover`, `/users/:id`, or any trip public view — not
  filtered out of them, but absent from the queries that build them.
- `parsed_json` is accepted as _proposed_ data. It is not authoritative until confirmed (FR-035,
  Constitution IV).
- A non-owner reaches every document route as `404 DOCUMENT_NOT_FOUND` (or `TRIP_NOT_FOUND`), the
  same answer as for an id that does not exist.
- The upload route alone accepts a JSON body above the 1 MB limit — just enough for
  `MAX_DOCUMENT_BYTES` in base64.

---

## 7. Expenses

| Method | Path                              | Access              | Notes                                                                                  |
| ------ | --------------------------------- | ------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/trips/:tripId/expenses`         | owner, structurally | Filter by city, category, date range                                                   |
| POST   | `/trips/:tripId/expenses`         | owner, structurally | Server resolves the FX rate and computes `amount_home`. FR-020, FR-021                 |
| PATCH  | `/expenses/:id`                   | owner, structurally | Never recomputes a stored rate. FR-022                                                 |
| DELETE | `/expenses/:id`                   | owner, structurally | Tombstone                                                                              |
| GET    | `/trips/:tripId/expenses/summary` | owner, structurally | `{by_category, by_day, total_home, rates_applied, pending_conversion}`. FR-025, FR-026 |
| GET    | `/expense-categories`             | owner + system rows | Defaults plus the traveller's own. FR-023, FR-024                                      |
| POST   | `/expense-categories`             | owner               | User-scoped, reusable across all their trips. FR-024                                   |

**Contract obligations:**

- **No endpoint in this API, at any parameterisation, returns another traveller's expense.** There is
  no public variant of these routes and no public-read RLS policy on the table. FR-027.
- The summary discloses `rates_applied` whenever more than one currency is present (FR-026), and
  reports `pending_conversion` separately rather than silently omitting expenses whose rate has not
  yet resolved.
- `POST` accepts an expense with no retrievable rate, storing it with `fx_pending = true` rather than
  refusing. Refusing would fail Constitution II for a cosmetic reason.
- `POST` also accepts the client's own `fx_rate_to_home` and `amount_home` (converted on the device
  from its cached snapshot, research D-10) and stores them as sent; the server resolves a rate only
  when the client sent none. Whatever is stored first is what FR-022 freezes.
- The six system categories carry the fixed ids published in `@triptrackr/contracts` as
  `SYSTEM_EXPENSE_CATEGORIES` (research D-29); `GET /expense-categories` returns them with
  `user_id: null` ahead of the traveller's own rows. A `category_id` that is neither a system id
  nor one of the caller's own rows is a validation problem, never a database error.
- `rates_applied` lists each distinct `(currency, rate)` actually frozen on a row with how many
  rows carry it, and `rates_source` names the feed those rates came from — the default feed's
  terms require attribution (research D-28). `pending_conversion` reports rows still awaiting a
  rate by their own currency, with a count, so nothing is silently omitted from the picture.
- `PATCH /expenses/:id` does not accept `currency`: a different currency is a different
  conversion, so it is a new expense. A patched `amount` is converted with the rate already on
  the row (FR-022).

---

## 8. Planner

| Method | Path                                         | Access | Notes                                                                     |
| ------ | -------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| POST   | `/trips/:tripId/planner/generate`            | owner  | `{city_id, day_date, prompt}`. Async — returns a `job_id`. FR-063, FR-068 |
| GET    | `/planner/jobs/:jobId`                       | owner  | Poll status and progress. FR-068                                          |
| GET    | `/trips/:tripId/itinerary`                   | owner  | Full itinerary. Owner-only in this release — see note below               |
| POST   | `/trips/:tripId/itinerary/days/:dayId/items` | owner  | Traveller-added activity. FR-067                                          |
| PATCH  | `/itinerary-items/:id`                       | owner  | Reorder or move between days. FR-067                                      |
| DELETE | `/itinerary-items/:id`                       | owner  | FR-067                                                                    |
| GET    | `/trips/:tripId/itinerary/days/:dayId/route` | owner  | Walking route GeoJSON for that day. FR-066                                |

**Contract obligations:**

- Every item in a completed job carries a real `location`. A suggestion that failed geocoding is
  **absent** from the response, not present with a null or approximate position (FR-065, SC-017).
- A completed job reports `dropped_count` so a thin day is explained rather than mysterious.
- Exceeding the daily allowance returns `PLANNER_LIMIT_REACHED` with the reset time, never a silent
  failure or an empty result (FR-069).
- A materially identical recent request is served from cache. The response says so, so the traveller
  understands why it returned instantly (FR-070).
- The route endpoint is separate from the itinerary endpoint precisely so that FR-067's "redraws
  without regenerating the entire plan" is structurally true: moving an item re-fetches one day's
  route and touches no LLM.
- **Itineraries are owner-only in this release** (corrected 2026-09-23). The two read endpoints
  above were previously marked `owner-or-public`, but `itinerary_days` and `itinerary_items` carry
  no visibility column and the data-access policy grants them no public read — the contract and
  the policy disagreed, and the policy is the authority. A public trip's curated view (FR-055) is
  the arc, cover photo, stops, and explicitly public notes and photos; sharing itineraries is the
  blueprint's "discovery of public itineraries" idea and is deferred until it has its own
  visibility posture declared (Constitution I).

---

## 9. Social — _blocked on the sync gate_

**These endpoints must not be implemented until the User Story 6 acceptance suite passes.**
Constitution II; spec "Sequencing constraint". This is a build-order gate, not a suggestion.

| Method | Path                          | Access        | Notes                                                                         |
| ------ | ----------------------------- | ------------- | ----------------------------------------------------------------------------- |
| POST   | `/users/:id/follow`           | owner         | Auto-accepted for a public profile, pending for a private one. FR-058         |
| DELETE | `/users/:id/follow`           | owner         | Unfollow                                                                      |
| POST   | `/follow-requests/:id/accept` | owner         | FR-058                                                                        |
| GET    | `/feed`                       | owner         | Public trips from followed travellers, newest first, cursor-paginated. FR-059 |
| GET    | `/discover`                   | authenticated | Public trips, filterable by city or country. FR-060                           |
| POST   | `/reports`                    | owner         | `{target_type, target_id, reason}`. FR-062                                    |
| POST   | `/users/:id/block`            | owner         | FR-061                                                                        |
| DELETE | `/users/:id/block`            | owner         | **Added** — a block that cannot be lifted is a bug, not a policy              |

**Contract obligation**: blocks are enforced in the RLS predicate that every public read shares, not
in each of these four query paths. FR-061 must hold on the profile, trip, discovery, and feed routes
alike, and one predicate covers all four where four filters offer four chances to miss one.

---

## 10. Commerce — **added section**

`docs/travelappfullspec.md` predates the subscription requirements (FR-074 to FR-084).

| Method | Path                          | Access          | Notes                                                                                                    |
| ------ | ----------------------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/me/entitlement`             | owner           | `{is_active, current_period_end, trips_held, allowance}`. FR-077, FR-082                                 |
| POST   | `/billing/purchase-completed` | owner           | Client reports a completed store purchase; the server verifies with the provider before granting. FR-078 |
| POST   | `/billing/webhook`            | provider-signed | Authoritative entitlement updates. Signature-verified; unsigned calls are rejected                       |

**Contract obligations:**

- `POST /billing/purchase-completed` is **idempotent by transaction identifier**. A retried call
  after a lost confirmation grants the same entitlement once and never charges twice (FR-083,
  SC-025).
- The client's report is a hint that triggers verification, never the grant itself. The provider is
  the authority; this system's row is a cache (research D-07).
- No endpoint accepts, forwards, or logs a card number, expiry, or CVC. There is no field for one
  anywhere in this contract (FR-081).
- No endpoint in _any other section_ consults entitlement state. That absence is what makes
  Constitution V and FR-080 structurally true rather than a promise.

---

## 11. Lookups

| Method | Path                    | Access | Notes                                                                                                                                                                           |
| ------ | ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/countries`            | public | Full list, cached aggressively                                                                                                                                                  |
| GET    | `/countries/:id/cities` | public | `?q=` autocomplete, accent-tolerant, ranked by prominence. FR-014                                                                                                               |
| GET    | `/fx-rates`             | owner  | **Added 2026-09-24** — the latest daily snapshot: `{base: "USD", as_of, source, rates: {EUR: "0.877372", …}}`. The device caches it so an offline expense converts (D-10, D-28) |

`/fx-rates` is reference data like the geography routes but requires a session: it is fetched once
a day per device, and an unauthenticated public route would be a free proxy for the upstream feed.

---

## 12. Sync

See [sync-protocol.md](./sync-protocol.md).

---

## Contract tests

Written before implementation (Constitution III). At minimum:

| #   | Test                                                                                                         | Proves                     |
| --- | ------------------------------------------------------------------------------------------------------------ | -------------------------- |
| 1   | Every endpoint rejects a missing, malformed, or expired token                                                | Auth boundary              |
| 2   | A rotated refresh token, replayed, revokes the whole family                                                  | FR-005                     |
| 3   | Login rate limiting engages, and its response does not distinguish unknown account from wrong password       | FR-071                     |
| 4   | A non-owner requesting an existing private trip gets exactly the not-found response                          | Access-rule non-disclosure |
| 5   | `POST /trips` at the allowance returns 409 with counts, allowance, both routes, and the echoed submission    | FR-077, FR-079             |
| 6   | `POST /trips` below the allowance returns no allowance or payment field at all                               | FR-084                     |
| 7   | Every non-create endpoint behaves identically with an active and a lapsed entitlement                        | FR-080, SC-021             |
| 8   | `PATCH /photos/:id` to public while moderation is pending succeeds, and the photo stays publicly unreachable | FR-056                     |
| 9   | No document or expense route accepts a visibility parameter                                                  | FR-027, FR-032             |
| 10  | A completed planner job contains zero items lacking a resolved location                                      | FR-065, SC-017             |
| 11  | `POST /billing/purchase-completed` replayed with the same transaction id grants once                         | FR-083, SC-025             |
| 12  | An expense with no available rate is stored with `fx_pending`, not rejected                                  | FR-020, Constitution II    |
