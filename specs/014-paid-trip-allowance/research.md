# Research: Paid trip allowance (spec 014)

Decisions are numbered `D14-nn` (feature-local, like feature 004's `D4-nn`). Where a fact comes from a vendor page and
has not been proven in a sandbox, it says **UNVERIFIED** and names the step that proves it.

## D14-01 — A trip's cover lives in its own server-owned table, not on `trips`

**Decision**: a table `trip_covers` (one row per covered trip) records what paid for the trip. `trips` and the sync
wire format do not change.

**Rationale**: `trips` is a synced table that a device writes. A cover column there could be sent by a device (a
client claiming it paid), could be overwritten by a later push, and would change the sync records both apps share.
A separate table that the API role can only INSERT into, and that no sync path reads, makes the cover the server's
word alone (the same reasoning as `subscriptions`, research D-08).

**Alternatives**: a `covered_by` column on `trips` (rejected: client-writable, changes the contract); a flag in the
pull payload (rejected: FR-021 says reads are identical whatever was bought).

## D14-02 — The spend ledger survives the trip

**Decision**: `trip_covers.trip_id` is a plain `uuid` with a unique constraint and **no foreign key** to `trips`.
Credits and subscription-year uses are counted from `trip_covers`, never from live trips.

**Rationale**: the 90-day tombstone purge (migration 0013) hard-deletes a deleted trip. If the cover row cascaded
away with it, a spent credit or a spent Tier 1 use would become spendable again after 90 days, which FR-006
forbids. Without the FK the row stays until the account is deleted (the `user_id` FK cascades, FR-010).

**Alternatives**: `ON DELETE SET NULL` (rejected: loses the unique guard on replays); a spent flag on the credit
(rejected for years: the use count would need a counter that can drift).

## D14-03 — The count of ordinary trips excludes covered trips

**Decision**: `ordinary_held` = live trips of the caller with no `trip_covers` row. A create is free while
`ordinary_held < FREE_TRIP_ALLOWANCE` (default 3).

**Rationale**: it makes FR-005 and FR-006 one query. Deleting a covered trip changes nothing (the cover row stays,
the trip leaves the live set but was never counted); deleting an ordinary trip lowers the count.

## D14-04 — Spending order is decided in code, under the existing advisory lock

**Decision**: inside the `POST /trips` request transaction, after `pg_advisory_xact_lock(hashtextextended(user, 0))`
(spec 013), the service decides in this order: charging off → record and allow; Unlimited active → cover
`unlimited`; `ordinary_held < free` → no cover; Tier 1 year with uses left → cover `year`; unspent credit → cover
`credit`; else 409. After the trip insert it inserts the `trip_covers` row. Database guards back the code:
`UNIQUE(credit_id)` so a credit can be spent once, and a trigger on `trip_covers` that refuses a `year` cover past
the period's `uses_total` or after `ends_at`.

**Rationale**: the project already serialises creates this way and tests it with a race (013 contract test). Keeping
the order in TypeScript keeps it readable and testable; the constraints mean a coding mistake cannot over-spend.

**Alternatives**: the whole decision inside a `SECURITY DEFINER` SQL function (rejected: harder to test and read; the
only party hurt by a bug is the owner's revenue, not a traveller's privacy).

## D14-05 — Which tables the API role may touch

**Decision**: the API role gets `SELECT` on `trip_credits`, `subscription_periods`, `billing_state` and
`allowance_shadow`; `SELECT, INSERT` on `trip_covers`; `INSERT, UPDATE` on `allowance_shadow` for its own row. The
webhook and the owner script write the commerce tables through `SECURITY DEFINER` functions named `billing_*`
(the pattern of 0013 and 0014), because RevenueCat calls us with no traveller identity.

**Rationale**: matches how `subscriptions` is protected. The neutrality privacy test is widened to "no policy or view
mentions these tables; only functions named `billing_*` read them; in `src/` only files under `modules/billing/`
mention them".

## D14-06 — The charging switch is a database row plus one owner script

**Decision**: `billing_state` holds one row, `enforced_at timestamptz NULL`. The owner script
`npm run billing:enforce -w apps/api` runs, in one transaction: set `enforced_at = now()`, insert a
`grandfathered` cover for every live trip that has none (FR-029, option A), delete the `allowance_shadow` rows. The
API reads the row (cached for 30 seconds). `npm run billing:shadow-report -w apps/api` prints counts only.

**Rationale**: an environment variable could be flipped without the grandfathering, and a flip with the wrong
timing would block early users. One transaction makes "switch on" and "protect existing trips" inseparable, and it
needs no app release (FR-028). Switching off sets `enforced_at` to NULL; it does not remove covers.

**Alternatives**: `BILLING_ENFORCED` env var (rejected: no atomic grandfathering, needs a restart).

## D14-07 — Shadow mode records an aggregate per traveller, never content

**Decision**: while `enforced_at IS NULL`, the create path writes `allowance_shadow(user_id, first_blocked_at,
attempts)` when the traveller is past what the rules would allow. Nothing is returned to the client. The report
returns `{ travellers_blocked, attempts }` and nothing else.

**Rationale**: FR-027. The table holds a user id and counts, no title, date or place. It is deleted at switch-on.

## D14-08 — Webhook events and products (RevenueCat)

**Decision**: handle `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `CANCELLATION`, `EXPIRATION`,
`BILLING_ISSUE`, `NON_RENEWING_PURCHASE` and refund events; acknowledge and log any other type. Idempotency key is the
store `transaction_id` (credits) and `original_transaction_id` plus period start (years). A product map in
configuration says which store product id is a single trip, Tier 1 or Unlimited.

**Rationale**: RevenueCat's event table lists `NON_RENEWING_PURCHASE` for non-subscription purchases such as
consumables, and a vendor community answer recommends granting on it keyed by `transaction_id` so retries do not
double-grant. **UNVERIFIED**: whether a refund of a consumable arrives as its own event type or as `CANCELLATION`
with a cancel reason; the docs conflict. The handler treats **both** as a refund of that transaction, so either
shape works. Proven by the recorded fixtures of S-11 and the sandbox run of S-13.

## D14-09 — The yearly price ladder is store products per ladder step

**Decision**: each tier has one store product per ladder step (`tier1_y1`, `tier1_y2`, `tier1_y3_plus`, and the same
for Unlimited), all in one subscription group. The server records `years_subscribed` and returns the product id the
traveller should be offered next; the app shows that product's own store price and currency. A lapse of any length
restarts at `y1`. Prices live in the stores and RevenueCat offerings, never in the app or the server.

**Rationale**: the stores lower a price for **everyone** on a product, not by tenure. RevenueCat's price-change docs
say Apple notifies existing subscribers of a decrease and applies it at the next renewal, while on Google Play
existing subscribers stay in a legacy price group until the developer migrates them. Neither offers a per-subscriber
ladder. Separate products per step are the only mechanism that gives tenure-based prices without custom store
features. **UNVERIFIED**: how a subscriber moves from `y1` to `y2` at renewal with the least friction (a standard
plan change taking effect at renewal, versus a signed promotional offer for Apple and a developer-determined offer
for Google). The server data model does not depend on the answer; S-13 proves it in both sandboxes before the
screens are built (S-12).

**Alternatives**: one product and a store-wide price change (rejected: not tenure-based); promotional offers only
(rejected: Google's equivalent is not available through RevenueCat for existing subscribers).

## D14-10 — Refunds

**Decision**: a refund of an unspent credit sets `refunded_at` (it can never be spent). A refund of a spent credit
sets `refunded_at` and deletes that credit's `trip_covers` row, so the trip becomes ordinary and nothing else
changes. A refund of a year sets `refunded_at` on the period; covers already made stay.

**Rationale**: FR-024 and FR-020. The trip is never deleted or hidden; the only effect is a higher `ordinary_held`.

## D14-11 — Offline trips and covering a flagged trip

**Decision**: the push policy asks the same question as before, with the new meaning: a trip is over when it has no
cover and at least `FREE_TRIP_ALLOWANCE` other ordinary live trips were created before it. Under an active Unlimited
plan the push covers it on arrival. `POST /trips/:id/cover` spends a year use, then a credit, on a flagged trip
(FR-019).

**Rationale**: keeps the rank rule that makes a retried push answer the same way (013), and reuses the spending
order of D14-04.

## D14-12 — What a lapsed or refunded account reads

**Decision**: no policy, view, export or list joins the new tables. `GET /me/entitlement` is the only read of them
besides the create path, and it is the paywall's data, not a traveller's record.

**Rationale**: Constitution V, FR-021. The widened neutrality test and the "reads identical" test (T176, now
required here) prove it.

## Open items carried to later steps

| Item | Who | Where |
| ---- | --- | ----- |
| Refund event shape for consumables | recorded fixture + sandbox | S-11, S-13 |
| Moving a subscriber to the next ladder product at renewal | sandbox in both stores | S-13 before S-12 |
| Final prices, floor and the free number | owner | configuration, any time |
| When to run `billing:enforce` | owner | after the shadow report |
