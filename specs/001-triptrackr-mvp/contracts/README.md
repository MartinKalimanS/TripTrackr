# Contracts — TripTrackr MVP

**Branch**: `001-triptrackr-mvp` | **Date**: 2026-08-26 | **Plan**: [../plan.md](../plan.md)

TripTrackr exposes three external interfaces. Each has its own contract document.

| Contract           | What it governs                                                              | Document                                         |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| REST API           | The HTTP surface the mobile client consumes, with a per-endpoint access rule | [rest-api.md](./rest-api.md)                     |
| Sync protocol      | The offline push/pull exchange — the gated milestone                         | [sync-protocol.md](./sync-protocol.md)           |
| Data-access policy | The RLS policies that are the authority on who may read what                 | [data-access-policy.md](./data-access-policy.md) |

The mobile UI is not treated as an external contract: it has one consumer, and its behaviour is
specified by the acceptance scenarios in [../spec.md](../spec.md).

## Conventions that apply to all three

**Base URL**: `https://api.triptrackr.app/v1`. Every endpoint except `/auth/register`, `/auth/login`,
and the two OAuth routes requires `Authorization: Bearer <access_token>`.

**Error shape**, uniformly:

```json
{
  "error": {
    "code": "TRIP_NOT_FOUND",
    "message": "Trip does not exist or you do not have access."
  }
}
```

This shape is materialised once, as the strict `ApiError` schema in
`packages/contracts/src/api/errors.ts` (`@triptrackr/contracts`, research D-13); the server's
exception filter and the client's API layer both import it rather than restating it. The sync
envelopes and per-table record schemas live in the same package (`packages/contracts/src/sync/`).

FR-072 requires messages to be human-readable without revealing internal detail. Two rules follow,
and they are contract obligations rather than style preferences:

1. **Not-found and not-permitted are the same response.** A request for a trip that exists but
   belongs to someone else returns exactly what a request for a non-existent trip returns. A
   distinguishable 403 confirms the resource exists, which is a disclosure.
2. **No internal identifiers, stack frames, SQL, or upstream provider messages** cross the boundary.
   They go to Sentry (FR-073).

**Access rule column**: every endpoint below states one of:

- `owner` — the authenticated traveller's own rows only.
- `owner-or-public` — the owner sees everything; anyone else sees only what RLS permits publicly.
- `public` — no ownership involved (reference lookups).
- `owner, structurally` — expenses and documents. No public variant exists, at any parameterisation.

**The access rule is documentation of what RLS already enforces, never a substitute for it.**
An endpoint marked `owner` that forgot its `WHERE` clause still returns nothing, because the database
refuses. That is the design (Constitution I).

**Idempotency**: every `POST` that creates a record accepts an `Idempotency-Key` header; the
purchase-completion path relies on it (FR-083 — no duplicate charge on retry). The sync push path is
the exception: its records carry a client-generated `id` that _is_ the idempotency key (research
D-15, [sync-protocol.md](./sync-protocol.md) §2), so it needs no header.

**Pagination**: cursor-based, never offset. Offsets skip or repeat rows when the underlying set
changes between pages, which for the sync feed means a lost or duplicated record.

## Contract test obligation

Each contract document lists the tests that prove it. Under Constitution III those tests are written
**before** the implementation they describe, and the adversarial subset in
[data-access-policy.md](./data-access-policy.md) runs as a required CI job on every release.
