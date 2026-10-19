# Implementation plan: Sunrise Passport

A step-by-step plan from today's state to a finished, verified UI that matches the pictures in
[`screens/`](./screens). It does not replace `../tasks.md` (71 tasks, T500 to T570, the authoritative checklist with
requirement and decision coverage); it **orders the remaining work, says what to look at for each step, and says when
a step is done**. Visual detail is in [`UI-SPEC.md`](./UI-SPEC.md).

## 0. Where things stand

Branch `feat/005-sunrise-passport-ui` (nothing pushed; 96+ commits over `feat/004-app-ui-redesign`). **41 of 71 tasks
are done and 30 are open.** The last full run on the merged branch: `tsc` clean, ESLint clean, Prettier clean, Jest
321 suites and 8,050 tests, 98.7% statement coverage, theme CSS up to date, test-ID parity holding (205 IDs, 64
labels, every Maestro selector served).

| Area                                                                  | State                            | Tasks        |
| --------------------------------------------------------------------- | -------------------------------- | ------------ |
| Baselines, dependency batch, fonts, Jest stand-ins, desk exports      | Done                             | T500 to T506 |
| Tokens, contrast gate (P1 to P23), type, icons (Phosphor), adapters   | Done                             | T513 to T523 |
| Dev gallery (`/gallery`) and the foundation gate                      | Done                             | T524, T525   |
| Chrome: tab pill, Android bar, headers, sync chip, "You" label        | Done (device checks open)        | T526 to T530 |
| Home: globe fit, Sunrise globe style, pins, sheet, countries, compose | Done (device checks open)        | T531 to T538 |
| Trips and Trip detail                                                 | Done (device checks open)        | T539 to T546 |
| **Device spikes** (fonts, globe style, sheet, glass, stamps, motion)  | **Open**                         | T507 to T512 |
| **First-slice owner review**                                          | **Open: gates everything below** | T547         |
| Everyday areas and forms                                              | Not started                      | T548 to T553 |
| Welcome, sign-in, You, delight                                        | Not started                      | T554 to T558 |
| Sweeps (states, accessibility, text scale, themes, baselines)         | Not started                      | T559 to T563 |
| Retire Atlas, docs as built                                           | Not started                      | T564, T565   |
| Device gates, Maestro, offline gate, reviews, final owner review      | Not started                      | T566 to T570 |

Nothing has been judged on a phone against the pictures yet. Jest style and prop tests are **not** proof of layout,
fonts, gestures, safe areas, glass, haptics or frame rate.

### Delivery: one feature at a time, each approved before the next (owner's rule, 2026-10-19)

A **feature** is one big visible piece. Work on a feature is split into short objectives on their own branches; when
the feature is complete the work **stops and waits for the owner's approval on a phone** before the next feature
starts. A feature lives on `feat/fN-<name>` (from `feat/005-sunrise-passport-ui`); its objectives are
`feat/fN-<name>-<objective>` merged into it; after approval it is merged into `feat/005-sunrise-passport-ui`.
The owner tests a feature by checking out `feat/fN-<name>`. Pictured controls with no capability behind them are
drawn as pictured and are "coming soon" controls (`UI-SPEC.md` section 10, `spec.md` FR-080 as amended by Q-11).

| #   | Feature (approval gate)                                                          | Pictures                                      | State       |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------- | ----------- |
| F1  | **Map**: the Home globe look, pins and photo roundels, callout, header, recentre | `core/home*`                                  | In progress |
| F2  | **Home sheet**: three positions, Now card, figures, Countries, invitation        | `core/home*`, `more/countries`                | Not started |
| F3  | **Tab bar**: the floating pill and the Android bar                               | every frame with a bar                        | Not started |
| F4  | **Trips cards and list**: hero, ticket, rows, filter, button, states             | `core/trips*`                                 | Not started |
| F5  | **Trip screen**: hero, areas, day chips, stops and spine                         | `core/trip*`                                  | Not started |
| F6  | **Forms**: New trip, stop editor, add expense                                    | `core/form`, `more/add-stop*`, `add-expense*` | Not started |
| F7  | **Photos** and the photo viewer                                                  | `more/photos*`, `photo-viewer`                | Not started |
| F8  | **Spending**                                                                     | `more/expenses*`                              | Not started |
| F9  | **Notes** and the note editor                                                    | `more/notes*`, `note-editor`                  | Not started |
| F10 | **Documents** and the document viewer                                            | `more/documents*`, `document-view`            | Not started |
| F11 | **Offline maps**                                                                 | `more/offline-maps*`                          | Not started |
| F12 | **Welcome, sign in, create account**                                             | `core/welcome*`, `more/auth*`, `register`     | Not started |
| F13 | **You**: passport, stamps                                                        | `core/profile*`                               | Not started |
| F14 | **Sweeps, retire Atlas, release gates** (Phases 9 to 11)                         | all                                           | Not started |

