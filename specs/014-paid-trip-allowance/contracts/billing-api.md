# Contract: billing API (spec 014)

Schemas live in `packages/contracts/src/api/billing.ts` (zod, strict). This file is the behaviour; the schema is the
shape. Replaces the 409 and entitlement shapes of spec 013.

## `POST /v1/trips` (changed)

Unchanged request. Outcomes, in the spending order of D14-04:

| State | Result |
| ----- | ------ |
| Charging off | 201. If the traveller would have been stopped, a shadow row is written; the response is the same as any other 201. |
| Replay of an id the caller already owns | 201 with that trip; nothing spent. |
| Unlimited active | 201; cover `unlimited`. |
| `ordinary_held < free` | 201; no cover. |
| Tier 1 year with uses left | 201; cover `year`. |
| Unspent credit | 201; cover `credit`. |
| None of the above | 409 `TRIP_ALLOWANCE_REACHED` (below). Nothing is written. |

The 201 body is exactly `{ trip }`. It never carries a cover, allowance or payment field (FR-003).

### 409 `error.details` (`TripAllowanceDetails`)

```json
{
  "trips_held": 3,
  "allowance": 3,
  "year_uses_left": 0,
  "credits": 0,
  "routes": ["buy_trip", "subscribe", "delete_trip"],
  "submitted": { "title": "Lisbon in March", "home_currency": "CHF" }
}
```

`trips_held` is `ordinary_held`. `routes` always lists every way forward; the app decides what to draw.
The offered product ids come from `GET /me/entitlement`, not from this error.

## `GET /v1/me/entitlement` (changed)

```json
{
  "charging_enabled": true,
  "tier": "tier1",
  "is_active": true,
  "current_period_end": "2027-10-30T00:00:00.000Z",
  "cancel_at_period_end": false,
  "year_uses_left": 7,
  "credits": 2,
  "trips_held": 3,
  "allowance": 3,
  "years_subscribed": 2,
  "next_product_id": "tier1_y3_plus"
}
```

- With `charging_enabled: false` every other field is `null` or `0` and the app shows nothing (FR-026).
- `tier` is `null` | `tier1` | `unlimited`. `next_product_id` is the product the app offers for the next renewal
  of that tier (D14-09); the app reads its price and currency from the store, not from here.
- Reads only the caller's own rows.

## `POST /v1/trips/:id/cover` (new)

Covers a flagged trip the caller owns. Order: Unlimited, year use, credit. 200 with `{ source }`; 409
`TRIP_ALLOWANCE_REACHED` if nothing can cover it; 404 for a trip that is not the caller's or not live; idempotent
(a trip already covered answers 200 with its source and spends nothing).

## Sync push (changed)

`over_allowance` keeps its meaning: the trip is kept and flagged. It is computed by D14-11 and is `false` while
charging is off and for any covered trip. An Unlimited-active account's pushed trips are covered on arrival.

## Webhook and purchase endpoints (S-11)

`POST /v1/billing/webhook` (RevenueCat, signature header checked before the body is parsed, constant-time compare)
and `POST /v1/billing/purchase-completed` (the app asks the server to re-read RevenueCat for the caller) call the
`billing_*` functions of the data model. They answer 200 for an unknown event type (logged, no PII), 401 for a bad
signature, and are replay-safe by D14-08. Authoritative state is the webhook; `purchase-completed` only shortens the
wait and never grants anything the provider does not confirm.

## Owner scripts (no HTTP)

| Script | Does |
| ------ | ---- |
| `npm run billing:shadow-report -w apps/api` | prints `{ travellers_blocked, attempts }` |
| `npm run billing:grandfather -w apps/api` | covers every live trip lacking a cover, clears the shadow table; idempotent (D14-06). Run it, set `BILLING_ENFORCED=true`, restart, run it again. |

## Configuration (all validated at startup in `env.schema.ts`)

`BILLING_ENFORCED` (default false), `FREE_TRIP_ALLOWANCE` (default 3), `TIER1_YEARLY_TRIPS` (default 10), `BILLING_PRODUCTS` (JSON map of store
product id → `{ kind: credit | tier1 | unlimited, step?: 1 | 2 | 3 }`), `REVENUECAT_API_KEY`,
`REVENUECAT_WEBHOOK_SECRET`.
