# F13 You (identity, passport, stamps, groups): as built

Branch `feat/f13-you` (from `feat/ui-stack`). Tasks T556 and T557, the stamp parts of T558. Pictures: `screens/core/profile.png`,
`profile-dark.png` (there are no contrast, Android or scale pictures of this screen). CSS: `prototype/styles.css` (`.p-head`,
`.passport`, `.recap`, `.visa`, `.stamps`, `.stamp-cell`, `.seg`), `src/frames/profile.html`, `build.py` `profile()`, `app.js`
`PERIODS`. Research D5-08, D5-17; data model sections 4 and 5; Q-2 (fixed 195 and 7); owner decision Q-11 (pictured controls
without a capability are drawn and are `ComingSoonButton`s). Visibility posture of everything here: private, local, never
transmitted, nothing new stored (FR-084).

## Files

New: `features/passport/stamp-spec.ts` (`deriveStamp`, `passportStamps`, `earnedRecently`), `passport-totals.ts` (periods,
`passportTotals`, laps), `passport-copy.ts` (words, `mrzLine`), `use-passport.ts`; `components/profile/` `profile-identity`,
`period-switch`, `passport-card`, `recap-entry`, `stamps-page`, `raster-stamp` + `raster-queue`, `stamp-landing`,
`passport-section`, `passport-skeleton`, `profile-groups`. Rewritten: `app/(tabs)/profile/index.tsx`, `_layout.tsx`.
Additive in shared adapters (no existing behaviour changed): `Scrim` kinds `passport` and `recap`, `Icon` tone `amber`.
`Stamp`, `StampIn`, `GhostStamp`, `stampSpec` are untouched. Tests: `features/passport/__tests__/` (stamp-spec, passport-totals,
passport-copy, use-passport), `components/profile/__tests__/` (card, identity, switch, recap, stamps page), `test/app/profile-screen`;
updated: `tab-screens`, `sync-runtime-profile`, `profile-gates-real-render`, `nested-stack-layouts`, `scrim`, `icon`.
Maestro: `e2e/offline/11-a-sign-out-unsynced.yaml` now scrolls (see below).

## Fidelity audit (pictures and prototype CSS against the code before this change)

