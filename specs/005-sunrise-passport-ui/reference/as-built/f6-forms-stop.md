# F6 Forms, objective 2: the stop editor (as built)

Branch `feat/f6-forms-stop` (from `feat/f6-forms`). Pictures: `screens/more/add-stop.png`, `add-stop-dark.png`,
`add-stop-kb.png`, `add-stop-kb-dark.png`, `add-stop-long.png`, `add-stop-scale1.5.png`. Prototype: `extra/screens.css`
(`.route`, `.dates`, `.stepper-row`, `.sbtn`, `.sg-row`), `extra/extra.css` (`.input`, `.clr`, `.lab`), `styles.css`.
Owner decision Q-11: pictured controls without a capability are drawn as pictured and are coming-soon controls; no
invented data.

## 1. Fidelity audit (before -> after)

| #   | Picture / prototype                                                                     | Before                                                         | Now                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | "Place" label over a cream field: flag chip, **Porto** bold + ", Portugal", sand clear  | Flat card, name over country, a secondary "Change" text button | `PlaceField`: `FlagChip` (lg), bold city + ", Country", 28 dp sand disc with a cross (44/48 dp target), id `stop-editor-change-city`, name "Change city" |
| 2   | Route preview: dots, solid line to the previous stop, dashed coral line to the new one  | none                                                           | `RoutePreview` (`stop-route*`): last two stops + the new one, solid `subtle` leg, dashed `accentLine` leg, ring for the new stop                         |
| 3   | "Stop 3 . 322 km from Sintra"                                                           | none                                                           | `planRoute`: position = stops + 1; distance = great-circle (`haversineKm`) between the real coordinates, in the device's unit (`formatDistance`)         |
| 4   | Arrive and Depart in ONE cream block, dashed joint, "Thu 15 Oct"                        | Two stacked `DateField`s, "12 May 2026"                        | `StopDatesBlock`: one block, two halves, short day; stacks with a hairline at font scale >= 1.15 (`add-stop-scale1.5.png`)                               |
| 5   | Nights stepper: 44 dp round buttons around a bold number, "Fits your trip, ends 19 Oct" | none                                                           | `NightsStepper`: derived from the dates; moves the departure only; 0..365; "Ends 19 Oct"                                                                 |
| 6   | "Getting there (optional)": Car / Train / Plane / Walk chips                            | none                                                           | `GettingThere`: four `Chip`s, coming-soon (toast only), none selected                                                                                    |
| 7   | "Note (optional)" text area                                                             | none                                                           | `StopNote`: text-area-shaped coming-soon button (96 dp min), "Add a note", toast only                                                                    |
| 8   | City picker rows: flag, city, "Region, Country"                                         | Plain rows (continent / accent-free spelling)                  | Flag chip on country and city rows; second line "Place, Country"; keyboard "search" key and the iOS clear button                                         |
| 9   | Sticky "Save stop" above the keyboard                                                   | Already so (FormSheet footer)                                  | Unchanged; keyboard-visibility tests now cover the chosen state with every field and the editing state                                                   |
| 10  | Dark, contrast, 1.5 / 2 scale, Android                                                  | tokens                                                         | Tokens only (`useColors`, semantic classes; a test rejects colour literals); scales: min heights scale, halves stack, stepper wraps; Android floors      |

Behaviour kept (parity guard green, `testid-baseline` check passes): `stop-editor`, `stop-editor-place`,
`stop-editor-change-city` ("Change city"), `stop-editor-arrive`, `stop-editor-depart` (named "Arrival" / "Departure",
valued with the full day, hint "Opens a calendar", Android system dialog via the shared `openDayDialog`, iOS inline
calendar `stop-editor-arrive-picker` / `-depart-picker`), `stop-editor-depart-error`, `stop-editor-cancel`,
`stop-editor-save`, `city-picker-*`. The `01-account-and-trip` and `03-globe` Maestro flows tap the same ids; the date
dialog taps (`Previous month`, `Next month`, `12 ._`, `10 ._`) resolve in the same system dialog.

## 2. Changes

- `features/trips/stop-dates.ts`: `nightsBetween`, `departureAfterNights` (date-fns, local calendar day, DST-proof),
  `formatStopDay` ("Thu 15 Oct"), `formatStopMonthDay` ("19 Oct").
