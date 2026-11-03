# Offline acceptance gate — the Maestro suite (T140, T203; evidence T141)

> **Status: flows written, not yet run.** Nothing in this directory has been executed
> against a device. YAML syntax and every `runFlow` target were checked mechanically, and the
> element ids were cross-checked against `apps/mobile/src`, but no row of the gate has been
> observed passing, so none may be recorded as passing in `gate-evidence.md` until a real
> two-device run has done it.

The gate is the 15-row table in
[`specs/001-triptrackr-mvp/contracts/sync-protocol.md`](../../../../specs/001-triptrackr-mvp/contracts/sync-protocol.md)
§6 (rows 1–12 = T140, rows 13–15 = T203). User Story 7 (social) is blocked until every row
passes against real multi-device, connectivity-interrupted testing (T141).

## Why it is a set of phases and not one flow

Maestro drives **one device per invocation**, and the gate needs two: a second device is the
only way to observe arrival, deletion, a conflict, or a sign-in on a brand-new device. So
`../06-offline-acceptance.yaml` is a **dispatcher**: `-e PHASE=pNN` selects one slice (the part
one device runs between two operator steps) and runs its subflows from this directory.

```text
e2e/
  06-offline-acceptance.yaml        entrypoint, ordered phases p01..p22 (tags: manual, so
                                    `npm run e2e` / config.yaml never runs it unattended)
  offline/
    NN-<a|b>-<slug>.yaml            one subflow per row-part; a|b = the device that runs it
    _helpers/*.yaml                 shared steps (go-offline, relaunch, add-note, ...)
    gate-tools.mjs                  server-side steps no screen can do (seed, verify-flag)
    README.md                       this file
```

Calling the entrypoint with no `PHASE` fails at the first step, on purpose, pointing here: there
is no honest single-device run of this gate.

## Preparation

1. **Two Android devices or emulators**, A and B, with the same locale (English) and time zone,
   on network time. Drive them over **USB or the emulator console, never wireless adb**: the
   radio goes down with `setAirplaneMode`, and a wireless adb link goes with it.
2. **A dev-client build** with `EXPO_PUBLIC_API_URL` pointing at the API **over the network**:
   the host's LAN address, or `http://10.0.2.2:3000` on an emulator. **Do not use `localhost`
   with `adb reverse`** (the README of `apps/mobile` suggests it for convenience): that tunnel
   survives airplane mode, the API stays reachable, and every "offline" step of the gate would
   silently run online. The suite proves it is offline from inside the app (see
   `_helpers/assert-offline-probe.yaml`) and fails if it is not, but fix the URL rather than
   rely on the failure. `S3_PUBLIC_ENDPOINT` must be reachable by the devices too, or no photo
   or document can finish uploading.
3. **App id.** Every flow in `e2e/`, these included, targets `com.triptrackr.app`. A build made
   with `APP_VARIANT=development` installs as `com.triptrackr.app.dev` (`app.config.ts`); build
   without it for the gate, or the flows will not find the app.
4. **API and data.** API, worker, Postgres and the object store running (`npm run infra:up`);
   the geography catalogue imported with **Rome (IT) and Paris (FR)**; note the API's
   `FREE_TRIP_ALLOWANCE` (default 3) and run the API with `BILLING_ENFORCED=true`: row 15 needs both, and with charging off nothing is flagged (pass `-e ALLOWANCE=<n>` if the number differs).
5. **Tools**: `maestro` (free, CLI), `adb`, Node 22+. Nothing else is installed or paid for.
6. **Clean airplane state.** An interrupted run leaves a device offline. Before a run:
   turn airplane mode off in quick settings (`adb -s <id> shell cmd connectivity airplane-mode disable` on Android 11 and later).
7. **Optional but recommended for rows 7, 9 and 10 (emulators only):** throttle the device so
   the states those rows are about last long enough to see and to interrupt:
   `adb -s <id> emu network speed edge` and `adb -s <id> emu network delay gprs`; undo with
   `... speed full` and `... delay none`. These are emulator console commands; a physical device
   has no equivalent here, and relies on the seeded dataset (`gate-tools.mjs seed-bulk`).

## Running the gate