| Rule (picture / prototype)                                                                                         | Before                                               | Now                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS: the large "You" title is replaced by the identity block; Android keeps a standard "You" header                | large title on both                                  | iOS `headerShown: false` (title kept in the options), screen pads the top; Android header, `underHeader`                                                                                                                     |
| Identity: 64 dp initials avatar, name `title`, "Traveller since 2021" `label` muted, two 44 dp tonal round buttons | raised card, name `headline`, email line, no buttons | `ProfileIdentity`; the share and settings buttons are `ComingSoonButton`s (`coming-soon-share-passport`, `coming-soon-profile-settings`), 10 dp apart                                                                        |
| "Traveller since" from the account's creation date                                                                 | none                                                 | `travellerSince(created_at)`: the year, omitted when the date cannot be read                                                                                                                                                 |
| Profile photograph, edit profile                                                                                   | none                                                 | not drawn: there is no picker (UI-SPEC section 10); the picture's photograph is the initials avatar                                                                                                                          |
| Period switch: 36 dp `SegmentedPill`, All time and each year with a trip, newest first                             | none                                                 | `PeriodSwitch` (`passport-period`, radio group "Period", ids `passport-period-<key>`); more than four segments scroll sideways at 88 dp each                                                                                 |
| Passport card: navy 135 degree gradient, amber corner, padding 20, gap 16, radius 24, `lift1`, watermark of rings  | none                                                 | `PassportCard` (`passport-card`) on `Scrim kind="passport"` (the data of C5-10), nine rings and a cross at 11 percent white                                                                                                  |
| Card heading "PASSPORT . ALL TIME" `eyebrow` after a mark; year variants                                           | none                                                 | globe glyph + `passportHeading`; the card is a labelled `summary` ("Passport, all time")                                                                                                                                     |
| Figures: countries "14 /195", trips, distance "61,480 km", continents "4 /7", numeral + small part on a baseline   | none                                                 | `AnimatedNumber` (numeral, capped 1.3, shrinks instead of clipping, compact from seven digits); each figure announced once ("14 of 195 countries"); `passport-countries` `-trips` `-distance` `-continents`                  |
| Grid 2 by 2, column gap 20, row gap 16; one column from the reflow scale (1.15)                                    | none                                                 | `passport-grid` rows are `row` below 1.15 and `column` from it (`isLargeText`)                                                                                                                                               |
| "1.5x around the Earth" from the real distance                                                                     | none                                                 | `lapText(distance / 40,030 km)` (the sphere the distance is measured on); left out for no distance; "Under 0.1x" below 0.05                                                                                                  |
| Machine-readable strip `P<TRIPTRACKR<<MARTA<<<...`                                                                 | none                                                 | `mrzLine(display name)`, 44 characters, one line, hidden from assistive technology                                                                                                                                           |
| Secondary white on the card (78 percent; fully opaque in contrast)                                                 | none                                                 | the data's `Passport.secondaryAlpha` as a solid colour, not an opacity on text                                                                                                                                               |
| Recap entry "Your 2026 in 7 slides / See it and share it": 72 dp, `accentTint`, radius 24, 48 dp gradient tile     | none (contract said "not drawn"; Q-11 supersedes)    | `RecapEntry`: one `Tappable` (`coming-soon-recap`), hint "Not available yet", one toast; tile is `Scrim kind="recap"` (coral to amber)                                                                                       |
| Stamps page: cream, hairline, radius 24, padding 20 16 24, notch at the top right corner                           | none                                                 | `StampsPage` (`stamps-page`), `stamps-notch` 40 dp at -14 / -14 in the canvas colour                                                                                                                                         |
| "Stamps" `headline` + "14 of 195" `caption` muted, baseline aligned, 24 dp right padding                           | none                                                 | as drawn; the count is the number of stamps shown over the fixed 195                                                                                                                                                         |
| Two columns, 124 dp stamps, column gap 8, row gap 4, second column 20 dp lower                                     | none                                                 | two columns (`stamps-column-0/1`), `SECOND_COLUMN_OFFSET` 20                                                                                                                                                                 |
| Stamp: seeded shape, ink, tilt, wear, perforation; name under it                                                   | adapters existed, unused on this screen              | `passportStamps` -> `deriveStamp` (= `stampSpec`); each cell one `image` named "Stamp: Portugal, 12 October 2026", art hidden                                                                                                |
| Past about 100 stamps the stamps are rasterised (D5-08)                                                            | none                                                 | from 100 stamps `RasterStamp`: baked once per (shape, ink, wear, perforation, code, text, date, size, theme) through `captureViewToFile`, three at a time, drawn with `expo-image`; a failed capture leaves the vector stamp |
| Stamp landing for stamps earned in the last 7 days, once per session, heavy haptic, none under reduced motion      | `StampIn` existed, unused                            | `StampIn play={recent && !landed}`; `stamp-landing.ts` is the in-memory session set (D5-17)                                                                                                                                  |
| Empty: a ghost stamp and the next step, never an illustration                                                      | none                                                 | `stamps-empty` (ghost stamp, "No stamps yet" / "No new stamps in 2026" and what to do)                                                                                                                                       |
| Groups: Account ("Home currency"), App ("Version")                                                                 | as built                                             | unchanged ids, names, hints; the email is now the first Account row (`profile-email`)                                                                                                                                        |
| Sign out and Delete account apart, danger ink and an icon; guard unchanged                                         | as built                                             | unchanged (`profile-sign-out`, `-icon`, `-error`, `profile-delete-account`, `sign-out-warning*`); Delete account still disabled "Coming soon"                                                                                |
| Loading skeleton mirrors content, one progress element                                                             | none                                                 | `PassportSkeleton` ("Loading your passport") for the passport part only; identity and groups are from the session and never wait                                                                                             |
| Error: says the data is safe                                                                                       | none                                                 | `passport-error` "Couldn't read your passport / Your trips are safe on this phone."; the rest of the screen, Sign out included, still works                                                                                  |
| Margins 20, Android 16; between blocks 16                                                                          | 16, gap 12                                           | `ScreenMargin`, `Space[4]`                                                                                                                                                                                                   |
| Dark: stamps lie normally (no multiply), the card is the same navy                                                 | n/a                                                  | `Stamp` and the baked picture use `multiply` in light only; `Scrim kind="passport"` is theme-independent (test over four palettes)                                                                                           |
| Contrast themes, text scales 1.5 and 2, Android                                                                    | n/a                                                  | tokens only; no fixed heights on text; figures stack at 1.15+; checks below are device checks (no pictures exist)                                                                                                            |

## Deviations (and why)

- **Email moved into Account.** The picture's identity block has no email line; `profile-email` and Maestro need it visible, so it is
  the first row of the Account group (the group keeps its id). The old test that put the email inside `profile-identity` changed.
- **iOS has no native header** on this tab (the identity block replaces the large title, as the contract says); the name is the
  screen's heading there. The options still carry the title "You".
- **Stamp top text is the country name** (upper case, 16 characters at most), not a city ("LISBOA . SINTRA" in the picture): a stop
  stores no city name on the globe rows. The data model allows "a city or the country".
- **Passport mark is the globe glyph** (the registry has no brand mark); the lap line's globe is the bright `amber` tone (new, additive
  `Icon` tone drawn on the navy only, as the picture).
- **"Your 2026 in 7 slides"** is drawn with the year in view (this year for All time). "7 slides" is the pictured words of a capability
  that does not exist; no figure about the traveller is computed for it (Q-11).
