# Progress

The single place that says what is done. Tick a box **only** with a link to the merged PR or the evidence file.
Last updated: 2026-10-22 (UI features F1 to F9 built; evidence log added). Sessions end by updating this file (`P-HANDOFF`).

## Milestones

- [ ] M0 Repository governance and baseline
- [ ] M1 The look: all screens match the pictures (F1 and F2 approved; F3 awaiting approval)
- [ ] M2 The core is proven on devices (includes the offline gate T141)
- [ ] M3 Data rights and platform completeness
- [ ] M4 Monetisation (story 9)
- [ ] M5 Hardening and observability
- [ ] M6 Production backend
- [ ] M7 Mobile CI/CD
- [ ] M8 Store readiness
- [ ] M9 Beta
- [ ] M10 Release candidate and 1.0 launch
- [ ] M11 1.1 planner
- [ ] M12 1.2 social
- [ ] M13 Operate

## Steps

| Done | Step                                             | State / evidence                                                                                                                                             |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [ ]  | S-01 Repository governance and security baseline | not started                                                                                                                                                  |
| [ ]  | S-02 Sunrise Passport UI F3 to F14               | F1 and F2 approved and in `main`; F3 to F13 built and awaiting approval (stack `feat/ui-stack`); F12 and F13 built; F14 not started. Evidence: the log below |
| [ ]  | S-03 Device proof of the core                    | not started                                                                                                                                                  |
| [ ]  | S-04 Offline acceptance gate (HARD GATE)         | not started                                                                                                                                                  |
| [ ]  | S-05 Account deletion                            | not started                                                                                                                                                  |
| [ ]  | S-06 Data export                                 | not started                                                                                                                                                  |
| [ ]  | S-07 About, legal links, attributions            | not started                                                                                                                                                  |
| [ ]  | S-08 Geography in production                     | not started                                                                                                                                                  |
| [ ]  | S-09 Authentication audit and hardening          | not started                                                                                                                                                  |
| [ ]  | S-10 Allowance and entitlement backend           | not started                                                                                                                                                  |
| [ ]  | S-11 RevenueCat server integration               | not started                                                                                                                                                  |
| [ ]  | S-12 Paywall and subscription management         | not started                                                                                                                                                  |
| [ ]  | S-13 IAP products in the stores and RevenueCat   | not started                                                                                                                                                  |
| [ ]  | S-14 Planner backend (1.1)                       | not started                                                                                                                                                  |
| [ ]  | S-15 Planner screens (1.1)                       | not started                                                                                                                                                  |
| [ ]  | S-16 Planner cost controls (1.1)                 | not started                                                                                                                                                  |
| [ ]  | S-17 Photo screening provider (1.2)              | not started                                                                                                                                                  |
| [ ]  | S-18 Social backend (1.2)                        | not started                                                                                                                                                  |
| [ ]  | S-19 Social screens (1.2)                        | not started                                                                                                                                                  |
| [ ]  | S-20 UGC compliance (1.2)                        | not started                                                                                                                                                  |
| [ ]  | S-21 Performance and load                        | not started                                                                                                                                                  |
| [ ]  | S-22 Security hardening                          | not started                                                                                                                                                  |
| [ ]  | S-23 Accessibility pass                          | not started                                                                                                                                                  |
| [ ]  | S-24 Observability                               | not started                                                                                                                                                  |
| [ ]  | S-25 Production host, domain and TLS             | not started                                                                                                                                                  |
| [ ]  | S-26 Production configuration and backups        | not started                                                                                                                                                  |
| [ ]  | S-27 API deploy pipeline                         | not started                                                                                                                                                  |
| [ ]  | S-28 EAS setup and first builds                  | not started                                                                                                                                                  |
| [ ]  | S-29 Mobile PR checks                            | not started                                                                                                                                                  |
| [ ]  | S-30 Release automation                          | not started                                                                                                                                                  |
| [ ]  | S-31 Store accounts and app records              | not started                                                                                                                                                  |
| [ ]  | S-32 Legal documents, support, static site       | not started                                                                                                                                                  |
| [ ]  | S-33 Listing, assets, review notes, demo account | not started                                                                                                                                                  |
| [ ]  | S-34 Store-readiness compliance run              | not started                                                                                                                                                  |
| [ ]  | S-35 Internal testing                            | not started                                                                                                                                                  |
| [ ]  | S-36 Closed beta                                 | not started                                                                                                                                                  |
| [ ]  | S-37 Release candidate                           | not started                                                                                                                                                  |
| [ ]  | S-38 Submission and review                       | not started                                                                                                                                                  |
| [ ]  | S-39 Staged rollout and hotfix readiness         | not started                                                                                                                                                  |
| [ ]  | S-40 Operate                                     | not started                                                                                                                                                  |

## UI features (S-02 detail; each approved by the owner)

