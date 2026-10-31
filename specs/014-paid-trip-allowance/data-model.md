# Data model: Paid trip allowance (spec 014)

Migration `0016_paid_trip_allowance.sql` (hand-written SQL; Drizzle mirrors the shapes in
`apps/api/src/db/schema/commerce.ts` for types only, never for policies). Every new table has `ENABLE` and `FORCE`
row level security.

## Visibility posture

All four tables are the traveller's own commerce records. No table has a visibility flag and none is readable by
anyone but its owner. **No policy, view, list, export or sync path of another table may mention them** (Constitution
V). The API role connects without ownership of any of them.

## `trip_credits` — one row per single-trip purchase

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users(id)` ON DELETE CASCADE | account deletion removes unused credits (FR-010) |
| `provider` | text NOT NULL | `app_store` or `play_store` (check) |
| `transaction_id` | text NOT NULL, **UNIQUE** | idempotency key (FR-023) |
| `product_id` | text NOT NULL | |
| `purchased_at` | timestamptz NOT NULL | |
| `refunded_at` | timestamptz NULL | set by a refund |

RLS: `SELECT` where `user_id = current user`. No write policy; writes go through `billing_*` functions.

## `subscription_periods` — one row per paid subscription year

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users(id)` ON DELETE CASCADE | |
| `provider` | text NOT NULL | |
| `tier` | text NOT NULL | `tier1` or `unlimited` (check) |
| `ladder_step` | int NOT NULL | 1, 2, 3 (floor); from `years_subscribed` |
| `original_transaction_id` | text NOT NULL | |
| `starts_at`, `ends_at` | timestamptz NOT NULL | `ends_at > starts_at` |
| `uses_total` | int NULL | 10 for `tier1`, NULL for `unlimited` (check ties it to the tier) |
| `refunded_at` | timestamptz NULL | |
| `cancel_at_period_end` | boolean NOT NULL DEFAULT false | the date told to the traveller (FR-015) |

**UNIQUE** `(original_transaction_id, starts_at)` makes a replayed renewal a no-op.

Active period: `starts_at <= now() < ends_at AND refunded_at IS NULL`. `years_subscribed` is derived: consecutive
periods whose gap is zero, counted back from the active one; any gap restarts it. It feeds `ladder_step`.

The existing `subscriptions` row (spec 013) stays as the cache of "is a paid plan active" so S-10's tests and
`GET /me/entitlement` keep working; the webhook updates both in one call.

## `trip_covers` — the spend ledger, one row per covered trip

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL → `users(id)` ON DELETE CASCADE | |
| `trip_id` | uuid NOT NULL, **UNIQUE**, **no FK** | survives the 90-day purge (D14-02); the UNIQUE makes a replayed create spend nothing |
| `source` | text NOT NULL | `credit`, `year`, `unlimited`, `grandfathered` |
| `credit_id` | uuid NULL → `trip_credits(id)` | set when `source = credit`; **UNIQUE** where not null |
| `period_id` | uuid NULL → `subscription_periods(id)` | set when `source` is `year` or `unlimited` |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Check: `source = 'credit'` ⇔ `credit_id` not null; `source IN ('year','unlimited')` ⇔ `period_id` not null.
Trigger `trip_covers_year_guard` (BEFORE INSERT): for `source = 'year'` refuse unless the period is active and
`count(*) of covers with that period_id < uses_total`.

RLS: `SELECT` and `INSERT` for the owner (`WITH CHECK user_id = current user`). No `UPDATE`, no `DELETE` for the API
role; refunds delete through `billing_*` functions.

## `allowance_shadow` — who would have been stopped

| Column | Type | Notes |
| ------ | ---- | ----- |
| `user_id` | uuid PK → `users(id)` ON DELETE CASCADE | |
| `first_blocked_at` | timestamptz NOT NULL | |
| `attempts` | int NOT NULL | |

RLS: owner `SELECT`, `INSERT`, `UPDATE`. Holds no trip content. Deleted by `billing:grandfather`.

## Functions (all `SECURITY DEFINER`, owned by the migration role, named `billing_*`)

| Function | Does | Bounds |
| -------- | ---- | ------ |
| `billing_grant_credit(user, provider, txn, product, at)` | insert a credit; no-op if `txn` exists | one row, keyed by the store's transaction id |
| `billing_open_period(user, provider, tier, orig_txn, starts, ends, cancel_at_end)` | insert or extend a year, set `ladder_step`, refresh the `subscriptions` row | idempotent on `(orig_txn, starts)` |
| `billing_end_period(orig_txn, at)` | mark expired / cancelled | touches periods only |
| `billing_refund(txn, at)` | refund a credit or a year; delete that credit's cover | D14-10 |

None takes a trip id, a title or any traveller content. Callable only from the signature-verified webhook
handler and the owner script.

## State transitions

```text
credit:   (purchased) → unspent → spent (cover row)            refunded → never spendable
                                   └─ trip deleted: stays spent
year:     (renewed) → active (uses 0..10) → ended (ends_at)    uses expire; covers stay
trip:     ordinary → (flagged by sync) → covered | stays flagged
charging: off → (billing:grandfather, then BILLING_ENFORCED=true) → on
```