One `RUN_ID` is one run: it names the account `maestro-offline-<RUN_ID>@example.com` that A and B
share. Use a fresh value per run (that is also how the server account is "reset": see below).
Run the commands **in this order, each against the device it belongs to**. A phase consumes state
the next one needs (a note deleted, a trip created), so phases are not independently repeatable:
if one fails, fix the cause and start over from `p01` with a new `RUN_ID`.

```bash
export RUN_ID="$(date +%s)"
A=emulator-5554; B=emulator-5556                       # adb devices
OUT="$HOME/triptrackr-gate/$RUN_ID"; mkdir -p "$OUT"   # keep results outside the repository

run() {  # run <device-id> <A|B> <phase>
  maestro --device "$1" test \
    --format junit --output "$OUT/$3.xml" --test-output-dir "$OUT/$3" \
    -e RUN_ID="$RUN_ID" -e DEVICE_ROLE="$2" -e PHASE="$3" \
    apps/mobile/e2e/06-offline-acceptance.yaml \
  || { echo "FAILED at $3: see $OUT/$3"; return 1; }
}

run $A A p01                                              # register + baseline
node apps/mobile/e2e/offline/gate-tools.mjs seed-bulk     # 1,100 expenses: 3 pull pages (RUN_ID, API_URL)
run $B B p02                                              # rows 7, 8
run $A A p03                                              # rows 1, 2, 6a, 4a, 14a, 13a (A stays offline)
run $B B p04                                              # B before A reconnects
run $A A p05                                              # rows 3, 6b (A back online)
run $B B p06                                              # rows 3, 4b, 6b, 13b, 14b
run $B B p07; run $A A p08; run $B B p09; run $A A p10    # row 5
run $A A p11; run $B B p12; run $A A p13; run $B B p14; run $A A p15   # row 12
run $A A p16; run $B B p17                                # row 9
run $A A p18; run $B B p19                                # row 15
node apps/mobile/e2e/offline/gate-tools.mjs verify-flag   # row 15, "flagged" (manual half)
run $A A p20; run $B B p21                                # row 11
run $B B p22                                              # row 10
```

`API_URL` for `gate-tools.mjs` defaults to `http://localhost:3000` (it runs on the host, so
localhost is right here). `PASSWORD` is the throwaway test password the flows use; never point
this suite at production.

## Row → file → device

The authoritative table. A row passes only when **every** part below passed in one run.

| Row | Scenario (sync-protocol.md §6)                                               | Requirement    | Parts: phase · device · file                                                                                                                                             |
| --- | ---------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Create and edit notes, expenses, photo captures, documents in aeroplane mode | FR-036         | p03 · A · `01-a-create-edit-offline`; arrival on B: p06 · B · `03-b-arrival`                                                                                             |
| 2   | Force-quit and relaunch while offline                                        | FR-037         | p03 · A · `02-a-force-quit-relaunch`                                                                                                                                     |
| 3   | Restore connectivity                                                         | FR-038         | p04 · B · `03-b-before-reconnect`; p05 · A · `03-a-reconnect`; p06 · B · `03-b-arrival`                                                                                  |
| 4   | Delete a record offline, then sync                                           | FR-039         | p03 · A · `04-a-delete-offline`; p04 · B · `03-b-before-reconnect`; p06 · B · `04-b-deletion-propagated`                                                                 |
| 5   | Edit one record on two devices before either syncs                           | FR-040         | p07 · B · `05a-b-edit-offline`; p08 · A · `05b-a-edit-then-reconnect`; p09 · B · `05c-b-reconnect-told`; p10 · A · `05d-a-winner-not-told`                               |
| 6   | Capture a photo offline, then reconnect                                      | FR-041         | p03 · A · `06-a-photo-pending-offline`; p04 · B · `03-b-before-reconnect`; p05 · A · `06-a-photo-bytes-arrive`; p06 · B · `06-b-photo-arrived`                           |
| 7   | Sign in on a brand-new device                                                | FR-042         | p02 · B · `07-b-first-sync-new-device`                                                                                                                                   |
| 8   | Go offline and open a previously synced trip                                 | FR-043         | p02 · B · `08-b-offline-readable`                                                                                                                                        |
| 9   | Drop connectivity mid-sync, twice                                            | SC-011         | p16 · A · `09a-a-interrupted-push`; p17 · B · `09b-b-interrupted-arrival`                                                                                                |
| 10  | Sync a batch too large for one attempt                                       | spec edge case | seed-bulk (host); p22 · B · `10-b-large-snapshot-resume`                                                                                                                 |
| 11  | Sign out holding unsynced changes                                            | spec edge case | p20 · A · `11-a-sign-out-unsynced`; p21 · B · `11-b-signout-arrived`                                                                                                     |
| 12  | Delete a record on one device while editing it on another                    | spec edge case | p11 · A · `12a-a-delete-offline`; p12 · B · `12b-b-edit-offline`; p13 · A · `12c-a-reconnect`; p14 · B · `12d-b-reconnect-superseded`; p15 · A · `12e-a-no-resurrection` |
| 13  | Create a trip, a stop, and an expense against it, all in aeroplane mode      | research D-08  | p03 · A · `13-a-trip-stop-expense-offline`; p04 · B · `03-b-before-reconnect`; p05 · A · `03-a-reconnect`; p06 · B · `13-b-trip-arrived`                                 |
| 14  | Delete a stop offline; sync; open the trip on a second device                | FR-039         | p03 · A · `14-a-delete-stop-offline`; p04 · B · `03-b-before-reconnect`; p06 · B · `14-b-stop-gone`                                                                      |
| 15  | Create a trip offline while at the free allowance; reconnect                 | Constitution V | p18 · A · `15-a-over-allowance-offline`; p19 · B · `15-b-trip-kept`; **manual**: `gate-tools.mjs verify-flag`                                                            |