The code of F1 to F5 exists (Phases 3 to 6) but was never compared with the pictures on a phone; each of those
features starts with a **fidelity audit** (picture vs. code and prototype CSS), fixes the gaps, and is then approved.

## 1. Rules for every step

- **Spec first, then test, then code.** If behaviour is not in `../spec.md`, specify it first. Write the failing test
  before the code (`AGENTS.md`). Coverage floor 80% per workspace.
- **Compose from the adapters** (`apps/mobile/src/components/ui/*`); only that folder imports `heroui-native` and the
  native-batch packages. No colour literal, gradient string or `heroui-native` import in a screen (lint and tests enforce it).
- **Keep every `testID` and accessible name** (the parity test, `test/testid-parity.test.ts`) except the one
  deliberate change: the third tab "Profile" becomes "You" (id unchanged).
- **One Mapbox `MapView`**, never a second map; do not touch `features/globe/great-circle.ts`, arc or camera geometry.
- **Local-first**: writes go to the encrypted SQLite store; a record is not "saved" until uploaded; no derived view
  transmits or stores anything new.
- **Pictured controls without a capability are "coming soon" controls** (`UI-SPEC.md` section 10): drawn as pictured, one toast, nothing else, no invented data.
- **Hermes is not Node.** Jest runs on Node, which has APIs the app's engine lacks (`Intl.PluralRules` crashed Home
  on a phone). Avoid `Intl.PluralRules`, `Intl.ListFormat`, `Intl.RelativeTimeFormat`, `Intl.Locale`,
  `Object.groupBy`, `structuredClone`, `Promise.withResolvers` and the new `Set` methods; compact number notation is
  ignored on iOS Hermes. Check anything new against `facebook/hermes` `doc/IntlAPIs.md`.
