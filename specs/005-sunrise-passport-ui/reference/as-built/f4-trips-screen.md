# F4 Trips cards and list, the screen: as built

Branch `feat/f4-trips-screen` (from `feat/f4-trips`). Pictures: `screens/core/trips*.png`. CSS:
`prototype/styles.css` (`.list`, `.seg`, `.fab`, `.banner`, `.toast`, `.year-scrub`, `.sync-chip`,
`.trip-row`, `.sk`). Files: `app/(tabs)/trips/_layout.tsx` and `index.tsx`,
`components/trip/trips-list-parts.tsx`, `components/ui/plan-trip-fab.tsx`,
`components/ui/toast-zone.tsx` (new), `components/ui/screen-skeletons.tsx` (`TripListSkeleton`).
The card files (hero, ticket, row, stop strip, year header, scrubber, cover art) belong to the
other F4 objective and are untouched.

## Audit (picture and CSS against the code before this change)

| Rule                                                           | Before                                                         | Now                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Large title "Trips" 40/44 (iOS), standard 28/32 header (Andr.) | right (`useStackHeaderOptions`)                                | unchanged                                                                                        |
| Sync chip trailing                                             | right                                                          | unchanged, now first of two trailing controls                                                    |
| Pictured SEARCH button (cream disc, hairline) beside the chip  | MISSING                                                        | `ComingSoonButton` `coming-soon-trips-search`, `tonal`, after the chip, 8 dp apart               |
| Count line ("22 trips", "214 trips · since 2009") under title  | right (muted label, scrolls away with the list)                | unchanged; 12 dp to the filter                                                                   |
| Filter pill, counts over the whole list, not moving, tabular   | right                                                          | unchanged                                                                                        |
| Gap count / filter / banner / first card = 16                  | header gap 12: WRONG                                           | 16 (`.list` gap and the filter's 16 dp bottom padding)                                           |
| List padding 0 20 (16 Android)                                 | right                                                          | unchanged                                                                                        |
| Bottom = zone 88 + 16 + FAB + 16 = 172 (176 Android)           | button taken as `Button lg` x text scale: 176 / 176+, 96 at x2 | `fabHeightAt`: 52 iOS, 56 Android, label capped 1.3: 172 / 176, 69 dp at scale 2                 |
| FAB 52 pill / 56 rounded square, 16 above the zone             | right                                                          | unchanged                                                                                        |
| FAB hides with the keyboard                                    | MISSING                                                        | not drawn while `useKeyboardState().isVisible`                                                   |
| FAB lifts 68 dp above a toast (`.fab.is-raised`)               | MISSING                                                        | `lifted` prop, set from `useToastVisible()`                                                      |
| Toast: 16 from the sides, 8 above the zone                     | the root provider's default (a few dp from the bottom edge)    | `ToastZone` (nested kit provider with those insets) around the Trips stack                       |
| Year strip right 4, top 250                                    | right 4, vertically centred                                    | `top: 250`, anchor id `trips-year-strip`                                                         |
| Skeleton: hero, ticket 96, 90 dp year line, rows 72 / 64 thumb | rows 12 apart in a group, line 96, text 75/50 %, 16 dp line    | rows direct items 16 apart, `min-h-72`, line 90 at 40 dp below the ticket, 60 / 80 %, 14 dp line |
| Empty "No trips yet" + "Plan a trip"                           | right (secondary action, the FAB is the primary)               | unchanged (see deviations)                                                                       |
| Filtered-empty "No planned trips" + "Show all trips"           | right                                                          | unchanged                                                                                        |
| Offline and error banners under the filter                     | right (icon, words, underlined Retry)                          | unchanged                                                                                        |
| Dark, contrast, scales 1.5 and 2                               | tokens only                                                    | unchanged (no colour literal added)                                                              |

## Changes

- `ToastZone` / `toastZoneInsets` / `useToastVisible` (`components/ui/toast-zone.tsx`): the kit places
  a toast from the insets of ITS provider; the Trips stack layout wraps the navigator in one, so the
  header's Search (rendered by the navigator) and the screen share it. Root provider and `toast.tsx`
  are untouched; every other screen keeps the root's placement.
- `PlanTripFab`: `lifted`, `FAB_TOAST_LIFT` (68), `fabHeightAt(os, fontScale)`, keyboard hiding
  (also for Home's FAB and its collapsed form).
- `FabClearance` reads `fabHeightAt` instead of the generic button.
- `TripListSkeleton` geometry as above.
- New ids (additive): `coming-soon-trips-search`, `trips-header-tools`, `trips-year-strip`.

## Existing assertions changed on purpose

- `trips-screen.test`: "foot >= 88+16+56+16" became exactly 172 (iOS, FAB 52) and 176 (Android):
  UI-SPEC section 5 and the prototype's `--list-pb-fab`.
- `trips-screen.test`: the clearance "grows with the text size (96 dp at scale 2)" became "stops growing
  at the 1.3 cap" (`trips-scale2.png` draws the button at its normal size; the old rule left a 40 dp
  hole under the last card).
- `screen-skeletons.test`: year line `w-24` -> `w-[90px]`, row lines `w-3/4 h-5` / `w-1/2 h-4` ->
  `w-[60%] h-5` / `w-[80%] h-3.5` (`trips-loading.png`, `.sk.line`).

## Deviations (and why)

- **Counts on every segment.** The pictures show a count only on "Active 1"; FR-029 and the contract
  say counts over the whole list on all four, and an invented zero would be data, so all four keep
  theirs (while loading none are shown; the picture shows "Active 1" there).
- **FAB in every state**, loading included (the picture of the loading state has none): the flows tap
  `trips-plan-trip` from an empty list.
- **The empty state's "Plan a trip" stays secondary**: one primary per screen state (UI-SPEC 1) and the
  FAB is it; the contract (`components.md`) and the existing tests pin this.
- **"Planned", "Active", "Past", "Plan a trip"** are the app's words (UI-SPEC section 10); the sync
  words are the app's (`Your trips are safe on this phone`), not the picture's.
- **The error banner's glyph** is the `Banner` adapter's cloud-off, the picture draws a circle-alert.
  The adapter is shared (Home, Trip); not changed here.
- **Segmented track is 46 dp**: RN draws the 1 dp border inside the box (padding 4 + 1 + 36 + 1 + 4),
  the CSS draws it as an inset shadow (44). Shared adapter; not changed here.
- **Large title and trailing controls.** A native iOS large title cannot host controls on its own row:
  the chip and Search are `headerRight`, in the navigation bar's row (as the picture places them
  within a few dp). The count line is not in the native header; it scrolls away under the title.
- **Toast text** is "Search is coming soon" (Q-11), not the picture's "Trip deleted / Undo" (no delete
  flow exists). The toast has no action.

## Device checks for the owner

1. iPhone: "Trips" large title collapses on scroll; sync chip and Search sit at the trailing edge of
   the bar, 8 dp apart, vertically level with the title as in `trips.png`.
2. Tap Search: ONE toast "Search is coming soon" 16 dp from the sides, 8 dp above the tab pill (not
   behind it); the "Plan a trip" button rises above it and comes back after 5 s. Tap again while it
   is up: no second toast.
3. Android: standard header, 16 dp list margin, rounded-square button 56 dp, toast above the bar.
4. Scroll to the end: the last card stops 172 dp (176 Android) above the bottom edge, clear of the pill
   and the button; at text size 2 the button stays about 53 dp.
5. A 200+ account: the year strip sits at top 250 on the right edge (check it is not under the header
   on Android, where the scene starts below a 56 dp bar).
6. Loading, offline, failed-sync states in light, dark and a contrast theme; rows in the skeleton are
   72 dp apart in rhythm with the real rows.
7. Bring up a keyboard over the tab (not reachable from this screen today): the button disappears.