## Machine-readable table

Same content as above, for scripts. `phases` is the run order; a phase's `files` run in that
order inside one invocation. `manual` lists steps that are NOT Maestro assertions and must be done
by hand (or by `gate-tools.mjs`) and recorded.

```json
{
  "source": "specs/001-triptrackr-mvp/contracts/sync-protocol.md section 6 (scenario and expected text)",
  "entrypoint": "apps/mobile/e2e/06-offline-acceptance.yaml",
  "params": ["RUN_ID", "DEVICE_ROLE", "PHASE", "ALLOWANCE (optional, default 5)"],
  "phases": [
    { "phase": "p01", "device": "A", "files": ["offline/00-a-setup-account.yaml"] },
    {
      "phase": "host",
      "device": "host",
      "command": "node apps/mobile/e2e/offline/gate-tools.mjs seed-bulk"
    },
    {
      "phase": "p02",
      "device": "B",
      "files": [
        "offline/07-b-first-sync-new-device.yaml",
        "offline/08-b-offline-readable.yaml"
      ]
    },
    {
      "phase": "p03",
      "device": "A",
      "files": [
        "offline/01-a-create-edit-offline.yaml",
        "offline/02-a-force-quit-relaunch.yaml",
        "offline/06-a-photo-pending-offline.yaml",
        "offline/04-a-delete-offline.yaml",
        "offline/14-a-delete-stop-offline.yaml",
        "offline/13-a-trip-stop-expense-offline.yaml"
      ]
    },
    { "phase": "p04", "device": "B", "files": ["offline/03-b-before-reconnect.yaml"] },
    {
      "phase": "p05",
      "device": "A",
      "files": ["offline/03-a-reconnect.yaml", "offline/06-a-photo-bytes-arrive.yaml"]
    },
    {
      "phase": "p06",
      "device": "B",
      "files": [
        "offline/03-b-arrival.yaml",
        "offline/04-b-deletion-propagated.yaml",
        "offline/06-b-photo-arrived.yaml",
        "offline/13-b-trip-arrived.yaml",
        "offline/14-b-stop-gone.yaml"
      ]
    },
    { "phase": "p07", "device": "B", "files": ["offline/05a-b-edit-offline.yaml"] },
    {
      "phase": "p08",
      "device": "A",
      "files": ["offline/05b-a-edit-then-reconnect.yaml"]
    },
    { "phase": "p09", "device": "B", "files": ["offline/05c-b-reconnect-told.yaml"] },
    { "phase": "p10", "device": "A", "files": ["offline/05d-a-winner-not-told.yaml"] },
    { "phase": "p11", "device": "A", "files": ["offline/12a-a-delete-offline.yaml"] },
    { "phase": "p12", "device": "B", "files": ["offline/12b-b-edit-offline.yaml"] },
    { "phase": "p13", "device": "A", "files": ["offline/12c-a-reconnect.yaml"] },
    {
      "phase": "p14",
      "device": "B",
      "files": ["offline/12d-b-reconnect-superseded.yaml"]
    },
    { "phase": "p15", "device": "A", "files": ["offline/12e-a-no-resurrection.yaml"] },
    { "phase": "p16", "device": "A", "files": ["offline/09a-a-interrupted-push.yaml"] },
    {
      "phase": "p17",
      "device": "B",
      "files": ["offline/09b-b-interrupted-arrival.yaml"]
    },
    {
      "phase": "p18",
      "device": "A",
      "files": ["offline/15-a-over-allowance-offline.yaml"]
    },
    { "phase": "p19", "device": "B", "files": ["offline/15-b-trip-kept.yaml"] },
    {
      "phase": "host",
      "device": "host",
      "command": "node apps/mobile/e2e/offline/gate-tools.mjs verify-flag"
    },
    { "phase": "p20", "device": "A", "files": ["offline/11-a-sign-out-unsynced.yaml"] },
    { "phase": "p21", "device": "B", "files": ["offline/11-b-signout-arrived.yaml"] },
    {
      "phase": "p22",
      "device": "B",
      "files": ["offline/10-b-large-snapshot-resume.yaml"]
    }
  ],
  "rows": [
    {
      "row": 1,
      "task": "T140",
      "requirement": "FR-036",
      "parts": [
        {
          "phase": "p03",
          "device": "A",
          "file": "offline/01-a-create-edit-offline.yaml"
        },
        { "phase": "p06", "device": "B", "file": "offline/03-b-arrival.yaml" }
      ],
      "manual": [
        "camera-shutter capture, once, in aeroplane mode (the flow imports from the library)"
      ]
    },
    {
      "row": 2,
      "task": "T140",
      "requirement": "FR-037",
      "parts": [
        { "phase": "p03", "device": "A", "file": "offline/02-a-force-quit-relaunch.yaml" }
      ],
      "manual": []
    },
    {
      "row": 3,
      "task": "T140",
      "requirement": "FR-038",
      "parts": [
        { "phase": "p04", "device": "B", "file": "offline/03-b-before-reconnect.yaml" },
        { "phase": "p05", "device": "A", "file": "offline/03-a-reconnect.yaml" },
        { "phase": "p06", "device": "B", "file": "offline/03-b-arrival.yaml" }
      ],
      "manual": []
    },
    {
      "row": 4,
      "task": "T140",
      "requirement": "FR-039",
      "parts": [
        { "phase": "p03", "device": "A", "file": "offline/04-a-delete-offline.yaml" },
        { "phase": "p04", "device": "B", "file": "offline/03-b-before-reconnect.yaml" },
        { "phase": "p06", "device": "B", "file": "offline/04-b-deletion-propagated.yaml" }
      ],
      "manual": []
    },
    {
      "row": 5,
      "task": "T140",
      "requirement": "FR-040",
      "parts": [
        { "phase": "p07", "device": "B", "file": "offline/05a-b-edit-offline.yaml" },
        {
          "phase": "p08",
          "device": "A",
          "file": "offline/05b-a-edit-then-reconnect.yaml"
        },
        { "phase": "p09", "device": "B", "file": "offline/05c-b-reconnect-told.yaml" },
        { "phase": "p10", "device": "A", "file": "offline/05d-a-winner-not-told.yaml" }
      ],
      "manual": []
    },
    {
      "row": 6,
      "task": "T140",
      "requirement": "FR-041",
      "parts": [
        {
          "phase": "p03",
          "device": "A",
          "file": "offline/06-a-photo-pending-offline.yaml"
        },
        { "phase": "p04", "device": "B", "file": "offline/03-b-before-reconnect.yaml" },
        { "phase": "p05", "device": "A", "file": "offline/06-a-photo-bytes-arrive.yaml" },
        { "phase": "p06", "device": "B", "file": "offline/06-b-photo-arrived.yaml" }
      ],
      "manual": []
    },
    {
      "row": 7,
      "task": "T140",
      "requirement": "FR-042",
      "parts": [
        {
          "phase": "p02",
          "device": "B",
          "file": "offline/07-b-first-sync-new-device.yaml"
        }
      ],
      "manual": ["glance at screenshot 07-b-syncing-state"]
    },
    {
      "row": 8,
      "task": "T140",
      "requirement": "FR-043",
      "parts": [
        { "phase": "p02", "device": "B", "file": "offline/08-b-offline-readable.yaml" }
      ],
      "manual": []
    },
    {
      "row": 9,
      "task": "T140",
      "requirement": "SC-011",
      "parts": [
        { "phase": "p16", "device": "A", "file": "offline/09a-a-interrupted-push.yaml" },
        {
          "phase": "p17",
          "device": "B",
          "file": "offline/09b-b-interrupted-arrival.yaml"
        }
      ],
      "manual": []
    },
    {
      "row": 10,
      "task": "T140",
      "requirement": "spec edge case",
      "parts": [
        {
          "phase": "host",
          "device": "host",
          "file": "offline/gate-tools.mjs (seed-bulk)"
        },
        {
          "phase": "p22",
          "device": "B",
          "file": "offline/10-b-large-snapshot-resume.yaml"
        }
      ],
      "manual": []
    },
    {
      "row": 11,
      "task": "T140",
      "requirement": "spec edge case",
      "parts": [
        { "phase": "p20", "device": "A", "file": "offline/11-a-sign-out-unsynced.yaml" },
        { "phase": "p21", "device": "B", "file": "offline/11-b-signout-arrived.yaml" }
      ],
      "manual": []
    },
    {
      "row": 12,
      "task": "T140",
      "requirement": "spec edge case",
      "parts": [
        { "phase": "p11", "device": "A", "file": "offline/12a-a-delete-offline.yaml" },
        { "phase": "p12", "device": "B", "file": "offline/12b-b-edit-offline.yaml" },
        { "phase": "p13", "device": "A", "file": "offline/12c-a-reconnect.yaml" },
        {
          "phase": "p14",
          "device": "B",
          "file": "offline/12d-b-reconnect-superseded.yaml"
        },
        { "phase": "p15", "device": "A", "file": "offline/12e-a-no-resurrection.yaml" }
      ],
      "manual": []
    },
    {
      "row": 13,
      "task": "T203",
      "requirement": "research D-08",
      "parts": [
        {
          "phase": "p03",
          "device": "A",
          "file": "offline/13-a-trip-stop-expense-offline.yaml"
        },
        { "phase": "p04", "device": "B", "file": "offline/03-b-before-reconnect.yaml" },
        { "phase": "p05", "device": "A", "file": "offline/03-a-reconnect.yaml" },
        { "phase": "p06", "device": "B", "file": "offline/13-b-trip-arrived.yaml" }
      ],
      "manual": []
    },
    {
      "row": 14,
      "task": "T203",
      "requirement": "FR-039",
      "parts": [
        {
          "phase": "p03",
          "device": "A",
          "file": "offline/14-a-delete-stop-offline.yaml"
        },
        { "phase": "p04", "device": "B", "file": "offline/03-b-before-reconnect.yaml" },
        { "phase": "p06", "device": "B", "file": "offline/14-b-stop-gone.yaml" }
      ],
      "manual": [
        "review screenshots 14-a-globe-before/after-stop-delete and 14-b-globe-before-sync / after-sync by eye (the map is native)"
      ]
    },
    {
      "row": 15,
      "task": "T203",
      "requirement": "Constitution V",
      "parts": [
        {
          "phase": "p18",
          "device": "A",
          "file": "offline/15-a-over-allowance-offline.yaml"
        },
        { "phase": "p19", "device": "B", "file": "offline/15-b-trip-kept.yaml" }
      ],
      "manual": [
        "node apps/mobile/e2e/offline/gate-tools.mjs verify-flag  (the 'flagged' half: no screen shows it yet)"
      ]
    }
  ]
}
```

