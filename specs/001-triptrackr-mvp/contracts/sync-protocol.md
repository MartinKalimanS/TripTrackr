# Contract — Offline Sync Protocol

**Branch**: `001-triptrackr-mvp` | Conventions: [README.md](./README.md)

This is the gated milestone. Nothing in the social layer begins until the acceptance suite at the
foot of this document passes against real multi-device, connectivity-interrupted testing
(Constitution II; spec "Sequencing constraint"; User Story 6).

**Scope**: the seven offline-authored tables that data-model.md §10 mirrors on the device —
`trips`, `trip_stops`, `expense_categories`, `notes`, `expenses`, `photos` (metadata only), and
`documents` (metadata only). Trips are in scope because research D-08 requires a trip created in
aeroplane mode to be accepted locally and validated at push time; stops and custom categories are in
scope because a child row cannot sync ahead of the parent it references. Reference data
(`countries`, `cities`, `fx_rates`) is **cached, not synchronised**: it flows one way through the
lookups endpoints and is never pushed. Binary transfer is a separate channel, specified in §4
below, because FR-041 makes byte arrival — not metadata arrival — the definition of saved.

_Amended 2026-09-23 (research D-15, D-16): scope widened from four tables to seven, and row
identity changed from a `local_id`/`server_id` pair to a single client-generated UUID. The previous
shape could not express an expense that referenced a trip created offline, because the expense's
`trip_id` had no server value to be remapped to until the trip had been pushed and acknowledged._

**Row identity**: every synchronised row carries one `id`, a UUID **generated on the device that
created it**. The server adopts it as the primary key. There is no separate server identifier and
therefore no foreign-key remapping at push time: an expense created offline against a trip created
offline references that trip's `id` from the first write, on both sides, forever.

---

## 1. `GET /sync/pull`

```
GET /sync/pull?cursor=<opaque>&tables=trips,trip_stops,expense_categories,notes,expenses,photos,documents
```

```json
{
  "changes": {
    "trips": [],
    "trip_stops": [],
    "expense_categories": [],
    "notes": [
      { "id": "…", "trip_id": "…", "…": "…", "updated_at": "…", "deleted_at": null }
    ],
    "expenses": [],
    "photos": [],
    "documents": []
  },
  "next_cursor": "<opaque>",
  "has_more": false
}
```

**Contract obligations:**

- The cursor is an **opaque token wrapping `(updated_at, id)`**, not a bare timestamp. Two rows
  sharing a timestamp would otherwise be skipped or repeated at a page boundary, and a skipped row is
  a silently lost note (SC-011 requires zero losses).
- **Soft-deleted rows are returned here, and only here.** Every other read path filters
  `deleted_at IS NULL`. That filter belongs in a shared repository scope rather than being retyped
  per query — a forgotten one resurrects deleted content, which is the failure FR-039 names.
- **No cursor means a full snapshot.** The client shows an explicit "syncing your trips" state until
  it completes, never an empty screen (FR-042).
- `has_more` supports resumption. The spec's edge case is a sync batch too large to finish in one
  attempt; a client that stores `next_cursor` after each page resumes exactly where it stopped
  rather than restarting.
- Only rows belonging to the authenticated traveller's trips are ever returned. This is RLS, not a
  `WHERE` clause in this handler.
- `expense_categories` returns the traveller's own custom rows only. The six system rows are
  reference data and are fetched through `GET /expense-categories`, not through the sync feed.

---

## 2. `POST /sync/push`

```json
{
  "table": "notes",
  "records": [
    {
      "id": "6f1c2c4e-…",
      "trip_id": "0b7e…",
      "title": "…",
      "body": "…",
      "updated_at": "2026-08-26T10:12:03Z",
      "deleted": false
    }
  ]
}
```

```json
{
  "results": [
    { "id": "6f1c2c4e-…", "status": "applied" },
    { "id": "…", "status": "applied", "warnings": ["over_allowance"] },
    {
      "id": "…",
      "status": "conflict",
      "server_version": { "…": "…" }
    },
    { "id": "…", "status": "rejected", "reason": "parent_missing" }
  ]
}
```

**Contract obligations:**

- **Batched.** One request per table per sync cycle, not one per row. A day's captured content on a
  brief connection window must fit in a handful of round trips (SC-010).
