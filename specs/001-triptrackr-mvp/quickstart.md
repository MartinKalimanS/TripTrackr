# Quickstart — Running and Validating TripTrackr MVP

**Branch**: `001-triptrackr-mvp` | **Date**: 2026-08-26 | **Plan**: [plan.md](./plan.md)

This is a run-and-verify guide. It says how to bring the system up and how to prove the feature
works end to end. Implementation detail belongs in `tasks.md` and the code; schema detail is in
[data-model.md](./data-model.md); interface detail is in [contracts/](./contracts/).

---

## 1. Prerequisites

| Tool                   | Version | Notes                                                              |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| Node.js                | 22 LTS  | Both the mobile app and the server                                 |
| Docker + Compose       | current | Runs the entire backend stack                                      |
| Expo dev client        | SDK 57  | The managed workflow is insufficient — native modules are required |
| Android Studio / Xcode | current | Device or emulator for the dev-client build                        |
| Maestro                | current | Offline and privacy E2E flows                                      |

**Before writing any code against an Expo API**, consult the versioned docs at
`https://docs.expo.dev/versions/v57.0.0/`. Recalled API shapes are a defect source here — this is a
constitutional obligation, not advice.

### Accounts and credentials needed

Mapbox (public and secret tokens), Anthropic, RevenueCat plus App Store Connect and Play Console,
Resend, Sentry, and Cloudflare R2 for production. Development runs against MinIO locally, so R2 is
not needed to work on the app.

---

## 2. Bring the stack up

```bash
cp infra/.env.example infra/.env      # then fill it in — the API refuses to boot on a gap
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml run --rm migrate
node infra/scripts/import-geo-catalogue.js   # GeoNames extract → countries, cities
```

Services: `postgres` (PostGIS), `redis`, `minio`, `api`, `media-worker`, `traefik`.

**Verify before going further:**

```bash
curl -s localhost:3000/v1/health                          # {"status":"ok"}
curl -s localhost:3000/v1/countries | head -c 200         # non-empty catalogue
docker compose exec postgres psql -U triptrackr -c \
  "SELECT tablename, rowsecurity, forcerowsecurity FROM pg_tables
   WHERE schemaname='public' AND tablename IN
   ('trips','notes','photos','expenses','documents','users','subscriptions');"
```

Every row of that last query must show `t` in **both** boolean columns. A `f` in either means the
privacy guarantee is not in force, and no amount of passing behavioural tests will tell you
(see [contracts/data-access-policy.md](./contracts/data-access-policy.md) §1).

## 3. Run the mobile app

```bash
npm install                   # from the repository root — one lockfile for every workspace
cd apps/mobile
npx expo run:android          # or run:ios — builds the dev client
npx expo start --dev-client
```

The `EXPO_PUBLIC_API_URL` must point at the host machine's LAN address, not `localhost` — a device
resolves `localhost` to itself.

---

## 4. Validation scenario — privacy (the non-negotiable outcome)

**Run this first.** Under Constitution I, a build that fails here is not shippable regardless of
what else works.

```bash
cd apps/api && npm run test:privacy
```

The suite is specified in full at
[contracts/data-access-policy.md](./contracts/data-access-policy.md) §4. It runs against a real
PostgreSQL via Testcontainers — a mocked database cannot exercise an RLS policy — and it runs _as a
non-owner_, attempting to reach account A's data from accounts B and C through every available route.

**Pass condition**: 20 of 20, including the four assertions (rows 14–17) that check `pg_catalog` and
the live connection rather than behaviour — they verify the policies are actually in force, and that
the API is connected as `triptrackr_api`, rather than merely defined.

**Manual confirmation** of the same property, worth doing once by hand because it is the product's
whole premise:

1. Sign in as A. Create a trip, log three expenses, store a boarding pass, write two notes — one
   marked public, one not. Make the trip public.