## What each row can and cannot show

A flow that asserts less than its row claims, without saying so, is a false green. These are the
places the suite is narrower than the table, and what covers the rest.

- **Offline is proven, not assumed.** `setAirplaneMode` is Android-only and cannot report whether
  it worked. `go-offline.yaml` therefore restarts the app and requires the country picker's
  designed alert "Offline — showing saved places", which appears only when the app's own request
  failed. That catches `adb reverse`, a wrong host, and iOS. It does not catch a device whose
  airplane mode is on but whose adb link rides Wi-Fi (use USB or an emulator).
- **Row 1.** The app has **no expense edit control** (create and delete only): the flow creates
  expenses and says so. "Photo capture" is the library import, which runs the same local-first
  pipeline as the camera; the live camera shutter opens the OS camera app and is not driven
  (same limit as `05-photos-and-documents.yaml`). **Manual, once:** take one photo with
  "Take a photo" in aeroplane mode and confirm it appears at once as "Waiting to upload".
- **Row 3.** The pending marker clearing is the client's receipt of `applied`; the independent
  proof that rows reached the server is device B receiving them. The SC-010 budget is the 30 s
  `extendedWaitUntil` in `03-a-reconnect.yaml`, measured from the radio coming back; on a
  physical device that includes the Wi-Fi rejoin. Record the observed time; do not just raise the
  timeout.
