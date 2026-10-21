# F4 Trips cards: as built (objective 1 of 2, the CARDS)

Branch `feat/f4-trips-cards` (from `feat/f4-trips`). Pictures: `screens/core/trips.png`, `trips-dark`,
`trips-contrast`, `trips-android`, `trips-200`, `trips-nocover`, `trips-long`, `trips-scale1.5`, `trips-scale2`,
`trips-toast`. CSS: `prototype/styles.css` (`.hero-card`, `.strip`, `.ticket`, `.trip-row`, `.year-head`,
`.year-scrub`, `.cover-gen`, `.pill`, `.cap-ramp`, `.cap-solid`), `prototype/build.py` (`hero_card`, `ticket`,
`trip_row`, `year_head`, `trips`: the pictures were rendered from this, not from the older
`src/frames/trips.html`). Files: `components/trip/{trip-hero-card,ticket-card,trip-row,stop-strip,year-header,
year-scrubber,trip-cover-art}.tsx`, new `photo-status-pill.tsx`, `components/ui/generated-cover.tsx`,
`components/ui/scrim.tsx`, `theme/scrim.ts` (`CoverGlow`) and their tests. Not touched: the screen, the list,
the FAB, the skeleton and state components (the other objective).

## Audit (picture and CSS against the code before this change)