The owner asked (2026-10-22) to keep implementing without waiting at each feature; approvals are still recorded here.
"Built" means: implemented, all gates green on the branch, an as-built note with the device checks the owner must do.

- [x] F1 Map (approved 2026-10-19)
- [x] F2 Home sheet (approved 2026-10-20)
- [ ] F3 Tab bar (built 2026-10-20; awaiting approval)
- [ ] F4 Trips cards and list (built 2026-10-21; awaiting approval)
- [ ] F5 Trip screen (built 2026-10-21; awaiting approval)
- [ ] F6 Forms (built 2026-10-21; awaiting approval)
- [ ] F7 Photos and viewer (built 2026-10-21; awaiting approval)
- [ ] F8 Spending (built 2026-10-21; awaiting approval)
- [ ] F9 Notes (built 2026-10-21; awaiting approval)
- [ ] F10 Documents (built 2026-10-22; awaiting approval)
- [ ] F11 Offline maps (built 2026-10-22; awaiting approval)
- [ ] F12 Welcome, sign in, create account (built 2026-10-22; awaiting approval)
- [ ] F13 You (built 2026-10-22; awaiting approval)
- [ ] F14 Sweeps (T558 to T562 built 2026-10-22, T564 and T565 partly), device gates and release gates (the finer list is `specs/005-sunrise-passport-ui/reference/IMPLEMENTATION-PLAN.md`)

## Evidence log (small steps)

One line per finished small step: what, the branch and commit, and the proof. Newest at the bottom. A step without a
row here is not done. Test counts are the full Jest run of the workspace on that branch.

