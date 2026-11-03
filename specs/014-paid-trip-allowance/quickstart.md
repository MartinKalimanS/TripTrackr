# Quickstart: validating the paid trip allowance (spec 014)

Prerequisites: Docker running, `npm ci` at the repository root, `npm run build -w packages/contracts`.
Run the database projects one invocation at a time (AGENTS.md).

## 1. Unit and contract (server)

```bash
npm run test:unit -w apps/api
```

```bash
npx jest --selectProjects contract --maxWorkers=2 -- paid-allowance
```

Expect, per story of the spec: charging off never blocks and writes a shadow row; the free number is 3; a credit is
spent by its trip and a deleted covered trip returns nothing; Tier 1 allows exactly 10 and expires with the year;
Unlimited spends nothing; a refund of a spent credit leaves the trip ordinary; a replayed notification grants once;
two simultaneous creates at the last slot give one 201 and one 409.

## 2. Privacy (required CI job)

```bash
npx jest --selectProjects privacy --maxWorkers=2
```

Expect `entitlement-neutrality` to pass with the widened table list, and the new "reads identical" suite to show
the same list, one-trip read and export before and after a lapse, a refund and a cancellation.

## 3. Switching charging on (local rehearsal)

```bash
npm run billing:shadow-report -w apps/api
```

```bash
npm run billing:grandfather -w apps/api
```

Expect the report to count travellers who went past 3 while charging was off; after `billing:grandfather` every
pre-existing live trip has a `grandfathered` cover, the shadow table is empty, and with `BILLING_ENFORCED=true` a new 4th trip is refused.

## 4. Sandbox (owner, S-13)

With the RevenueCat sandbox project and a tunnel to the local API: buy a single trip, buy Tier 1, renew, refund the
consumable, cancel, and let a period expire. Record the real refund event type for a consumable in `research.md`
(D14-08) and how a subscriber moves to the next ladder product (D14-09).