| Part               | Rule (picture / CSS)                                                                                    | Before                                      | Now                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| Hero               | Frame min 219, radius 24, `lift1`, clipped, sand ground                                                 | right                                       | unchanged, pinned                                        |
| Hero               | Top of the photograph untouched; only `cap-ramp` (48) + `cap-solid` darken                              | `Scrim bottom` over the whole photo as well | caption scrim only (measured: about .2 a third down)     |
| Hero               | Status = WHITE pill, navy ink, shadow 0 1 2, coral live dot (#E04A33 + 22%)                             | cream + hairline `StatusChip`, theme coral  | `PhotoStatusPill`: white in all 4 themes, light coral    |
| Hero               | Photo at `background-position: 50% 58%`                                                                 | centred                                     | `contentPosition` 50% / 58%                              |
| Hero               | Dates line gap 6; strip 8 dp under it                                                                   | gap 8; strip right under (4)                | gap 6; strip margin so the dot lands where pictured      |
| Hero               | Sync marker: 24 dp glyph disc, top right                                                                | badge "Not yet synced" with icon            | UNCHANGED (words win; see Deviations)                    |
| Hero               | Eyebrow 12/16 700 caps +.06em, flag, title 28/32 (2 lines), meta 14/20                                  | right                                       | unchanged                                                |
| Stop strip         | Labels 600 12/14 tracked .06em, 2 dp under the 12 dp dot, capped 1.3                                    | eyebrow 700 12/16, 2 dp too low             | caption role at 12/14 + tracking, pulled up 2 dp         |
| Stop strip         | Dots 12, done filled + 2 halo, now 3 ring + 4 halo, next 2 ring, dashed join                            | right                                       | unchanged                                                |
| Ticket             | Min 96, radius 24, 88 thumb, hairline + `lift1`, notches 16, 2 dp dashed edge                           | right                                       | unchanged, pinned                                        |
| Ticket             | Stub figure `t-title tnum` 28/32, unit `t-caption` muted                                                | `numeral` 36/40                             | `title` 28/32, tabular figures                           |
| Ticket             | Title `margin-top: 2`; flag line gap 6                                                                  | none; gap 8                                 | 2; 6                                                     |
| Ticket (big text)  | Stub row `align-items: center`                                                                          | baseline                                    | centre                                                   |
| Row                | Min 72, thumb 64 / 56, radius 16, gap 16, **no edge on the thumbnail**                                  | 1 dp hairline round the thumbnail           | no edge                                                  |
| Row                | Chevron 20 dp in `ink-3` (`subtle`)                                                                     | `muted` (`PressCue`)                        | `subtle`                                                 |
| Row                | Flag line gap 6                                                                                         | 8                                           | 6                                                        |
| Year header        | `padding 12 0 4`, no line; count `caption` ink-2; km `caption` ink-3                                    | 12 / 8, hairline under, km muted            | 12 / 4, no line, km `subtle`                             |
| Year scrubber      | right 4, top 250, 28 min, cream + hairline, years 12/16 700 untracked                                   | placement left to the screen; years tracked | `YEAR_SCRUBBER_PLACEMENT` exported; untracked years      |
| Generated cover    | Amber corner: radial 85% x 95% at the top right, .62 amber, gone at 62%                                 | the passport glow: .2, 70% x 90%            | `CoverGlow` (.62, 85/95/62), measured on `trips-nocover` |
| Generated cover    | Stamp: dashed ring, thin ring and the CODE (28, display) between them                                   | rings only                                  | code drawn in the stamp                                  |
| Generated cover    | 3 palettes at 135 deg, code 120 at 16% bottom right, thumb code 40 at 90+%                              | right                                       | unchanged                                                |
| Dark / contrast    | Hero pill white; ticket stub edge `sand`; lift is a ring in dark                                        | pill took the theme                         | pill white in all four themes; the rest unchanged        |
| Text scale >= 1.15 | Ticket column (thumb 88 high, stub row under a dashed top edge, no notches); meta 2 lines; row thumb 56 | right                                       | unchanged, now pinned at 1.15, 1.5 and 2                 |
| Android            | List margin 16                                                                                          | the screen's                                | not mine (cards fill the width they are given)           |

## Deviations (and why)

- **The hero keeps the words "Not yet synced"** where the picture draws a 24 dp cloud glyph on a dark disc. US2
  scenario 6 asks for a marker with text, and the Maestro offline flows wait on those words (the app's words win,
  Q-11). `SyncBadge` already has a `glyphOnly` form (the pictured disc) if the owner prefers the picture: it is a
  one-line change in `trip-hero-card.tsx` plus its test.
- **"Active", "Planning", "Past", "Plan a trip"** are the app's words; the pictures say "Now", "Planned".
- **`scrim.bottom` is dropped from the hero** although `contracts/components.md` lists it (the contract is below
  the pictures in the order of authority). Text on the caption block is still on >= .66 (gate P8).
- **Hero date line** is the app's "12 Oct – 19 Oct 2026 · 7 nights" (the picture: "12–19 Oct · 7 nights").
- **Stop-strip joins are the opaque on-photo ink**, not 85% white (D5-10: no alpha white on a photograph).
- **Status pill ink** is `accentInk` (navy in all themes; `#0A1626` in the dark ones, not exactly `#0E2A47`).
- Existing assertions changed on purpose: hero "bottom scrim present" (now absent), row thumbnail "has a border"
  (now none), year header "has a bottom border" (now none) and "counts are muted" (km is `subtle`), generated cover
  stamp "no text of its own" (now carries the code).
- `theme/scrim.ts` gained `CoverGlow` (a new export; `Passport.glow` for the You screen is unchanged).

## For the other objective (the screen), to match the pictures

1. **Ground of the list in dark.** In `trips-dark.png` the list ground is `surface` (#0F2037), not `canvas`
   (#0A1626): the year headers and the ticket notches are drawn in that ground. The cards use `bg-background`
   (canvas) for both, as the screens paint canvas today. If the screen moves to `surface`, change those two classes
   in `year-header.tsx` and `ticket-card.tsx` (`Notch`).
2. **Spacing.** The year header is 12 above and 4 below its text; the prototype puts 8 dp between the header and the
   first row (`.year-head + .rows { margin-top: -8px }` inside a 16 gap), rows 12 apart, cards 16 apart.
3. **Year scrubber.** Pass `YEAR_SCRUBBER_PLACEMENT` (`right: 4`, `top: 250`) as `style`; the list's right padding is
   44 with the strip (`trips-200`).

## Device checks for the owner (iPhone and Android)

1. Hero over a bright photograph and a dark one: the white pill, the live dot, the dashed strip and the caption are
   all legible; the top of the photograph is NOT darkened.
2. Hero with a generated cover (a trip without photos): the amber corner, the stamp with its code, the big ghost
   code bottom right; three different trips show the three palettes.
3. A pending trip: the "Not yet synced" badge on the hero, the ticket and the rows.
4. Ticket: the two notches sit on the card edge over the dashed line; at the largest text size it becomes a column.
5. Dark theme and increased contrast: the white pill, the stub edge, the ring round the hero.
6. Text size 1.5 and 2: titles wrap, nothing clips, the strip labels stay on one line.
