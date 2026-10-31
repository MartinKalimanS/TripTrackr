# RevenueCat sandbox test plan (spec 014)

Scope: TEST ONLY. Test Store / sandbox purchases, `BILLING_ENFORCED=false`, no production change,
no real charge. Every RevenueCat field name below is **UNVERIFIED** until a real sandbox event is
captured and compared with `apps/api/test/fixtures/revenuecat/*.json`.

## Products (fictitious USD prices)

| Product id      | Kind         | Entitlement | Price |
| --------------- | ------------ | ----------- | ----- |
| `credit_single` | consumable   | none        | 3.99  |
| `tier1_y1`      | subscription | `tier1`     | 14.99 |
| `tier1_y2`      | subscription | `tier1`     | 12.99 |
| `tier1_y3_plus` | subscription | `tier1`     | 9.99  |
| `unl_y1`        | subscription | `unlimited` | 29.99 |
| `unl_y2`        | subscription | `unlimited` | 24.99 |
| `unl_y3_plus`   | subscription | `unlimited` | 19.99 |

The server maps `product_id` through `BILLING_PRODUCTS`; the entitlements are not read by the backend.

## Safety checklist before the first purchase

- [ ] RevenueCat project is on the **Test Store**; no App Store / Google Play connected.
- [ ] The app's `EXPO_PUBLIC_REVENUECAT_*_KEY` values start with `test_`.
- [ ] A SEPARATE webhook exists, **Sandbox only**, pointing at the test URL below. The existing
      `https://triptrackr.com/webhook` (Production + Sandbox) is left untouched.
- [ ] The test API runs against the dev database, not production. `BILLING_ENFORCED=false`.
- [ ] The same event is delivered to ONE backend only (no duplicate delivery).
- [ ] Authorization header configured in the sandbox webhook equals `REVENUECAT_WEBHOOK_SECRET`
      (raw or `Bearer <secret>`). Never paste the value into chat, logs or commits.
- [ ] The tester is signed in, so `Purchases.logIn(<our user id>)` ran; anonymous
      `$RCAnonymousID:` ids are ignored by the server by design.

## Test URL

`POST https://<quick-tunnel-host>/v1/billing/webhook` (cloudflared quick tunnel to the dev API).
The host changes on every tunnel start; update the sandbox webhook each time.

## Scenarios

Each row: do it in the app, then check the delivery in the RevenueCat dashboard (event type, fields)
and the result in the database / `GET /v1/me/entitlement`.

| #   | Scenario                   | Expected event(s)                              | Expected server result                                      |
| --- | -------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| 1   | Buy a single-trip credit   | `NON_RENEWING_PURCHASE`                        | `credits` +1; replay grants nothing                         |
| 2   | Buy `tier1_y1`             | `INITIAL_PURCHASE`                             | tier1 period open, `year_uses_left` 10                      |
| 3   | Buy `unl_y1`               | `INITIAL_PURCHASE`                             | unlimited period open                                       |
| 4   | Renewal into `_y2`         | `RENEWAL`                                      | new period, uses reset; price step per `next_product_id`    |
| 5   | Upgrade tier1 to unlimited | `PRODUCT_CHANGE`                               | UNVERIFIED: today only `ends_at`/cancel flag update; decide |
| 6   | Cancel auto-renew          | `CANCELLATION`                                 | `cancel_at_period_end` true; still active until the end     |
| 7   | Uncancel                   | `UNCANCELLATION`                               | flag cleared                                                |
| 8   | Expiration                 | `EXPIRATION`                                   | period ended; trips untouched                               |
| 9   | Refund of a subscription   | `CANCELLATION` (`CUSTOMER_SUPPORT`) / `REFUND` | period ended; trips untouched                               |
| 10  | Refund of an unused credit | `CANCELLATION`/`REFUND` on a credit            | credit removed                                              |
| 11  | Refund of a spent credit   | same                                           | trip stays, counts as a normal trip                         |
| 12  | Billing problem            | `BILLING_ISSUE`                                | acknowledged, no state change                               |
| 13  | Transfer between ids       | `TRANSFER`                                     | acknowledged, dropped (no `app_user_id`); UNVERIFIED shape  |
| 14  | Replay any delivery        | same event twice                               | second is a no-op (idempotent on transaction id)            |
| 15  | Anonymous id purchase      | any                                            | 200, ignored; app refuses to buy while anonymous            |
| 16  | Wrong / missing secret     | any                                            | 401, nothing written                                        |

Invariant for every row: a lapse or refund never hides, locks or deletes a trip (FR spec 014).

## Capturing the real payloads

1. Run scenarios 1, 2, 6, 8, 9 first and save each delivery body from the RevenueCat dashboard.
2. Strip user ids to `__USER__`, then diff against `apps/api/test/fixtures/revenuecat/`.
3. Fix `revenuecat-event.ts` / `billing-events.service.ts` for any differing field and mark the
   fixture VERIFIED in its header.
4. Only then implement `POST /billing/purchase-completed` against the real subscriber payload.
