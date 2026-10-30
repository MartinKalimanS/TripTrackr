# Feature 013: Trip allowance and entitlement (server)

Status: built from roadmap step S-10 (T172 to T180; FR-074 to FR-084; research D-07, D-08), 2026-10-30. API and
contracts only; the mobile paywall is a later step.

## Why

The free tier holds a fixed number of live trips. Constitution V forbids a commercial limit from touching anything
already recorded, so the limit lives in exactly one place: the moment a trip is created.

## Requirements

- **FR-001** `POST /trips` counts the caller's live trips (`deleted_at IS NULL`) inside the request transaction. Below
  `FREE_TRIP_ALLOWANCE` (default 5) it answers 201 with the trip and no allowance or payment field (FR-084).
- **FR-002** At the allowance, and with no active entitlement, it answers 409 `TRIP_ALLOWANCE_REACHED` with
  `details { trips_held, allowance, routes: ['subscribe', 'delete_trip'], submitted { title, home_currency } }`, so
  the client redraws the paywall and retries without retyping (FR-077, FR-079).
- **FR-003** An active entitlement lifts the limit. The entitlement is the server's own `subscriptions` row, never a
  client claim.
- **FR-004** A lapsed entitlement changes nothing already recorded: no trip is hidden, locked or deleted, and every
  endpoint except `POST /trips` answers the same for an active and a lapsed account (FR-076, FR-080, SC-021).
- **FR-005** Deleting a trip frees its slot at once (FR-075); the count is live, never a cached counter.
- **FR-006** Two concurrent creates cannot both take the last slot: the check and the insert are serialised per
  traveller.
- **FR-007** A replay of a create with an id the traveller already owns returns that trip (201) even at the allowance:
  it is the same intention, not a new trip.
- **FR-008** `GET /me/entitlement` returns `{ is_active, current_period_end, trips_held, allowance }` for the caller
  (FR-077, FR-082).
- **FR-009** A trip that arrives by sync push is never refused for the allowance; it is kept and flagged
  `over_allowance` unless the account is entitled (D-08).
- **FR-010** One class (`AllowanceService`) is the only code that reads `subscriptions`. No RLS policy of another table
  and no read, list or export path references it.

## Out of scope (S-11)

`POST /billing/purchase-completed` and `/billing/webhook` (RevenueCat), and the idempotency test T175, arrive with
the provider integration. Until then `subscriptions` is written only by the owner role.

## Privacy posture

`GET /me/entitlement` and the 409 expose the caller's own counts only. Entitlement state is not reachable from any
public, shared or export path.