- **Period membership.** A trip belongs to the year of its first arrival; the card's countries, distance and trips are the app's
  statistic (`travelSummary`) over those trips, so a country first visited in 2025 and revisited in 2026 is in 2026's passport.
  The stamps of a year are the countries FIRST arrived in that year, so the two can differ; All time agrees with the Home sheet.
  A trip with no stop is only in All time. Planned years are offered (planned trips are counted by the existing statistic).
- **Many years.** The picture draws three segments; five or more scroll sideways so no year is out of reach.
- **Stamps, columns.** Two independent columns, the second 20 dp lower (the UI-SPEC reading), not a CSS grid whose rows would drift 20 dp
  further down on every row.
- **Distance unit** follows the device (km or miles), as the Home sheet does; the picture says km.
- **Maestro `offline/11-a`** now scrolls to `profile-sign-out` (the passport pushes it below the first screenful), to the guard's warning
  (under the row, below the fold) and back up to `profile-email`; same assertions, same ids, same words. Not run here (device).
- **Unresolved dynamic ids**: `test/fixtures/testid-unresolved-count.json` regenerated from 98 / 76 to 99 / 79 (the baked stamp's
  forwarded id and the three computed accessible names: the stamp's spoken label, the passport card name, the period option names).
  `node scripts/testid-baseline.mjs --check` reports parity.
- `tsc` reports two errors in `test/components/us2-components.test.tsx` (`glyphNamesIn` is not defined). They are in the branch point
  (`8bb0f3a`), untouched here.

## Evidence of each small step

| Step                                                                                                                                                | Tests                                                                                                                                                 | Commit      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `stamp-spec.ts` (period stamps, 221 country/date pairs by the hash rules, recent flag), `passport-totals.ts` (test first, saw "Cannot find module") | `features/passport/__tests__/stamp-spec`, `passport-totals`: 24 tests                                                                                 | `9749ea7`   |
| `passport-copy.ts`, `use-passport.ts`                                                                                                               | `passport-copy` (7 at this step), `use-passport` (real SQLite): 9 tests                                                                               | `8789f58`   |
| `Scrim kind="passport"`                                                                                                                             | `scrim.test`: four palettes, glow, box, hidden                                                                                                        | `ba63985`   |
| Passport card, identity block, period switch, `Icon` amber tone, `mrzLine`                                                                          | `passport-card` 18, `profile-identity` 7, `period-switch` 6, `icon` 199, `passport-copy` 10                                                           | `ed344cf`   |
| Stamps page, raster stamp + queue, landing, recap entry, `Scrim kind="recap"`                                                                       | `stamps-page` 16 (two columns, 20 dp, landing once, ghost, bake 3 at a time, failure, cache), `recap-entry` 4, `scrim` 66                             | `40a96e5`   |
| The screen, layout, groups, skeleton/error, Maestro scroll, unresolved counts                                                                       | `test/app/profile-screen` 17 (incl. the 120-stamp scroll), `tab-screens`, `nested-stack-layouts`, `sync-runtime-profile`, `profile-gates-real-render` | `5e400c1`   |
| Card is a labelled summary (figures stay reachable), this note                                                                                      | `passport-card` 18                                                                                                                                    | see git log |

Full gates on the final tree are listed in the report that came with this note (jest, tsc, eslint, prettier, testid baseline, theme CSS).

## Device checks for the owner

1. iPhone 15 and an Android phone: the screen against `profile.png` / `profile-dark.png`: identity row, switch, navy card (gradient,
   amber corner, rings), recap row, stamps page with its notch; the second column 20 dp lower; margins 20 (Android 16).
2. The stamps in the real face: curved text on the circle and scallop, the wear holes (V5), the notch colour against the canvas in
   dark, and that a stamp multiplies into the cream page in light only.
3. A passport of 100+ countries (or temporarily lower `STAMP_RASTER_FROM`): the baked stamps keep colour, transparency and tilt on both
   platforms, scrolling stays smooth, and the page fills in without a jump (V2/V5; view-shot of a hidden, laid-out view).
4. Stamp landing: a country first arrived in the last 7 days comes down once per launch with the heavy haptic; none with Reduce Motion.
5. Text scale 1.5 and 2, all four themes: figures stack in one column from 1.15 and shrink rather than clip; the identity name wraps;
   the period pill does not clip (five or more years scroll).
6. Share, Settings and the recap row each show one "is coming soon" toast above the tab pill and do nothing else.
7. `offline/11-a-sign-out-unsynced` on a device: the scrolls reach Sign out and the warning; Stay, Sign out anyway and the online push all
   still behave (unchanged guard). Delete account still says "Coming soon".
8. iOS: no large title on this tab, the name is the heading to VoiceOver; Android: standard "You" header with the content below it.