- **Row 5 / 12.** "Deterministic" is last-write-wins on device clocks plus the tombstone rule. A's
  edit is deliberately later than B's (row 5) and B's edit later than A's delete (row 12); two
  emulators on one host share a clock, physical devices must both be on network time. Row 5's
  "the winner is not told" cannot be a strong negative: the winner's row is clean, so a pull
  overwrites it silently by design; the check is that A shows the winning text and no notice.
  Row 12 is run in the order plain last-write-wins gets wrong; both orders are also pinned in
  `apps/api/test/contract/sync-conflict.spec.ts`.
- **Row 7.** The "syncing" state lasts as long as the snapshot. On a fast LAN with few rows it can
  be shorter than a poll, and the flow then fails at its first wait although the app is fine.
  That is why `seed-bulk` runs before p02 and why emulators can be throttled. The flow cannot
  show that no single frame was blank; the unit suite
  (`test/components/sync-runtime-first-sync.test.tsx`) and the gate's structure (five designed
  states) cover that.
- **Row 9.** Each airplane toggle is one adb command, a second or so apart: the flow cannot choose
  _where_ in a request the radio drops, and on a fast link a push is over in milliseconds. It
  performs the two drops and asserts the end state on both devices (every title, each once).
  Idempotent retry and cursor resume are pinned by the contract and unit suites; this is the
  on-device chaos check. Throttle the emulator to make drops land in flight.