- **Expo API shapes** come from `https://docs.expo.dev/versions/v57.0.0/`, not memory.
- **Branching** (a professional team's flow): one branch per slice from `feat/005-sunrise-passport-ui`
  (`feat/005-<slice>`), its own `git worktree` (junction `node_modules` from the main checkout; never `npm install` in
  a worktree), conventional commits, a self-review of the diff, merge with `--no-ff`, then regenerate the
  unresolved-id ratchet:
  `node scripts/testid-baseline.mjs --write-unresolved test/fixtures/testid-unresolved-count.json` (from `apps/mobile`).
  Expected merge conflicts are in `tasks.md`, `contracts/components.md` and that JSON: keep both sides.
- **The gate for every slice** (from the repository root unless noted):

```bash
npm run lint && npm run typecheck
npm run test:cov -w apps/mobile              # Jest, 80% floor
npm run theme:check -w apps/mobile           # generated theme.css is current
(cd apps/mobile && node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json)
npx prettier --check .                       # route files need character classes, see AGENTS.md
```

For a native or bundle change also run `npx expo export --platform android` and `--platform ios` from `apps/mobile`.

## 2. Step 1: see it on a phone (T507 to T512, T547)

This is the **only step that cannot be done at a desk**, and the rest waits for it.

1. **Build the dev client** (new native modules since the last build: glass, view-shot, svg, blur, haptics, fonts):
   `.\run-on-phone.cmd -RebuildApp` (Android). iOS: `eas build --profile development --platform ios`.
   - If Gradle stops with `AccessDeniedException` or "Failed to clean up stale outputs" on Windows, the build folders
     are flagged read-only: `attrib -R "<repo>\apps\mobile\android\*" /S /D` and the same on
     `<repo>\node_modules\*` (then `gradlew.bat --stop` if a daemon holds files).
2. **Open the gallery**: `adb shell am start -a android.intent.action.VIEW -d "com.triptrackr.app.dev:///gallery"`
   (iOS simulator: `xcrun simctl openurl booted "com.triptrackr.app.dev:///gallery"`). It shows every component in the
   four themes at text scale 1 and 2, over a white-photograph fixture. Compare with `core/components.png` and
   `more/states.png`.
3. **Run the spikes** and record each result in `../research.md` and under its task in `../tasks.md`:

| Task | Question                                                                                                                                                              | If it fails (fallback, already designed)                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| T507 | Do the six font files load on both platforms; do `tnum` figures stay tabular; does Dynamic Type scale them                                                            | Instanced fonts instead of statics                                                                    |
| T508 | Does `Atmosphere` override Standard's fog at globe zoom; do the style colours read; do view-shot roundels capture with the right colours; are far-side markers culled | Photo roundels become dots (they already ship as dots: `GlobeLayers.pins.roundelsEnabled` is `false`) |
| T509 | Does the sheet drag at 60 fps over the live globe on a mid Android phone; does the list hand-off work; does BackHandler step the detents                              | Simplify the sheet body; fewer live layers                                                            |
| T510 | Does `GlassView` render on iOS 26; do blur and solid fallbacks look right; is the Android bar right                                                                   | Glass becomes solid                                                                                   |
| T511 | Does an `<Image>` inside an SVG `<Mask>` work; does `TextPath` render; 120 stamps scroll smoothly; the zoom toolkit                                                   | `MaskedView`; rasterised stamps                                                                       |
| T512 | Apple Zoom latency on the trip route; WEBP; flag glyphs; Android haptics                                                                                              | Drop Apple Zoom above ~400 ms                                                                         |

4. **Walk Home, Trips and a trip against the pictures** (`UI-SPEC.md` section 12) on one iPhone and one Android phone:
   - Home at peek, half and full; empty; loading; offline (`home-peek`, `home`, `home-full`, `home-empty`, `home-loading`,
     `home-offline`, `home-error`).
   - Trips: mixed, 200+, no cover (`trips`, `trips-200`, `trips-nocover`, `trips-android`).
   - A trip: normal, collapsed, zero stops (`trip`, `trip-collapsed`, `trip-zero`).
   - Each in light, dark, increased contrast and at the largest text size; with the Android bar.
   - Repeat feature 004's open checks (native Back, form-sheet keyboard, the display face) and run Maestro `03-globe`,
     `04-zoom` and `01-account-and-trip` once (they were edited, not run; see `../tasks.md` "Maestro flow edits").
5. **Write down every difference** as a list: _picture vs. phone, which screen, which theme/scale_. Triage into
   (a) bug to fix now, (b) expected difference (own photos, Mapbox globe, platform fonts), (c) owner decision.
6. **Owner approves or lists changes** (T547). Phases 7 and 8 do not start before approval.

**Done when**: the spike table has a result per row, the difference list is triaged and (a) is empty, and the owner
has approved in writing.

## 3. Step 2: fix what the review found

For each (a) item: reproduce in a test where one can exist (a style, a prop, a layout rule), fix, run the gate,
commit `fix(mobile): ...`. Device-only findings (a font that does not render, glass that flickers) are fixed with the
spike's fallback and recorded. Re-walk only the affected screens and re-approve.

## 4. Step 3: Phase 7, everyday areas and forms (T548 to T553)

Order: **T548 first** (shared header, FAB and area states), then T549 to T553 in parallel branches.

| Task | Branch                     | Build (see the section of `UI-SPEC.md`)                                                                                                                                          | Pictures                                                        | Flows to run                                         |
| ---- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------- |
| T548 | `feat/005-areas-shared`    | `AreaHeader` (Back, title, subtitle, `PrivacyChip`), `AreaFab` (hides with the keyboard), area skeletons and empty states                                                        | `more/photos`, `expenses`, `notes`, `documents`, `offline-maps` |                                                      |
| T549 | `feat/005-areas-photos`    | Day grouping, `DayHeader`, `PhotoMosaic` (114 dp tiles, gap 4, `+N`), upload states, summary line, `PhotoViewer` over the zoom toolkit                                           | `more/photos`, `photos-long`, `photos-scale1.5`, `photo-viewer` | `05-photos-and-documents`, `offline/06-*`            |
| T550 | `feat/005-areas-expenses`  | `spending-summary.ts` (decimal.js, exact sums, pending conversions excluded and counted), `SpendingHero`, `DayBars`, `CategoryBar`, `ExpenseRow`, amount-first Add expense sheet | `more/expenses`, `expenses-long`, `add-expense`                 | `02-notes-and-expenses`                              |
| T551 | `feat/005-areas-notes`     | `NoteCard`, the note editor sheet (Cancel and Save, no autosave)                                                                                                                 | `more/notes`, `notes-long`, `note-editor`                       | `02-notes-and-expenses`                              |
| T552 | `feat/005-areas-documents` | `DocumentTicket` (three kinds), the viewer (barcode on a white plate), `OfflineCityCard`, `StorageBar`; screen-capture protection unchanged                                      | `more/documents`, `document-view`, `offline-maps`               | `05-photos-and-documents`, `offline/08-*`            |
| T553 | `feat/005-areas-forms`     | `FormSheet` look (28 dp radius, handle, Cancel in ink), New trip (name and currency only), stop editor with `RoutePreview` and `NightsStepper`, the city picker with flag chips  | `core/form`, `more/add-stop`, `add-stop-kb`, `add-stop-long`    | `01-account-and-trip` (date picker taps), `03-globe` |

Per branch, in this order: failing tests (rules, geometry, each state, keyboard visibility for forms, a spending
test with `decimal.js` and no `Number` on an amount) → the component → the screen → ids and names unchanged → the
screen's four states (loading, empty, error, populated) → compare with the pictures (`UI-SPEC.md` section 12).
Remember which pictured controls are **coming soon** (search and "more" buttons in headers, the Budget line, "Map ›",
"New area", extra document kinds, transport chips, the per-stop note): draw them, wire the toast, invent no data.

**Done when**: all six branches are merged, the gate is green, and the areas match their pictures on the phone.

## 5. Step 4: Phase 8, Welcome, sign-in, You, delight (T554 to T558; branch `feat/005-auth-you`)

| Task | Build                                                                                                                                                                                                                                                            | Pictures                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| T554 | Welcome: sky, a turning globe (static under reduced motion, `useIdleSpin` at world scale), the 28 dp sheet with the existing tagline (one nested accent word) and **two** buttons                                                                                | `core/welcome`, `welcome-dark`       |
| T555 | Sign in and Create account restyle: thumb-zone primary, words-and-icon errors, `secureTextEntry`, `textContentType` and `autoComplete` unchanged; a light security review (error mapping and logging unchanged)                                                  | `more/auth`, `auth-long`, `register` |
| T556 | `features/passport/stamp-spec.ts` (200+ country and date pairs give the same stamp twice; rotation −8 to 8; wear and perforation by hash) and `passport-totals.ts` (period membership by first arrival, continents excluding Unknown, lap fraction), tests first | `core/profile`                       |
| T557 | You: identity ("Traveller since" from the account's creation year), `PeriodSwitch`, `PassportCard`, `StampsPage` (rasterised past ~100 stamps), Account and App groups, Sign out and Delete account apart with the guard unchanged; a 120-stamp scroll test      | `core/profile`, `profile-dark`       |
| T558 | Delight: count-up once per appearance, stamp landing for stamps from the last 7 days (once per session, heavy haptic), the live pin pulse, selection haptics on detent, tab and chip; nothing under reduced motion                                               | `core/home` (pulse), `core/profile`  |

Flows: `01-appearance`, `00-smoke`, `offline/00-a-setup-account`, `offline/11-*`. **Not built**: the share and
settings buttons, a profile photograph, the recap entry, the three-button Welcome.

**Done when**: merged, gate green, and these screens match their pictures.

## 6. Step 5: Phase 9, sweeps (T559 to T563; branch `feat/005-sweeps`)

1. **States** (T559): every route has loading, empty and error to one standard; camera and photo-library denial;
   a test that fails on a control with no handler and on any Tier 3 control.
2. **Accessibility** (T560): names, roles, states and order unchanged for pre-existing controls (parity plus an order
   test per screen); decorative art hidden; animated figures announce the final value; locale formats; the globe's
   actions and the Countries list reach every country and trip (30-country fixture). **Device**: VoiceOver and
   TalkBack walks of Home, Trips, a trip and You.
3. **Text scale** (T561): reflow tests at 1, 1.15, 1.5 and 2 (figures, areas, ticket, passport grid, tabs, hero
   title) against `-scale1.5`, `-scale2` and `-long`; no fixed heights remain. **Device**: iOS largest accessibility size
   and Android 200%, every screen, four themes.
4. **Themes, motion, transparency** (T562): four themes on every screen (`-dark`, `-contrast`); the contrast themes
   opaque; reduced motion removes rotation, pulse, count-up, stamp landing, shimmer and haptics; a test that no
   translucent surface renders under either flag. **Device**: live switching with the app open.
5. **Baselines** (T563, device): compare frame rates and the sheet drag with `pre-005-baseline`; release bundle and font
   size (over 1 MB reviewed); press feedback within 100 ms and settle within 300 ms.

**Done when**: all sweeps pass at the desk and on the devices.

## 7. Step 6: Phase 10, retire Atlas (T564, T565)

Remove every Atlas palette value, the flat tab strip code, the Atlas-only adapters and the 004 aliases nothing uses
(`test/theme/atlas-values.test.ts` turns green when run with `ATLAS_RETIREMENT=1`; the neumorphism search stays
empty); delete the unused `components/globe/stats-overlay.tsx`. Then docs as built: `AGENTS.md` (the look, the chrome,
the libraries), `../research.md` spike results, the 003 and 004 amendments pointing at their final state.

## 8. Step 7: Phase 11, release gates (T566 to T570)

| Task | What                                                                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T566 | Full Maestro run (`npm run e2e -w apps/mobile`) on an iPhone and an Android phone; record `assertScreenshot` baselines for 8 to 12 hero screens in `apps/mobile/e2e/__baselines__/` (Home three positions, Trips, Trip, Photos, Spending, You, Welcome, a sheet); list every flow edit in `../tasks.md` |
| T567 | Re-run the 15-row offline-synchronisation gate on two real devices (`apps/mobile/e2e/offline/README.md`) and record it in `gate-evidence.md` (build against the API over the network, never `adb reverse`)                                                                                              |
| T568 | Clean `npm ci` and all checks on Windows; the first CI run of the branch; coverage ≥ 80% in every workspace; the API and privacy suites unaffected (Docker needed for those, not for the UI)                                                                                                            |
| T569 | Code review and a security review of the derived views (no path by which expenses or documents reach a shareable surface; nothing transmitted or stored) and of the sign-in restyle                                                                                                                     |
| T570 | Final owner review on a phone in both themes, at the largest text size and with increased contrast; first-time-viewer test (95% identify what is tappable; 9 of 10 find the primary action in sunlight)                                                                                                 |

## 9. Definition of done for the whole UI

- Every screen in `UI-SPEC.md` matches its pictures on a 390 × 844 phone within the tolerances of section 12, in
  light, dark, light-contrast and dark-contrast, on iOS and Android, at text scale 1 and at the largest size.
- Every pictured control exists, and each Tier 3 one is a "coming soon" control; no colour literal, gradient string or kit import in a screen; Atlas is gone.
- All gates are green; the parity test holds with only the "Profile" to "You" change recorded.
- Device spikes, VoiceOver and TalkBack walks, the Maestro run and the two-device offline gate are recorded.
- The owner has approved the first slice (T547) and the final review (T570).

## 10. Open decisions for the owner

1. **Pictures vs. product rules (decided, Q-11).** The pictures show controls for capabilities the app does not have
   (search, recap and share, settings, trip menu and delete, per-day budget, transport chips, three-button Welcome).
   They are **drawn as pictured** and answer with a "coming soon" toast; no capability is built and no data is
   invented (`UI-SPEC.md` section 10). Building a capability for real is its own specified feature with a security or
   sync review; say which and when.
2. **Words.** The app's existing words win over the pictures' ("Plan a trip", "Planning", "Active"); only "Profile"
   becomes "You".
3. **The globe.** The pictures draw a stylised D3 globe; the app keeps the Mapbox globe restyled to match
   (cream land, blue sea, coral outlines, gradient arcs, atmosphere). Expect a close match, not a pixel match.
4. **Repository weight.** The pictures and the prototype add about 62 MB. If that is too much, move
   `screens/` to Git LFS or to a design file and keep this document's file names.
