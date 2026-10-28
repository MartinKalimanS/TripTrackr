# F5 Trip screen, the top (header, hero, bar, progress, areas, day chips): as built

Branch `feat/f5-trip-top` (from `feat/f5-trip`). Pictures: `screens/core/trip*.png`. CSS:
`prototype/styles.css` (`.td-hero`, `.td-nav`, `.td-title`, `.td-sheet`, `.td-scroll`,
`.td-collapsed`, `.status-row`, `.prog`, `.dots`, `.areas`, `.area`, `.priv-line`, `.days`, `.day`),
`build.py` (`trip_detail`). The stops timeline and the screen states belong to the other F5 objective
(`stop-*`, `spine`, `transit-row`, `now-chip`, `add-stop-row`, `trip-states`, `use-stop-editing`):
untouched.

## Audit (picture and CSS against the code before this change)

| Rule                                                                                     | Before                                                                  | Now                                                                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Transparent header, glass Back disc 44 dp, named "Back"                                  | right                                                                   | unchanged (`TripHeaderBack`, glass)                                                           |
| SHARE and MORE glass discs at the right (`trip.png`)                                     | MISSING                                                                 | `coming-soon-trip-share`, `coming-soon-trip-more` in `headerRight`, 8 dp apart, one toast     |
| Back, Share, More as bare ink glyphs on the solid bar (`trip-collapsed.png`)             | Back stayed a dark glass disc on the white bar                          | `TripHeaderProvider`: the three switch glass -> ghost once the bar is complete (progress = 1) |
| Hero min 236, padding-top 100, bottom-anchored title (2 lines, grows up), pad 36         | right                                                                   | unchanged (pinned by `trip-hero.test`)                                                        |
| Eyebrow: flag chip + "Portugal · dates" white; scrims top 120 and caption                | right                                                                   | unchanged                                                                                     |
| Parallax .5, stretch on pull, generated cover with the same scrim                        | right                                                                   | unchanged                                                                                     |
| Sheet overlap 28, radius 28, padding 16 20 0, gap 12                                     | right, not pinned                                                       | unchanged, now pinned in `trip-screen.test`                                                   |
| Progress row: status chip, "Day 3 of 8" + dots, sync chip right, min 36                  | dots 6 dp apart, no ring on the empty dots; a bare "EUR" after the chip | dots 4 dp apart, empty dots sand with the field ring (`.dots i`); the currency text removed   |
| Areas 4-column grid gap 8, two from scale 1.15                                           | right                                                                   | unchanged                                                                                     |
| Area icon 20 (`ic(icon, 20)`), count callout, label caption                              | icon 24                                                                 | icon 20 (`AreaPill`)                                                                          |
| Area lock badge 20 dp aqua top right, danger ring + 8 dp dot for a failed upload         | right                                                                   | unchanged                                                                                     |
| Aqua privacy line 13/18 semibold, 6 dp gap to a 16 dp lock                               | 14/20                                                                   | `caption` (13/18, 600)                                                                        |
| Day chip padding 6 x 10, min 56 x 56, gap 8, bleed -20, selected ink fill                | padding 4 x 12; 8 dp of extra air above and below                       | padding 6 x 10; the 4 dp ring air is bled with a -4 dp vertical margin (strip is 56 dp tall)  |
| Day chips pinned under the bar: bar, 12 dp, chips, 8 dp, hairline (`trip-collapsed.png`) | chips flush under the bar, no hairline                                  | `PIN_AIR_ABOVE` 12, `PIN_AIR_BELOW` 8, ground painted behind the air, hairline while held     |
| Scroll-to-day clears the pinned strip                                                    | bar + chips                                                             | `pinnedBottom` = bar + inset + 12 + chips + 8                                                 |
| Collapsed bar 56 + inset, paper, hairline, centred title                                 | symmetric 68 dp clearance                                               | start 68 (Back), end 120 (Share, More): the title centres between them as in the picture      |
| Light, dark, contrast, Android, scales 1.5 / 2                                           | tokens only                                                             | unchanged (no colour literal added)                                                           |