| Date       | Small step                                                    | Branch (commit)                       | Evidence                                                                                                                         |
| ---------- | ------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | F1 map: globe look (sky, halo, sea, land, graticule)          | `feat/f1-map-style` (`baae4c5`)       | 322 suites / 8,067 tests; `as-built/f1-map-style.md`                                                                             |
| 2026-10-19 | F1 map: photo roundels, clusters, callout                     | `feat/f1-map-pins` (`cf7587c`)        | 323 suites / 8,100 tests; `as-built/f1-map-pins.md`                                                                              |
| 2026-10-19 | F1 map: header, search coming-soon, recentre                  | `feat/f1-map-header` (`de6d4e2`)      | 8,073 tests; `as-built/f1-map-header.md`; owner approved F1 on a phone                                                           |
| 2026-10-20 | F2 sheet: shell, FAB, empty, loading                          | `feat/f2-sheet-shell` (`f5aa26c`)     | 327 suites / 8,169 tests; `as-built/f2-sheet-shell.md`                                                                           |
| 2026-10-20 | F2 sheet: peek and half content                               | `feat/f2-sheet-content` (`80ae24e`)   | 326 suites / 8,162 tests; `as-built/f2-sheet-content.md`                                                                         |
| 2026-10-20 | F2 sheet: Countries list                                      | `feat/f2-sheet-countries` (`fcf3fea`) | 327 suites / 8,161 tests; `as-built/f2-sheet-countries.md`; owner approved F2                                                    |
| 2026-10-20 | F3 tab bar: iOS pill                                          | `feat/f3-tabbar-ios` (`747cb50`)      | 329 suites; `as-built/f3-tabbar-ios.md`                                                                                          |
| 2026-10-20 | F3 tab bar: Android bar                                       | `feat/f3-tabbar-android` (`e3edae7`)  | merged gate 329 suites / 8,257 tests; `as-built/f3-tabbar-android.md`                                                            |
| 2026-10-21 | F4 trips: cards                                               | `feat/f4-trips-cards` (`ba48f44`)     | 330 suites / 8,280 tests; `as-built/f4-trips-cards.md`                                                                           |
| 2026-10-21 | F4 trips: screen, header, filter, states                      | `feat/f4-trips-screen` (`995b911`)    | 330 suites / 8,278 tests; merged gate 331 suites / 8,301; `as-built/f4-trips-screen.md`                                          |
| 2026-10-21 | F5 trip: header, hero, areas, day chips                       | `feat/f5-trip-top` (`9f90863`)        | 332 suites / 8,325 tests; `as-built/f5-trip-top.md`                                                                              |
| 2026-10-21 | F5 trip: stops timeline and states                            | `feat/f5-trip-stops` (`915918d`)      | 332 suites / 8,320 tests; merged gate 334 suites / 8,345; `as-built/f5-trip-stops.md`                                            |
| 2026-10-21 | F6 forms: sheet, New trip, Add expense                        | `feat/f6-forms-trip` (`ebb7ee3`)      | 337 suites / 8,407 tests; `as-built/f6-forms-trip.md`                                                                            |
| 2026-10-21 | F6 forms: stop editor, city picker, nights                    | `feat/f6-forms-stop` (`2f8c9e5`)      | 45 new tests; merged gate 339 suites / 8,471; `as-built/f6-forms-stop.md`                                                        |
| 2026-10-21 | F7 photos: shared area chrome and photos screen               | `feat/f7-photos-screen` (`71d48f1`)   | `as-built/f7-photos-screen.md`; specs T548, T549 ticked                                                                          |
| 2026-10-21 | F7 photos: viewer with swipe and zoom                         | `feat/f7-photos-viewer` (`2f37eaa`)   | 341 suites / 8,546 tests; merged gate 348 suites / 8,649; `as-built/f7-photos-viewer.md`                                         |
| 2026-10-21 | F8 spending                                                   | `feat/f8-spending` (`7b1e0c2`)        | 351 suites / 8,699 tests; `as-built/f8-spending.md`; spec T550 ticked                                                            |
| 2026-10-21 | F9 notes and editor                                           | `feat/f9-notes` (`95a3f90`)           | 352 suites / 8,717 tests; `as-built/f9-notes.md`; spec T551 ticked                                                               |
| 2026-10-22 | F10 documents: tickets, viewer, capture and confirm           | `feat/f10-documents` (`c52acbc`)      | 351 suites / 8,710 tests; `as-built/f10-documents.md`; spec T552 ticked                                                          |
| 2026-10-22 | F11 offline maps: storage card, rows, Downloaded list         | `feat/f11-offline-maps` (`99f3e3c`)   | 350 suites / 8,690 tests; `as-built/f11-offline-maps.md`                                                                         |
| 2026-10-22 | Merge F8 to F11 into the stack, repair the seams              | `feat/ui-stack` (`676f8be`)           | 360 suites / 8,868 tests, tsc, ESLint, Prettier, parity, theme green; icon cap lifted 70 to 80; no native sub-screen header left |
| 2026-10-22 | F12 Welcome, sign in, create account                          | `feat/f12-auth` (`41434ae`)           | 361 suites / 8,840 tests; `as-built/f12-auth.md`; spec T554, T555 ticked                                                         |
| 2026-10-22 | F13 You: passport, stamps, groups                             | `feat/f13-you` (`883f944`)            | 365 suites / 8,887 tests; `as-built/f13-you.md`; spec T556, T557 ticked                                                          |
| 2026-10-22 | Merge F12 and F13 into the stack                              | `feat/ui-stack` (`bbce1c9`)           | 376 suites / 9,066 tests, tsc, ESLint, Prettier, parity (100 ids, 80 labels), theme green; one timeout flake, passes alone       |
| 2026-10-22 | T558 delight: count-up policy, stamp queue, detent haptic     | `feat/f14-delight` (`1b6c662`)        | 379 suites / 9,115 tests; `as-built/f14-delight.md`                                                                              |
| 2026-10-22 | T559 state sweep: inventory, guards, denial screens           | `feat/f14-states` (7 commits)         | 390 suites / 9,221 tests; `as-built/f14-states.md`                                                                               |
| 2026-10-22 | T560 accessibility sweep: order, decorative art, reach-all    | `feat/f14-a11y` (`ab00958`)           | 392 suites / 9,199 tests; `as-built/f14-a11y.md`                                                                                 |
| 2026-10-22 | T561 text-scale sweep: reflow suites and fixed-height ratchet | `feat/f14-scale` (`bcff49b`)          | 379 suites / 9,211 tests; `as-built/f14-scale.md`                                                                                |
| 2026-10-22 | T562 theme, motion, transparency sweep                        | `feat/f14-themes` (`18dd1b4`)         | 385 suites / 9,291 tests; `as-built/f14-themes.md`                                                                               |
| 2026-10-22 | T564 retire Atlas (dead code removed, live readers kept)      | `feat/f14-atlas` (`0fe22f8`)          | 374 suites / 9,009 tests; `as-built/f14-atlas.md`                                                                                |
| 2026-10-22 | T565 docs: AGENTS.md, research status, amendments             | `feat/ui-stack` (`760c595`)           | Prettier clean                                                                                                                   |
| 2026-10-22 | Merge the six F14 branches into the stack                     | `feat/ui-stack` (`90c614c`)           | 419 suites / 9,734 tests, tsc, ESLint, Prettier, parity (101 ids, 79 labels), theme green after one allow-list entry             |

## Feature 001 open tasks (65 of 228 at 2026-10-21; the list moves to the steps above)

T088, T100, T101, T106, T120 (S-03); T140, T203, T141 (S-04); T142 to T158 (S-17 to S-19); T159 to T171 (S-14 to S-15);
T172 to T187 (S-10 to S-12); T188, T189 (S-05); T190 (S-06); T191 (S-26); T192 (S-16, S-21); T193 (S-07); T194 (S-03, S-21); T195 (S-37);
T196 (S-22); T197 (S-01, S-37); T198 (S-37).