- **Row 10.** The cursor is not on screen, so "resumes rather than restarts" is shown by the
  checksum (1,100.00 EUR of expenses must all arrive after a mid-snapshot interruption) plus the
  observed "You're offline" first-sync state. The flow **fails** if that interruption did not
  land (a pass therefore means an interruption happened); on failure with the gate already gone,
  throttle B and rerun. Page sizes: `PULL_PAGE_SIZE` = 500, `MAX_PUSH_BATCH` = 500,
  `MAX_PUSH_BYTES` = 800,000. Chunking of an over-large _push_ is covered by
  `test/sync/sync-core-push.test.ts`; reaching 800 kB through the UI is impractical.
- **Row 14.** The map is native and absent from the accessibility tree. "Arcs redraw" is asserted
  through the globe's country count (2 → 1), derived from the same local store; the screenshots
  are for review by eye.
- **Row 15.** "Kept" is asserted on both devices (the trip and its expense are there and the
  pending marker cleared; a rejected trip would stay dirty). **"Flagged" is not visible in the
  app**: the warning goes to an in-memory list nothing renders until User Story 9
  (T185 to T187). It is verified outside the flow, in two halves:
  - server: `node apps/mobile/e2e/offline/gate-tools.mjs verify-flag` replays the trip's push
    (an idempotent noop by id) and exits 0 only if the API answers `over_allowance`;
  - device: `test/sync/sync-core-push.test.ts` pins that the push records the warning without
    touching the trip.

  When US9 renders the flag, add the assertion to `15-a-over-allowance-offline.yaml`.

## Maestro command limits that matter here

Checked against docs.maestro.dev (reference/commands-available):