2. Sign in as B on a second device. Open A's public trip.
3. Confirm: the public note is visible; the private note is not; there is no expenses tab, no
   documents tab, and no route by which either appears.
4. With A's trip id and expense id in hand, call `GET /trips/:id/expenses` as B directly. Expect the
   same response as for a trip that does not exist — not a 403, which would confirm it exists.

---

## 5. Validation scenario — offline sync (the hard gate)

**The social layer does not begin until this passes.** Constitution II; spec "Sequencing constraint".

Maestro drives one device per run and the gate needs two, so the suite is a set of phases
dispatched by `apps/mobile/e2e/06-offline-acceptance.yaml` (tasks.md T140 + T203):

```bash
maestro --device "$A" test -e RUN_ID="$RUN_ID" -e DEVICE_ROLE=A -e PHASE=p01 \
  apps/mobile/e2e/06-offline-acceptance.yaml
```

The full ordered run, the preparation (the API must be reachable over the network, never through
`adb reverse`) and the row-to-file table are in
[apps/mobile/e2e/offline/README.md](../../apps/mobile/e2e/offline/README.md).

The fifteen scenarios are specified at
[contracts/sync-protocol.md](./contracts/sync-protocol.md) §6.

**Manual confirmation**, two devices, one account:

1. Device 1 to aeroplane mode. Create a note, log an expense, capture a photo, add a document.
   Edit two of them. Delete one.
2. Force-quit and relaunch, still offline. Everything is still there — nothing lost to the restart.
3. Confirm the photo shows a pending treatment, not a normal thumbnail. Its bytes have not left the
   device, so it is not saved (FR-041).
4. Restore connectivity. Within 30 seconds everything has reached the server, the deletion included,
   and the photo's pending treatment clears once the file lands.
5. Device 2, same account: the deleted record does not appear. It never had it, and it must not
   acquire it.
6. Both devices offline. Edit the same note differently on each. Bring device 1 online, then
   device 2. Exactly one version survives, deterministically, and **device 2 is told its version was
   superseded** — a silent overwrite fails this step.
7. Sign in on a fresh device. A "syncing your trips" state appears, then the full history. An empty
   screen at any point fails FR-042.

---

## 6. Validation scenario — first-run journey (User Stories 1 and 2)

Manual, timed against SC-005 (under 3 minutes) and SC-006 (an expense in under 15 seconds):

1. Register with email, password, and display name.
2. Create "Italy, spring 2026" with a home currency.
3. Add a stop: pick Italy, type "rom", select Rome, set dates. Confirm accented and unaccented input
   both match, and that prominent cities rank first (FR-014).
4. Add Florence. Confirm its arrival date is pre-suggested from Rome's departure (FR-015).
5. Drag Florence above Rome. Confirm the order persists across an app restart (FR-012).
6. Try a departure date before the arrival date. Confirm a clear rejection, not a silent correction
   (FR-011).
7. Log three expenses across two currencies. Open the summary: totals reconcile exactly by category
   and by day in the home currency, and the applied rates are disclosed (FR-025, FR-026, SC-016).
8. Write a country-level note, then move it into Rome. Confirm the body and the creation date are
   both intact (FR-018).

---

## 7. Validation scenario — globe (User Stories 3 and 4)

With three trips in different states:

1. Cold-start the app. An interactive globe within 3 seconds (SC-001).
2. Three visually distinct arcs, between the correct cities. The active trip animated; the others
   not (FR-046).
3. Tap an arc — the correct trip opens (FR-047).
4. The overlay shows countries visited and total distance (FR-050).
5. Pinch into a city continuously. **No reload, no jump between two views** — this is FR-048, and a
   visible seam fails it.
6. At close range, terrain relief and building shapes are visible (FR-049).
7. Download a city for offline use, go offline, reopen the map — it renders from the pack (FR-044).
8. On a fresh account with no trips, the home screen is an inviting empty state, not a bare sphere
   (FR-051).