- `features/trips/stop-route.ts` (new, pure): `routeCode`, `planRoute`.
- `components/trip/`: new `place-field`, `route-preview`, `stop-dates-block`, `nights-stepper`, `stop-coming-soon`,
  `stop-field-label`; `stop-editor` composes them; `date-field` exports `openDayDialog` (the one Android dialog, shared);
  `city-picker` adds flags, "Place, Country" and the search key; `use-stop-editing` passes the trip's stops (name,
  cached position) as `previousStops` (editor-related part only).
- `components/ui/chip.tsx`: optional `accessibilityHint` (additive, for the coming-soon chips).
- `components/ui/icon-registry.ts` (+ its test list): one new key, `footprints` (the Walk chip). Train uses `tram`.
- `test/fixtures/testid-unresolved-count.json`: 90 -> 92 test ids and 60 -> 65 labels the static extractor cannot read
  (`testID={testID}` / `accessibilityLabel={label}` pass-throughs inside the new Segment, RoundButton and chip code;
  every concrete id is written literally at its call site and the parity check lists none missing).

## 3. Deviations (and why)

1. **"Arrival" / "Departure" instead of "Arrive" / "Depart"** (the app's words win; the accessible names are pinned by
   the existing tests and the visible caption must match the name).
2. **"Ends 19 Oct" instead of "Fits your trip, ends 19 Oct"**: "Fits your trip" is a claim the app does not check.
3. **Straight-line distance, device unit.** "322 km" in the picture reads as a road figure; ours is the great-circle
   distance between the two cities' stored coordinates (km, or miles on a US/UK device), absent when the previous
   stop's city is not cached ("Stop 3 . after Sintra"). Never a drive time.
4. **Route codes are the first three letters of the city name** (LIS, SIN, POR): the data holds no airport or station
   code. The route shows only the last two stops and the new one; nothing is drawn for the first stop of a trip.
5. **No region and no "Recent" pill** in the city results (no region in the data; no recents store). No bold match
   highlight: `ListRow` takes a string title. No search glyph / clear cross inside the city fields (the `Field` adapter
   has no icon slots); the iOS system clear button (`clearButtonMode`) and the "search" return key stand in. The picker
   stays two-step (country, then city): the flows and the geography API depend on it.
6. **Getting there**: no chip is selected (the picture's checked "Car" would be a saved choice); the Note box shows
   "Add a note", not the picture's sample text. Both only when adding (the picture is the add sheet; editing is "Edit dates").
7. **Cancel in the header and a lone Save in the footer** (picture) is the form-sheet shell, owned by the parallel F6
   objective: the footer still holds Cancel and Save here.
8. **Boundary 1 dp** (the `Field` adapter's), the prototype draws 1.5; the right-edge fade of the chip row is not drawn
   (only `Scrim` draws gradients).
9. Existing assertions changed because a picture needs a different value: the chosen place reads "Firenze, Italy" in
   one text (was city and country in two); the "Change" text button (variant `secondary`) is the round clear button;
   a city's second line is "Forli, Italy" (was "Forli"). Reading-order test now lists place, dates, nights. Two other suites (`trip-form.test.tsx`, `trip-screen-timeline.test.tsx`) read the place with `/^Roma/` and `/^Firenze/` instead of the exact word.

## 4. Tests

`test/components/stop-editor-pictured.test.tsx` (new, 45 tests: place, route, dates block, Android/iOS pickers, stepper,
coming soon, keyboard, tokens-only), `features/trips/__tests__/stop-dates.test.ts` and `stop-route.test.ts` (new
helpers), plus the four updated tests above.

## 5. DEVICE checks for the owner

1. Compare `add-stop.png` / `-dark` / `-kb` / `-scale1.5` / `-long` with the sheet on a 390 x 844 device (place field,
   route preview, dates block, stepper, chips, Note, sticky Save) in light, dark and both contrast themes; Android too.
2. **The coming-soon toast inside the page sheet.** The toast host is in the root tree; an iOS page-sheet `Modal` is a
   separate window, so the "... is coming soon" toast may be hidden behind it. If so, the toast needs a host inside
   `FormModal` (the shell objective's file).
3. Flag glyphs (Portugal, Italy, United Kingdom, United States) clipped in the 28 x 20 chip on both platforms.
4. Android date dialog from the new halves: `Previous month`, `Next month`, day cells (`03-globe`, `01-account-and-trip`).
5. Large text (1.5 and 2): the halves stack, the stepper drops under its words, the chip row scrolls, Save stays above
   the keyboard.
6. The 44 dp target of the 28 dp clear disc (VoiceOver and TalkBack focus frames).