| Command                                                    | Android                                                | iOS                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------- |
| `setAirplaneMode` / `toggleAirplaneMode`                   | works (docs: "enables or disables airplane mode")      | **passes and does nothing** (simulators have none)  |
| `stopApp`                                                  | stops the app, data kept: the force-quit of row 2      | stops the app (same command)                        |
| `killApp`                                                  | system process death, backgrounded apps only: not used | n/a                                                 |
| `launchApp` (`clearState`, `stopApp: false`)               | works; `stopApp: false` foregrounds, no restart        | `clearKeychain` is iOS-only and harmless on Android |
| `runFlow` with `when`, `env`, `commands`                   | works; subflow paths are relative to their file        | same                                                |
| `--device` / `-e` / `--format junit` / `--test-output-dir` | works                                                  | same                                                |

Consequences: the suite is **Android only** and `_helpers/require-env.yaml` fails an iOS run
rather than letting it pass. The `when: platform` and `assertTrue` checks in that helper are the
guard. Every `${...}` expression avoids braces and backslashes (Maestro ends an expression at the
first `}`), and numeric fields (timeouts) are literals because they are parsed before any
interpolation.

## Resetting the server account

There is nothing to reset between runs: **a fresh `RUN_ID` is a fresh account** (and `p01` and
`p02` wipe the app data on A and B). The accounts and their rows accumulate in the dev database
(`maestro-offline-*@example.com`); no in-app or scripted account deletion is wired yet
(Profile → "Delete account" is disabled, T188). To clear a development stack, stop it and drop
its volumes (`npm run infra:down`, then `docker compose --env-file .env -f infra/docker-compose.yml
down -v`): that destroys **all** development data, the object store included. Never against a
shared, staging or production environment.

## Recording the result for T141

T141 asks for the passing result of all fifteen rows in
`specs/001-triptrackr-mvp/gate-evidence.md`. Keep `$OUT` (the JUnit XML and `--test-output-dir`
folders, which hold the screenshots) as the artefacts, and record:

```markdown
## Offline acceptance gate — run <RUN_ID>, <date>

- Commit: <sha> Build: <dev-client build id> API: <sha>, FREE_TRIP_ALLOWANCE=<n>
- Device A: <model, Android version, emulator|physical> Device B: <same>
- Throttling used: <none | emu network speed edge, for p02/p16/p22>
- Artefacts: <where $OUT was kept>

| Row | Verdict | Phases run (result files)               | Notes / manual steps done        |
| --- | ------- | --------------------------------------- | -------------------------------- |
| 1   | pass    | p03, p06                                | camera shutter manual: <ok/none> |
| ... | ...     | ...                                     | ...                              |
| 15  | pass    | p18, p19; `verify-flag` output: <paste> |                                  |

- SC-009 (offline content survives restart and reaches the server): p03/02 and p06.
- SC-010 (within 30 s of reconnect): observed <seconds> in p05, p08, p13.
- SC-011 (zero lost, duplicated, resurrected): p14, p15, p17, p22.
- Unrun or failed rows: <none | list, with the reason>
```

Rules: a row is `pass` only if every part in the table above passed in **one** run; a missed
observation (rows 7, 9, 10) is reported as such, not as a pass; and nothing is claimed for a row
whose manual step was not done. T141 is complete only when all fifteen rows pass and SC-009,
SC-010 and SC-011 hold.

## Selectors most likely to need adjusting on a new image

Written against the screens as they stand; none of it has run. The first things to check when a
phase fails early: the Android system photo picker steps (`_helpers/pick-library-media.yaml`:
`Photo taken on.*`, `Add`), the destructive button of `Alert.alert`
(`_helpers/confirm-alert.yaml`: `android:id/button1`), and the city option text (`Rom(a|e)`,
`Paris`) against the imported catalogue.
Since spec 006 a photo pick is also preceded by the photo-library permission dialog
(`_helpers/allow-photo-access.yaml`: `Allow`, `Allow all`, `Allow Full Access`; normally absent,
because `launchApp` allows every permission) and followed by the visibility sheet
(`_helpers/choose-photo-visibility.yaml`: `photo-visibility-*`; `VISIBILITY` is `private`, `public`
or `dismiss`). A document pick has neither.