Profile with 50+ arcs on a mid-tier device and confirm no perceptible stutter (SC-002).

---

## 8. Validation scenario — documents (User Story 5)

1. Store a boarding pass. Confirm the flight number, date, and passenger name are extracted and
   **presented for confirmation** rather than silently accepted (FR-035, Constitution IV).
2. Try a damaged or unreadable barcode. Confirm a clean fallback to manual entry — this is not an
   error state (spec edge case).
3. While viewing a document, attempt a screenshot and a screen recording. Both blocked (FR-034).
4. Background the app while a document is open, then open the app switcher. **The preview must be
   blurred, not legible** — `enableAppSwitcherProtectionAsync()` on iOS, `FLAG_SECURE` on Android
   (research D-05).
5. Search the entire sharing interface for documents. They are absent — not present-and-disabled
   (FR-032).
6. Confirm at the database level that a document row yields only a wrapped key and a storage key,
   never readable content (FR-033).

---

## 9. Validation scenario — planner (User Story 8)

1. Request two days in Rome, "art and food". Progress is visible throughout and the app stays usable
   (FR-068). Delivered within 60 seconds (SC-004).
2. **Every pin resolves to a real, correctly located place.** Spot-check against the map; then
   confirm the job's `dropped_count` accounts for anything omitted. A pin at a guessed position fails
   SC-017 outright (FR-065).
3. Each day's walking route connects its places without obvious backtracking (FR-066).
4. Drag an activity to another day. The affected days redraw; the plan is not regenerated, and no
   LLM call is made (FR-067).
5. Repeat the identical request within the cache window. It returns quickly, and says it was cached
   (FR-070).
6. Exceed the daily allowance. A clear message with a reset time — never a silent failure (FR-069).
7. Request a nonsensical or empty prompt, and a city with no stop. Both handled gracefully.

---

## 10. Validation scenario — trip allowance (User Story 9)

Free allowance is configuration; set it low for testing rather than creating five trips by hand.

1. Below the allowance, create a trip. **No mention of limits or payment appears anywhere** — not a
   disabled control, not a counter (FR-084).
2. At the allowance, attempt another. The response states trips held, the allowance, and both routes
   forward (FR-077).
3. Take the delete branch: remove a trip. The slot frees immediately, with no further step (FR-075).
4. Take the subscribe branch: purchase through the store sheet. The pending trip is created straight
   away, without re-entering the title or currency (FR-079, SC-022).
5. Confirm no card field appears anywhere in this product at any point (FR-081).
6. Simulate a lapsed subscription on an over-allowance account. **Every existing trip stays fully
   readable and editable.** Nothing is deleted, hidden, locked, archived, or degraded. Only creating
   another trip is blocked (FR-080, SC-021).
7. Replay a purchase confirmation with the same transaction id. Entitlement is granted once; no
   duplicate charge (FR-083, SC-025).
8. Find the cancellation route without contacting support, and confirm the effective date is stated
   plainly (FR-082).

---

## 11. Full check before calling work done

```bash
npm run lint && npm run typecheck                     # every workspace, from the repository root
npm run test -w packages/contracts                    # the shared sync and REST schemas
npm run test:unit -w apps/api && npm run test:integration -w apps/api && npm run test:privacy -w apps/api
npm run test -w apps/mobile
maestro test apps/mobile/e2e/                         # all flows
```

| Gate                                     | Threshold                                                       |
| ---------------------------------------- | --------------------------------------------------------------- |
| Coverage, both sides                     | ≥ 80% (Constitution III)                                        |
| Privacy suite                            | 20 of 20, including the four `pg_catalog`/connection assertions |
| Offline suite                            | 15 of 15                                                        |
| Migrations against an ephemeral database | Clean                                                           |
| Backup restored into a scratch database  | Verified — an unrestored backup is not a backup                 |

The last row is a launch-blocking checklist item, not a runbook footnote (Constitution, Technology
Constraints; SC-020).