## Changes

- `components/trip/trip-header-controls.tsx` (new): `TripHeaderProvider`, `TripHeaderBack`,
  `TripHeaderTools`, `useReportCollapsed(progress)`. `trip/[id]/_layout.tsx` wraps the stack in the
  provider and adds `headerRight`. Without a provider (the screen alone in a test) the controls stay glass.
- `HeaderBackButton` (adapter): additive `ghost` variant.
- `hero-collapse.ts`: `PIN_AIR_ABOVE/BELOW`, `pinLineOf`, `pinnedBottom`, `isPinned`.
- `pinned-strip.tsx`: ground, hairline. `day-chips.tsx`, `progress-row.tsx` (no `currency` prop),
  `collapsed-bar.tsx`, `areas-strip.tsx`, `ui/area-pill.tsx`, `trip-detail.tsx` (composition seams unchanged:
  `SheetHead`, `DaysPin`, `StopsSection`).
- New ids (additive): `coming-soon-trip-share`, `coming-soon-trip-more`, `trip-header-tools`,
  `trip-days-pin-ground`, `trip-days-pin-hairline`.

## Existing assertions changed on purpose

- `progress-row.test` / `trip-screen.test`: "says the home currency" became "draws no bare currency code".
  The picture's row has none; FR-038 lists status, "Day N of M" and the sync chip; the Expenses tile
  already shows the amount with its currency.
- `trip-screen.test` scroll-to-day: 726 -> 706 and 616 -> 596 (the pinned strip is 20 dp taller: 12 above, 8 below).
- `area-pill.test`: icon 24 -> 20 (`.area` draws `ic(icon, 20)`).

## Deviations (and why)

- **Words of the app win**: the status chip says "Active" / "Planning" / "Past" and "Day 3 of 8" is a sibling
  (the picture merges them into one "Now" pill; flows assert `Active`); the tile says "Documents" (picture:
  "Docs"); the privacy line is "Expenses and documents are only visible to you." (picture: capital D, no
  full stop).
- **Eyebrow dates** stay "12 Oct – 19 Oct 2026" (locale-safe `Intl`, no `formatRange` on Hermes); the
  picture's compact "12–19 Oct 2026" would need a Hermes check of `formatRange`.
- **Offline maps row** is not in the pictures; it is the app's (FR-039) and stays under the privacy line,
  before the day chips.
- **Collapsed bar** is 56 dp + inset (UI-SPEC section 6 and the task); the prototype's CSS is 44 + 8 = 52.
- **Collapsed bar** has no separate Back/Share/More: they are the navigator's header controls, switched to
  ghost (one "Back", one of each, at every scroll position).
- **Lock glyph** is 16 dp (allowed sizes 16/20/24) where the CSS draws 14.
- **Hero picture position** is centred (the prototype uses 50% 40%).
- **Share** and **More** open nothing: one toast, "Share is coming soon" / "Trip actions is coming soon".
- The pictured "List / Map" toggle and per-day budget are not drawn (not in this objective; UI-SPEC section 10).

## Device checks for the owner

1. iPhone: transparent header over the picture: Back at the left, Share and More at the right, 20 dp from
   the edge and level with Back (iOS 26 may wrap native header items in its own glass; check there is no
   double disc).
2. Scroll until the bar is complete: the bar fades in, then the three discs become bare ink glyphs on the
   bar (no flash of a dark disc on white); scroll back: the discs return.
3. Tap Share, then More: ONE toast each, no second toast while it is up; nothing opens.
4. The day chips pin 12 dp under the bar with 8 dp and a hairline below; tap a day: the first stop lands
   just below the hairline, not under it.
5. Scale 1.5 and 2: areas in two columns, the privacy line wraps beside its lock, the title grows upward in
   the hero, nothing clips; chips stay 56 dp min.
6. Dark, increased contrast, Android: tokens only; on Android the standard 56 dp header holds the three controls.
7. Sync error: Photos tile ringed in danger with the dot, "Retry" in the sync chip and the banner.
