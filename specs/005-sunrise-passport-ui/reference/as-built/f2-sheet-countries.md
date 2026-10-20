# F2 Home sheet: the Countries list (full position), as built

Branch `feat/f2-sheet-countries`. Pictures: `screens/core/home-full.png` (the authority for this feature),
`screens/more/countries.png`, `countries-long.png`, `countries-scale1.5.png`, dark variants. Prototype: `index.html`
frame `home-full`, `styles.css` (`.sheet-head`, `.sec-label`, `.list-row`, `.flag.lg`).

## Audit (picture and CSS against the code before this change)

| Item               | Picture / CSS                                                      | Before                                                  | Now                                                            |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------- |
| Heading            | `headline` "Countries", `label` `muted` "14 of 195 · 4 continents" | `title`, a collapse chevron button at the right         | `headline` + subtitle; padding 0 20 12                         |
| Right control      | 44 dp tonal round **search** button                                | collapse chevron                                        | search button (see below)                                      |
| Ring card, stamps  | none in `home-full`                                                | ring card ("4 of 7 continents · 19 trips") + 2 stamps   | removed (file deleted)                                         |
| Continent label    | `eyebrow` `muted` "EUROPE · 9", sticky, hairline under, inset 20   | "Europe" left, "9 countries" right, full-width hairline | one eyebrow "Europe · 9", hairline inset by the margin         |
| Row second line    | `label` `muted` "2 trips · last Oct 2026"                          | "First visited 2021" + "3 trips" at the right           | "N trips · last Mon YYYY" (`monthYear`, `Intl.DateTimeFormat`) |
| Row                | flag 28x20, name `callout`, chevron, min 60, no separator          | same minus the trips count at right                     | same; "Now" marker kept where the live trip is                 |
| Margins            | 20 dp; Android list 16 dp                                          | 20 dp                                                   | `ScreenMargin` (20, Android 16)                                |
| Text scale >= 1.15 | name and meta wrap, flags keep size                                | name wrapped only                                       | name and meta wrap (no line limit), flag fixed 28x20           |
| Bottom             | rows clear the tab pill                                            | `contentInsetBottom`                                    | unchanged                                                      |

Flag chip family (`components/ui/flag-chip.tsx`) already matched (28x20, radius 4, hairline, fixed size): unchanged.
`components/ui/list-row.tsx` does not exist; the row uses `Tappable` + `PressCue` as before.

## What changed

- `features/passport/country-copy.ts` (new, pure): `countriesSubtitle`, `continentLabel`, `countryMeta`, `countryLabel`.
- `features/passport/country-summary.ts`: `lastVisit` is now the last day that HAS happened (a stop under way counts up
  to today); a country with only future trips keeps its latest planned departure and the row says "planned Mar 2027".
  Before, it was the latest departure, which could be a trip still to come ("last Oct 2027" would claim a visit that has
  not happened).
- `components/home/country-row.tsx`, `countries-list.tsx` rewritten to the picture; `countries-summary-card.tsx` deleted.
- Accessible names: row "Portugal, 2 trips, last visited Oct 2026" (", now"; "planned Mar 2027" for planned-only);
  label "Europe, 9 countries" (unchanged).

## Search

A real filter already existed (`countries-search`), so the pictured round button is NOT a coming-soon control. It is
`countries-search-toggle` ("Search countries"; "Close search" while open): it reveals the existing field under the heading
(same id and accessible name "Search countries", now focused on reveal) and closing it clears the query. With no
countries there is nothing to filter, so the button and field are not shown.

## Deviations (and why)

- **Collapse control is invisible.** The picture has no collapse chevron (the handle lowers the sheet) but FR-081 keeps
  `countries-collapse` reachable under its name: it is a 1 dp, transparent, focusable button (screen reader / switch
  access), not drawn.
- **Search appears as a field only after the button is pressed** (previously always visible). Tests that typed straight
  into `countries-search` now press the button first.
- **Chevron** stays `PressCue` (`muted`, the gated row-cue pair, shared with Trips) rather than `subtle`.
- **"Now" marker** is not in `home-full` but is in `countries.png` and FR-016; kept, shown only for the live trip.
- The year-first-visited text of `countries.png` and the ring card are replaced by `home-full`'s content, per the owner's
  "exactly as in the pictures" for this feature. `recentVisits` is now unused in `src/` (kept, tested; for the You stamps).
- "14 of 195 · 4 continents": numerators are the existing statistics (`travelSummary`, distinct continents among listed
  countries); 195 is the fixed reference; the "of 7" is no longer shown (the picture says "4 continents").

## Device checks for the owner

1. Sheet at full: heading, subtitle and the round search button sit as in `home-full.png`; the sticky label "EUROPE · 9"
   stays under the sheet top while scrolling and its hairline is inset 20 dp.
2. Tap the search button: the field appears focused, the keyboard opens, the list filters; tap again: the field goes and
   everything is back.
3. Rows: flag 28x20, "2 trips · last Oct 2026", chevron; the last row scrolls clear above the tab pill.
4. A country with a trip still ahead says "planned <month>"; the live-trip country shows "Now".
5. Text size at 1.5x and 2x: names and second lines wrap, flags keep their size, nothing clips; dark and contrast look.
6. Android: 16 dp side margins; TalkBack finds "Collapse the countries list" in the heading and activates it.
7. Tap a country: the sheet lowers to half and the globe flies to it.
