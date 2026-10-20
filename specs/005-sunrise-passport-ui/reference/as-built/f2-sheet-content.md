# F2 Home sheet, objective 2: the content at peek and half

Branch `feat/f2-sheet-content` (from `feat/f2-sheet`). Pictures read: `home`, `home-peek`, `home-peek-dark`, `home-scale2`,
`home-long`, `home-android` (and the prototype CSS `.stats`, `.stat`, `.now-card`, `.dots`, `.mini-row`, `.live-dot`,
`:root[data-bigtext]`, and `build.py` `stats_row`, `now_card`, `next_row`, which are what the pictures were drawn from).

## Audit list (picture / CSS against the build)

| Item                                                                                       | Before                                     | Now                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Figures: `numeral` 36/40 tabular, `/195` label strong `subtle`, caption `muted`, hairlines | already right                              | pinned by tests                                                                                                                     |
| Chevron after each label: 16 dp, `subtle` (`.stat .l .ic`)                                 | `muted`                                    | `subtle` (`StatTile`)                                                                                                               |
| Chevron after **Kilometres**                                                               | **missing** (plain text, FR-014)           | drawn; a coming-soon control (see deviations)                                                                                       |
| Large text: one column, label left / number right, hairline between, **no gap**            | 4 dp gap each side of the hairline         | no gap (`:root[data-bigtext] .stat`: padding 8 0 only)                                                                              |
| Now card corners                                                                           | 16 (`tile` default)                        | **24** (`radius="xl"`, `--r-xl`)                                                                                                    |
| Now card padding                                                                           | 12                                         | **8** (`p-2`)                                                                                                                       |
| Now card chevron                                                                           | the card's own cue, `muted`, gap 12        | own 20 dp `subtle` cue, 8 dp from the edge (2 at peek: `.sheet[data-d=peek] .now-card .chev`)                                       |
| Peek chevron                                                                               | right chevron                              | **up** chevron when the parent passes `onExpand` (see deviations)                                                                   |
| Title                                                                                      | 2 lines (1 at peek)                        | **1 line + ellipsis** at every detent; 2 lines from font scale 1.15 (`.clamp-1`, `data-bigtext`)                                    |
| Live line                                                                                  | 1 line                                     | 1 line; 2 from 1.15 (`.now-card .meta span`)                                                                                        |
| Live dot                                                                                   | 8 dp coral, no halo                        | 8 dp `accentLine` + **3 dp `accentTint` halo** (`.live-dot`), the halo takes no room, 10 dp to the text                             |
| Stop dots                                                                                  | 8 / 12 dp, four shapes                     | **6 dp**, 4 dp apart, three looks: done solid coral, now `surface` + 2 dp coral ring, ahead `sand` + 1 dp `border` ring; 4 dp above |
| Thumbnail at large text                                                                    | 64 (56 at peek)                            | **48** (`:root[data-bigtext] .now-card .th`), corner stays 16; `TripThumb` takes `corner`                                           |
| Row (`NextRow`): min 56, gap 12, thumb 48 / radius 12, chevron 20 `subtle`, flag gap 6     | no min height, chevron `muted`, flag gap 8 | `min-h-14`, `subtle` chevron, gap 6; title and line 1 line, 2 from 1.15 (were unlimited)                                            |
| "Up next" / "Happening now" label above the row                                            | none                                       | none: the pictures draw none (`UI-SPEC` section 4 says "Up next rows": the picture decides)                                         |
| Section labels (`.sec-label`)                                                              | n/a on these two detents                   | belong to the Countries list (full detent), not touched here                                                                        |
| Android                                                                                    | same                                       | the pictures differ only in chrome (FAB 56 rounded square, nav bar); the content is identical, no platform branch added             |
| Dark                                                                                       | tokens                                     | all colours are tokens (`accent-tint` is 16% coral in dark), so `home-peek-dark` follows                                            |

Not changed because already as pictured: count-up (once per appearance, staggered, final value announced), compact `1.26M`
from seven digits, miles on a device that measures in them, ids `globe-stats`, `globe-stat-countries` (the plain number),
`globe-stat-trips`, `globe-stat-distance`, `home-now-card`, `home-next-row`, `home-peek`, `home-half`.

## What changed

- `home/now-card.tsx`: radius, padding, own cue, lines, halo dot, `onExpand`, `thumbSize()`.
- `home/stop-dots.tsx`: 6 dp, three looks (`DOT` exported). The `next` stop is drawn like the later ones.
- `home/trip-thumb.tsx`: `corner` prop (default: 12 for 48, else 16).
- `home/next-row.tsx`: min height, `subtle` chevron, two lines at large text.
- `home/home-peek.tsx`: optional `onExpand`, passed to the card.
- `home/stats-row.tsx`: Kilometres tile is a coming-soon control; no gap when stacked.
- `ui/stat-tile.tsx`: chevron `subtle`; `accessibilityHint`.
- Tests: `home/__tests__/trip-cards`, `stats-row`, `ui/stat-tile` extended (sizes, tokens, dot looks, reflow, ids, cues).

## Deviations from the existing spec (each reversible)

1. **Kilometres is a coming-soon control** (Q-11, FR-080 as amended, against FR-014's "plain text"). The picture draws the same
   chevron after Kilometres; a chevron on plain text would promise an action. It is a button named "61,480 kilometres
   travelled", hint "Not available yet", id `coming-soon-distance` (inside `globe-stats-distance-tile`), whose only effect is the
   "Kilometres is coming soon" toast. The old assertion "the kilometres are not a control" was replaced. To revert: drop `onPress`.
2. **Peek chevron up** needs `onExpand`, which the sheet owner must pass: `<HomePeek ... onExpand={() => onDetentChange('half')} />`
   in `home-sheet.tsx` (not touched here). Until then the peek card opens the trip and shows the right chevron. When wired, a tap at
   peek raises the sheet (hint "Shows more") and the trip opens from half, as the picture implies.
3. **Four dot shapes became three** (FR-070 asked for "next" to be a fourth shape). The picture draws only done, now and the rest;
   the strip is still shape-coded (solid, ringed, sand) and is hidden from assistive technology anyway.
4. **Thumbnails at large text**: Now card 48, row 48 (the prototype CSS), not "56 and 48" as `UI-SPEC` section 4 says; the CSS decides.
5. Columns are equal thirds (`repeat(3, 1fr)`); the picture's separators sit about 10 dp left of that because it was rendered
   with content-sized columns. Not reproduced.

## DEVICE checks for the owner

- Half: figures row against `home.png` (a chevron after all three labels, 14 /195, hairlines at the column edges).
  Tap Kilometres: one toast "Kilometres is coming soon".
- Now card: 24 dp corners, 8 dp padding, halo around the coral dot, 6 dp dots (two coral, one ringed, five grey).
- Peek: 56 dp thumbnail, "Portugal Road..." on one line, the card clear of the mini FAB; the up chevron once `onExpand` is wired.
- Font scale 1.15 and 2 (iOS Larger Text, Android font size): figures in one column, card title and line on two lines, 48 dp thumbnails.
- Dark and Android: halo tint, ring colours, same layout.