- **Parents before children.** The client pushes tables in dependency order — `trips`, then
  `trip_stops` and `expense_categories`, then `notes`, `expenses`, `photos`, `documents` — so that
  every foreign key a record carries already exists server-side when it arrives. A record whose
  parent is absent (because the parent's push failed) is returned as `rejected` with
  `reason: "parent_missing"` and stays dirty for the next cycle; it is never silently dropped.
- **Conflict rule, in exactly one place**: compare the incoming `updated_at` against the stored row.
  Incoming newer, apply and return `applied`. Stored newer, reject that record and return `conflict`
  with `server_version`. This function is the _only_ implementation of the rule in the system
  (FR-040, research D-02).
- The client overwrites its local row with `server_version`, clears `is_dirty`, and **tells the
  traveller** when the overwritten content actually differed. FR-040 requires the superseded device
  to be informed; a silent overwrite of something they typed is exactly what the requirement
  forbids.
- `deleted: true` is an ordinary record in this exchange. Deletion is a change, not an absence
  (FR-039).
- **Idempotent by `id`.** A push whose response was lost mid-flight is retried by the client; the
  retry must not create a duplicate. Because the row's identity was fixed on the device, a retried
  insert is an upsert of the same key and the response is the same. This covers the spec's
  "connectivity returns for two seconds and drops again" case.
- **A trip pushed by an account over its allowance is applied, not rejected** (research D-08,
  Constitution V). The result carries `warnings: ["over_allowance"]` so the client can surface the
  commercial question afterwards; the recorded trip is never the casualty of it.
- **Identity cannot be hijacked.** An `id` that already exists under another traveller's trip is
  unreachable through RLS, so the upsert cannot match it as its own row and the database refuses the
  write — either as a primary-key violation or as a row-level-security violation, depending on the
  path PostgreSQL takes. The server maps both to `rejected` with `reason: "id_unavailable"` and the
  client regenerates the id locally. This is a theoretical collision path for honest clients and a
  refused path for dishonest ones; either way nothing about the other traveller's row is disclosed.
- Server clock decides, not device clock. A device with a wildly wrong clock cannot win every
  conflict by claiming to be from the future: incoming `updated_at` values beyond a tolerance ahead
  of server time are clamped to server receipt time, and the clamping is logged. This addresses the
  spec's "the device with the older clock syncs second" case, which a naïve timestamp comparison
  answers wrongly.

---

## 3. Client cycle

| Trigger                        | Action                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| Every 30s while foregrounded   | Push dirty rows, then pull                                            |
| Connectivity restored          | Push immediately, then pull                                           |
| App foregrounded               | Pull                                                                  |
| First launch after sign-in     | Full snapshot pull, with a visible syncing state (FR-042)             |
| Sign-out with unsynced changes | Push first; if it cannot complete, warn explicitly before signing out |

The last row is the spec's "signs out on a device that still holds unsynced changes" edge case.
Signing out silently discards local content — under Constitution V, that content is the traveller's,
so the sign-out must not proceed quietly.

---

## 4. Binary transfer — separate channel

Metadata syncs through §1 and §2. Bytes do not.

1. Capture writes the file to app-private device storage immediately and creates the record locally
   with `upload_state = 'pending'`.
2. An upload queue drains opportunistically — Wi-Fi preferred, exponential backoff on failure.
3. Only once the object store confirms does `upload_state` become `uploaded` and the record become
   clean.

**Contract obligations:**

- **A record whose bytes have not arrived is never presented as saved** (FR-041). The gallery shows a
  pending treatment, not a broken thumbnail, and not a normal-looking photo that is silently absent
  on the traveller's other device.
- Device storage exhausted mid-capture (spec edge case) fails the capture with a clear message and
  leaves no half-written record. A metadata row without bytes is precisely the half-truth FR-041
  exists to prevent.
- Deleting a record with a pending upload cancels the upload job and removes the staged file.

---

## 5. Retention

Tombstones are retained for a stated grace window — 90 days — before hard deletion, sized to protect
a device that has been offline for an extended trip. The window is stated plainly to travellers and
honoured; it is not a pretext for retaining data (Constitution V).

---

## 6. Acceptance suite — the gate

Automated (Maestro with network toggling), not a manual check (Constitution III). The social layer
is blocked until every row passes.

| #   | Scenario                                                                     | Expected                                                                    | Requirement    |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| 1   | Create and edit notes, expenses, photo captures, documents in aeroplane mode | All saved locally, immediately visible                                      | FR-036         |
| 2   | Force-quit and relaunch while offline                                        | Everything still present                                                    | FR-037         |
| 3   | Restore connectivity                                                         | Everything reaches the server with no user action                           | FR-038         |
| 4   | Delete a record offline, then sync                                           | Deletion propagates; the record does not reappear on a second device        | FR-039         |
| 5   | Edit one record on two devices before either syncs                           | One version wins deterministically; the loser is updated **and told**       | FR-040         |
| 6   | Capture a photo offline, then reconnect                                      | Not treated as saved until the file itself arrives                          | FR-041         |
| 7   | Sign in on a brand-new device                                                | A "syncing your trips" state, then the full history — never an empty screen | FR-042         |
| 8   | Go offline and open a previously synced trip                                 | Notes, expenses, and itinerary all readable                                 | FR-043         |
| 9   | Drop connectivity mid-sync, twice                                            | Resumes from the cursor; nothing lost or duplicated                         | SC-011         |
| 10  | Sync a batch too large for one attempt                                       | Resumes rather than restarting                                              | spec edge case |
| 11  | Sign out holding unsynced changes                                            | Pushes first, or warns explicitly                                           | spec edge case |
| 12  | Delete a record on one device while editing it on another                    | Deterministic outcome; no resurrection                                      | spec edge case |
| 13  | Create a trip, a stop, and an expense against it, all in aeroplane mode      | All three arrive in one reconnect; the expense references the right trip    | research D-08  |
| 14  | Delete a stop offline; sync; open the trip on a second device                | The stop is gone on the second device; the trip's arcs redraw               | FR-039         |
| 15  | Create a trip offline while at the free allowance; reconnect                 | The trip is kept and flagged; nothing recorded is lost                      | Constitution V |

**SC-009**: 100% of offline-created content survives restart and reaches the server.
**SC-010**: sync completes within 30s of reconnect for a typical day's capture.
**SC-011**: zero records lost, duplicated, or resurrected across the whole suite.
