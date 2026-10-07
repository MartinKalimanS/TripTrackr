---
description: 'Task list for App UI Redesign (Atlas)'
---

# Tasks: App UI Redesign ("Atlas")

**Input**: Design documents from `/specs/004-app-ui-redesign/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **MANDATORY.** Constitution Principle III requires test-first development (red, green,
refactor) and an 80% coverage floor in every workspace. Every implementation task below is preceded by its
failing test, written and observed failing first; the task line names both.

**Organization**: grouped by user story so each is independently reviewable. Phase 1 (spike) and phase 2
(foundation) gate everything; phase 3 is the first slice the user reviews on a phone before phase 4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US7 from [spec.md](./spec.md); setup, foundation and polish tasks carry none
- A trailing `(FR-nnn; D4-nn)` names the requirement or decision the task satisfies

## Path Conventions

Mobile app: the `apps/mobile` workspace (001 research D-13). Source under `apps/mobile/src/`, tests under
`apps/mobile/test/` and co-located `*.test.ts(x)`, end-to-end flows under `apps/mobile/e2e/`, per-app
config (`jest.config.js`, `eslint.config.js`, `metro.config.js`, `tsconfig.json`, `app.config.ts`) in
`apps/mobile/`. Route files need Prettier character classes (`AGENTS.md`).

## Rules that apply to every task

- Dependencies are added only through one root `npm install` (T401) with the lockfile committed; any
  other `package.json` edit (a script, for instance) is followed by `npm install` at the **root** and a
  committed `package-lock.json`. Never `npm install` inside a workspace (`AGENTS.md`).
- Do not touch `docs/travelappblueprint.md` or `docs/travelappfullspec.md`.
- Do not touch the globe's geometry, arcs, camera, terrain, `GlobeColors`, `GlobeBasemap` or statistics.
- A task that changes a visible string a Maestro flow taps edits that flow in the same change and notes it.

---

## Phase 0: Prerequisite

- [ ] T400 Land the uncommitted feature 003 working tree as separate conventional commits on
      `feat/us3-globe` (API logger pretty-transport; mobile journey legs, flat tab bar, currency picker,
      trip screen; `specs/003-globe-first-home`; run-on-phone scripts; AGENTS/README/gitattributes), run
      `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile`, then create branch
      `feat/004-app-ui-redesign` and tag `pre-004-baseline` (the testID and accessible-name baseline for
      T414). The Maestro flow edits already in the tree (`e2e/03-globe.yaml`) ride with their feature.

---

## Phase 1: Spike (go/no-go; no product screen changes)

**Purpose**: prove HeroUI Native on Uniwind fits this repository before anything depends on it. Work on
`spike/heroui-uniwind`; carry only findings, pins and config diffs worth keeping into T412. The ten checks
are listed in [research.md](./research.md#items-to-verify-empirically).

- [x] T401 Install the pinned packages of research D4-14 with exact pins in one root `npm install` (via
      `npx expo install` for `react-native-svg`, `expo-blur`, `expo-haptics`); verify each version's publish
      date is at least 7 days old, review install scripts, run `npm audit`; confirm `heroui-native` loads
      without `@gorhom/bottom-sheet`; run `npm ci` on Windows and note the CI expectation (SC-012); rebuild
      the Android and iOS dev clients (D4-14). _Done except rebuilding the dev clients, which is pending on a
      device: the install is commit e580c87, `npm ci --dry-run` passes on Windows, and `heroui-native`
      bundles, type-checks and renders without `@gorhom/bottom-sheet` (research items 8 and 10)._
- [x] T402 Metro: wrap `apps/mobile/metro.config.js` so `withUniwindConfig` is the **outermost** wrapper
      over `getSentryExpoConfig`, the `.sql` source extension and the test-file block list
      (`cssEntryFile: './src/global.css'`, `dtsFile: './src/uniwind-types.d.ts'`, `extraThemes`); add a
      minimal `src/global.css`; confirm iOS and Android bundles build and the Sentry Debug ID is still
      embedded (D4-02)
- [x] T403 React Compiler: with `experiments.reactCompiler` on, render a throwaway screen using Button,
      Field, Card, ListGroup, Chip; record any file that needs `"use no memo"` (D4-02)
- [x] T404 Jest: extend `transformIgnorePatterns`, add reanimated and worklets mocks, a `uniwind`
      `useCSSVariable` stub, `.css` handling and one shared `heroui-native` stand-in in `jest.config.js` and
      `jest.setup.ts`; failing test first for one real `Button` and `Field` render; the whole existing suite
      stays green (D4-13)
- [ ] T405 Pass-through audit on both platforms: `testID`, `accessibilityLabel`, role, state and hint reach
      the native node on Button, Card, ListGroup item, Input and Chip; touch targets of sizes sm, md and lg
      measure at least 44 dp (iOS) and 48 dp (Android); busy and disabled are announced; check whether
      rounded views honour `borderCurve: 'continuous'`; compare one measured screenshot of a soft chip
      against `blend()` (0.1 tolerance) (FR-024, FR-026, FR-030). _(desk part done / device part pending:
      research items 4 and 9)_
- [ ] T406 Themes: register `light-contrast` and `dark-contrast`; call `Uniwind.setTheme` from a throwaway
      effect fed by `useAppearance()`; switch system dark mode with the app open; confirm no first-frame
      flash beyond the splash (FR-031, FR-032; D4-05). _(desk part done / device part pending: research
      item 5)_
- [ ] T407 Reduced motion and text: provider `animation: 'disable-all'` removes the kit's animation; at
      font scale 2.0 Button, Chip and ListGroup do not clip; `textProps` stay uncapped (FR-028, FR-029).
      _(desk part done / device part pending: research item 6)_
- [ ] T408 Navigation and font: a native header's Back resolves for `tapOn: 'Back'` on iOS and Android (try
      `headerBackButtonDisplayMode: 'generic'`, else a custom `headerLeft` labelled "Back"); `formSheet`
      behaves on both platforms; load the display-face shortlist (Bricolage Grotesque, Young Serif, Geist)
      through the `expo-font` config plugin and apply it to `headerLargeTitleStyle`; **choose the face**
      and record it in research D4-07 (FR-007, FR-008, FR-009; D4-06, D4-07). _(device part pending; one font
      fact recorded in research item 7; the iOS spelling of the font CSS is unconfirmed until a device
      run, D4-07 "How far the CSS is proven")_
- [ ] T409 Record the go/no-go and each check's result in [research.md](./research.md) ("Go/no-go
      outcome"). **No-go**: switch to the fallback of `contracts/components.md` C4-6 (same adapters on React
      Native primitives and the same tokens) and continue; tasks below stay valid, only T412 and T413
      internals change (D4-02). _(desk part done / device part pending: conditional go recorded)_

**Checkpoint**: decision recorded. Phase 2 starts only after T409.

---

## Phase 2: Foundation (blocking; no screen moves)

**Purpose**: the token source, the generated theme, the adapters, the lint boundary and the baselines.
After this phase every unconverted screen already renders in Atlas colours with no soft shadows.

### Tokens and themes

- [x] T410 [P] Failing tests in `apps/mobile/test/theme/palette.test.ts`: every key defined in all four
      themes; status colours equal `GlobeColors` where specified; no pure `#000000`/`#FFFFFF` in the base
      themes; failing tests in `test/theme/contrast-gate.test.ts` extended per `contracts/design-tokens.md`
      C4-3 (four themes, soft blends, hover mixes, planning ink, field border, focus, 7:1 in the contrast
      themes, the enumerated exemption allowlist) and in `test/theme/contrast.test.ts` for `blend()`
      (FR-023, FR-024, FR-027; D4-04)
- [x] T411 Implement `apps/mobile/src/theme/palette.ts` and `blend()` in `src/theme/contrast.ts`; re-point
      `Colors` in `src/constants/theme.ts` at the palette (keys preserved); force the elevation profile to
      `flat` in `src/theme/elevation-profile.ts`; update the tests that asserted the old neumorphic values
      (FR-001, FR-002; D4-04, D4-12)
- [x] T412 Failing test `apps/mobile/test/theme/theme-css-sync.test.ts` (regenerated CSS equals the
      committed file; every theme defines every variable); then `apps/mobile/scripts/build-theme-css.mjs`,
      `src/theme/generated/theme.css`, `src/global.css`, the `theme:build` script in
      `apps/mobile/package.json` (then `npm install` at the root), Metro, `tsconfig.json`, `jest.config.js`,
      `jest.setup.ts` and `app.config.ts` (`expo-font` plugin, `assets/fonts/`), the root layout provider
      and the `Uniwind.setTheme(themeName)` effect in `src/app/_layout.tsx`, `themeName` in
      `src/hooks/use-appearance.ts`; carry over the spike's config diffs (FR-031, FR-032; D4-04, D4-05)
      _Done (tokens branch):_ the sync test, `scripts/theme-css.js` (pure `buildThemeCss`),
      `scripts/build-theme-css.mjs`, `src/theme/generated/theme.css` and `themeName` in
      `use-appearance.ts`. _Done (wiring branch):_ `src/global.css` is the four imports plus the display
      face (no hand-written colour; the spike's placeholder themes are gone), `theme:build` and
      `theme:check` (script lines only: no dependency changed, so no lockfile change), Metro and
      `tsconfig.json` (spike), `jest.config.js` and `jest.setup.ts` (the `useCSSVariable` stand-in now answers
      only names `theme.css` declares), the `expo-font` plugin in `app.config.ts`, and in
      `src/app/_layout.tsx` the `Uniwind.setTheme` effect, the reduced-motion provider config and the
      provider placement below the navigation theme (research D4-05, "T412 decisions"). Tests:
      `test/theme/{global-css,kit-variables,css-variable-stand-in,uniwind-adaptive-theme}.test.ts`,
      `test/config/{app-config,package-scripts,metro-config}.test.ts`, `test/app/root-layout.test.tsx`.
      _Deviation:_ the fonts are embedded straight from the `@expo-google-fonts` package, named by package
      specifier (the plugin resolves it from the project; a test runs the plugin's own resolver), not
      copied to `assets/fonts/`, so no binary is duplicated in Git. `useAppearance()` gained `ready`, and
      the root layout keeps the splash up until the first accessibility read has settled.
      _Device only, still open:_ rebuild the dev clients (the `expo-font` plugin changes the native
      projects, so `expo prebuild` runs), then T406 (live theme switch and no first-frame flash, with
      the more-contrast flag), T407 (live reduce-motion), T408 (the display face resolves on iOS by its
      PostScript name and on Android by its file name, which the `@theme static` + `@variant ios` CSS has
      so far only had proven by the Android export; pick the final face) and a Select, Dialog and
      Toast opened from a modal screen on both platforms (the portal host sits in the root layout).
- [x] T413 [P] `src/theme/typography.ts` and `src/theme/motion.ts` with their tests (type roles, radii,
      timings, tabular numerals), and the display-face variables in `global.css` (FR-001, FR-004, FR-022;
      D4-07)
      _Done:_ `typography.ts`, `motion.ts`, `shape.ts` (`AtlasRadius`, `AtlasSpacing`, `cornerStyle`) and
      `freeze.ts`, exported from `src/theme/index.ts`. _Done with T412:_ the display-face variables
      (`--font-display`, `--font-display-bold`) in `global.css`; the face is provisional (D4-07).

### Adapters (each: failing test first, in `apps/mobile/src/components/ui/*.test.tsx`)

- [x] T414 [P] Parity tooling: `apps/mobile/scripts/testid-baseline.mjs` and
      `apps/mobile/test/testid-parity.test.ts` that extract every `testID` and accessible name from the
      `pre-004-baseline` tag and fail when one is missing or renamed (allowlist file for recorded
      exceptions) (FR-037, SC-003)
- [ ] T415 [P] Baselines before screens move: scroll frame rate for 200 trips and 1,000 expense rows on
      the oldest supported test device, release JS bundle size and font size, recorded in
      `specs/004-app-ui-redesign/research.md` "Baselines" (SC-006, SC-011)
- [x] T416 [P] `Text` with the `largeTitle`, `title`, `headline`, `body`, `callout`, `caption`, `numeric` roles, a
      `tone`, header semantics and tabular numerals (`components/ui/text.tsx`) (FR-004; C4-8). _Revised:_ there
      is no `ThemedText` shim and no JavaScript ink promotion: `ThemedText` is untouched until phase 7 (migrated
      screens use `Text`), and muted ink is already 7:1 in the contrast themes through the stylesheet.
- [x] T417 [P] `Tappable` and `Button` with required accessible name, busy and disabled exclusivity,
      44/48 dp scaled minimum, focus ring, 100 ms pressed state, haptic hook (`components/ui/tappable.tsx`,
      `components/ui/button.tsx`, `hooks/use-haptics.ts`) (FR-005, FR-019, FR-020, FR-026; C4-7)
- [x] T418 [P] `Card` and `Panel` (`variant`, `overMap`, `pending`), no shadow or tint over map content
      (`components/ui/card.tsx`, `components/ui/panel.tsx`) (FR-002, FR-006, FR-018, FR-033, FR-034).
      _Done:_ `Panel` lives in `card.tsx` (a small, flat container sharing the nesting guard in
      `surface-nesting.tsx` and the chevron in `press-cue.tsx`), not in a `panel.tsx`; the decisions are in
      `contracts/components.md`, "As built (T418, T419, T424)".
- [x] T419 [P] `ListGroup` and `ListRow` with chevron cue and forwarded `accessibilityActions`
      (`components/ui/list-group.tsx`) (FR-013, FR-024). _Done:_ also rendered once over the real kit
      (`test/ui-kit/surfaces-real-render.test.tsx`).
- [x] T420 [P] `Field` with the `TextField` prop surface and error words under the field
      (`components/ui/field.tsx`) (FR-025; auth and form props pass through unchanged). _As built:_ the
      kit's Android classes make the field border transparent until focus, so `Field` asks for
      `android:border-field-border` again (FR-024; pinned in `test/ui-kit/field-chip-kit-facts.test.ts`);
      the error is one `alert` element (the kit's FieldError needed `accessible`); `isRequired` adds a
      "Required" hint, because the asterisk is a glyph. Device checks: the Android border and the focus
      indicator on both platforms, a multiline field, and the kit's FieldError animation (C4-8).
- [x] T421 [P] `Chip`, `StatusChip` (keeps `status-pill-<status>`), `ChipGroup` (keeps radio roles and ids,
      sideways scroll option), `SyncBadge` restyle (`components/ui/chip.tsx`, `components/ui/sync-badge.tsx`)
      (FR-025, FR-034, 003 FR-017). _As built:_ `Icon` gained the `statusPlanning`, `statusActive`,
      `statusPast` and `pending` tones, because the status and sync chips tint their glyph like their
      text; an interactive chip has a platform-floor minimum size and 4 dp of slop (the kit chip has no
      height); `SyncBadge` keeps its ids, announcements and visible words. Device checks: chip target
      sizes and focus ring, `bg-<status>/15` through Uniwind, the sideways row at the largest text size,
      and the two glyph vocabularies on both platforms (C4-8).
- [x] T422 [P] State views: `Skeleton*`, `EmptyState`, `LoadingState`, `ErrorState`, `FormActions`,
      `InlineError` (`components/ui/state-view.tsx`, `form-actions.tsx`, `inline-error.tsx`) (FR-021,
      FR-035)
- [x] T423 [P] `Icon`, `Avatar`, `HeaderBackButton` (`components/ui/icon.tsx`, `avatar.tsx`,
      `header-back-button.tsx`) (FR-008; D4-08)
- [x] T424 [P] `Screen` and `ListScreen` restyle (canvas, `contentInsetAdjustmentBehavior`, safe areas,
      largest-text scroll) (`components/ui/screen.tsx`, `list-screen.tsx`) (FR-029; C4-8). _Done as an opt-in
      `underHeader` prop (default off), so the unmigrated screens are untouched; the canvas gains `bg-background`
      beside the existing token style in both modes._
- [x] T425 ESLint in `apps/mobile/eslint.config.js`: arbitrary-value colour classes rejected in `src/app`
      and `src/components`; `no-restricted-imports` for `heroui-native` and `uniwind` outside
      `src/components/ui/**` and tests; a test that fails when a file outside the folder imports the kit
      (FR-036; C4-1, C4-6)

**Checkpoint**: lint, typecheck, `test:cov` green; `Colors` on the Atlas palette; adapters exist and are
unused by screens.

---

## Phase 3: User Stories 1 and 2 - It looks like a real app; my trips at a glance (P1) 🎯 first slice

**Goal**: Home, Trips and Trip use the new chrome, cards, status chips, covers and timeline.

**Independent Test**: quickstart section 3 on one iOS and one Android device, light and dark, largest text,
increased contrast.

- [ ] T426 [US1] Failing tests in `apps/mobile/test/components/tab-bar.test.tsx` (renamed from
      `neumorphic-tab-bar.test.tsx`): flat strip, one divider at 3:1, filled selected icon, mark, 56 dp
      budget, touch target, preserved ids, no literal; then rename and re-skin
      `components/navigation/tab-bar.tsx`, update `app/(tabs)/_layout.tsx` (FR-010, FR-025)
- [ ] T427 [US1] Failing tests in `test/app/tab-screens.test.tsx` and `test/app/trip-and-modal-screens.test.tsx`
      for headers and Back; then nested stacks: move `app/(tabs)/trips.tsx` to `app/(tabs)/trips/_layout.tsx`
      and `index.tsx`, `profile.tsx` likewise (use the Prettier character-class workaround), themed header
      options for `trip/[id]/_layout.tsx` and `modal/_layout.tsx`, `HeaderBackButton` where T408 needs it
      (FR-007, FR-008; D4-06)
- [x] T428 [P] [US1] Failing tests in `components/globe/__tests__/stats-overlay.test.tsx` and
      `empty-state.test.tsx`; then restyle `stats-overlay.tsx` and `empty-state.tsx` as opaque hairline cards
      with display-face tabular figures; `GlobeView`, arcs, camera and `GlobeColors` untouched (FR-018,
      FR-033; D4-11). _As built:_ all three cards are `Card overMap` (the `bg-surface` fill, a `border-border`
      hairline, `shadow-none`, no opacity suffix; pinned per card). **Stats**: two `numeric` figures at the
      `title` size (display face, tabular numerals) over muted `caption` labels, in the chip's old inset;
      ids, role `summary` and the spoken label are as before, but sit on an outer `View` (`globe-stats`),
      because a plain `Card` announces nothing of its own and has no `accessible` prop; the card inside is
      `globe-stats-card`. **Invitation** (`globe-empty-state`): `title`, muted `callout` reason, ONE primary
      `Button` with the unchanged id, label and navigation per reason (there was never a second action, so
      no text button). **Notice** (`globe-notice`): `alert`, leading alert icon, danger-ink headline, muted
      detail; no retry, because `useGlobe` has no reload and the copy says to restart. Both messages share
      one `OverlayCard`: `self-stretch` with `max-w-md`, the reason wraps in full (the old `numberOfLines`
      cap of 3 is gone), and an inner `ScrollView` caps the card at 60% of the window height, so at the
      largest text size every word and the action stay reachable and the globe is never covered whole; the
      Home overlay keeps `pointerEvents: 'box-none'`. Home route: a `bg-background` view instead of
      `ThemedView`, `LoadingState` straight on `Screen`; no `ErrorState`, because a failed read keeps the
      globe and floats the notice (003 FR-001). Unresolved-id ratchet 34 to 35 (`OverlayCard` forwards
      `testID`). `GlobeView`, arcs, camera, beacon and `GlobeColors` are untouched. Device checks (Jest
      renders no styles): the cards over bright ocean and ice and over the dark night basemap (hairline
      visible, no halo); display-face figures and tabular digits on both platforms; large text on a small
      phone (the invitation wraps, scrolls inside its cap, the primary button stays reachable, the globe
      still pans and zooms around it); the top safe area under the notch and the status bar; TalkBack and
      VoiceOver read the stats as ONE summary, the notice as an alert on appearance, and the invitation
      title as a heading followed by the button.
- [x] T429 [P] [US2] Failing tests in `apps/mobile/test/db/` and `src/features/trips/__tests__/` for the
      cover rule (designated, earliest, typographic, thumbnail failure) and date range; then
      `db/repositories/photos.ts` (earliest photo per trip, thumbnails only) and the `TripSummary` extension
      in `features/trips/use-trips.ts` per data-model §4 and §5; state the visibility posture in the commit
      (FR-011, FR-012; D4-09)
      Follow-up (not now): reduce cover candidates to one row per trip in SQL (usable-path predicate
      mirrored in SQL, designated cover included, partial index or denormalised `earliest_photo_id`) when a
      library of several thousand photos is a target
- [ ] T430 [US2] Failing tests in `test/components/trip-components.test.tsx` and `test/app/tab-screens.test.tsx`
      for the card (cover, status chip, range, stops, currency, pending, whole-card control, chevron),
      skeletons, empty state, iOS header action versus Android FAB with the same `trips-plan-trip`; then
      `components/trip/trip-card.tsx`, `app/(tabs)/trips/index.tsx` (FR-011, FR-021, FR-035)
- [ ] T431 [US2] Failing tests in `test/app/trip-and-modal-screens.test.tsx` for the hero title
      (`trip-title`), status row, areas row (`trip-links`, `trip-open-<segment>`), timeline and preserved stop
      controls and accessibility actions; then `app/trip/[id]/index.tsx`, `components/trip/stop-row.tsx`,
      `stop-list.tsx`, `status-pill.tsx` (FR-013, FR-024, FR-030, 003 FR-018)
- [ ] T432 [US1] Update `apps/mobile/e2e/01-account-and-trip.yaml` and `03-globe.yaml` only where visible
      text changed; run both on iOS and Android; list each edit and its reason here (FR-037)
- [ ] T433 [US1] **Checkpoint: on-phone review.** Run quickstart section 3 and the testID parity test;
      the user approves or lists changes before phase 4 (SC-013)

---

## Phase 4: User Story 3 - Forms and sheets that feel native (P2)

**Goal**: every form is a native sheet with a handle, words-only errors and a primary action above the
keyboard.

**Independent Test**: open each form, focus the last field with the keyboard up, submit valid and invalid.

- [ ] T434 [P] [US3] Failing tests in `test/app/trip-and-modal-screens.test.tsx` then `app/modal/_layout.tsx`
      (`formSheet`, `sheetAllowedDetents`, anchor kept) and `app/modal/add-trip.tsx` using `Field`,
      `FormActions`, sideways currency row; fits one screen at the default size on 360 x 640 dp (FR-009;
      D4-06, 003 FR-017)
- [ ] T435 [P] [US3] `components/trip/currency-picker.tsx` and `components/trip/category-picker.tsx` onto
      `ChipGroup` with preserved ids `currency-<CODE>`, `currency-other` (tests in
      `src/features/trips/__tests__/trip-form.test.tsx` and `test/components/`) (FR-025, FR-037)
- [ ] T436 [US3] `app/modal/add-expense.tsx` and `components/trip/date-field.tsx`,
      `anchor-picker.tsx` onto the adapters; failing tests first in `test/app/us2-screens.test.tsx` (FR-009)
- [ ] T437 [US3] `components/trip/stop-editor.tsx` (`Modal`, `pageSheet` on iOS) and
      `city-picker.tsx` onto `Field`, search list and `FormActions`; failing tests in
      `test/components/city-picker.test.tsx` and `test/app/trip-and-modal-screens.test.tsx`; ids
      `stop-editor`, `stop-editor-place`, `stop-editor-change-city`, `stop-editor-arrive`,
      `stop-editor-depart` kept (FR-009, FR-037)
- [ ] T438 [US3] `components/trip/note-editor.tsx` as a form sheet; `FormActions` sticky above the keyboard
      with `react-native-keyboard-controller`; a keyboard-visibility test for each form (FR-009)
- [ ] T439 [US3] Update `e2e/01-account-and-trip.yaml` and `02-notes-and-expenses.yaml` where text changed;
      run on both platforms (FR-037)

---

## Phase 5: User Story 4 - The everyday screens (P2)

**Goal**: notes, spending, photos, documents and offline maps follow the shared list, grid and state
language.

**Independent Test**: each area with data, with none, while loading and with a forced error.

- [ ] T440 [P] [US4] Notes: failing tests in `test/app/us2-screens.test.tsx`; `app/trip/[id]/notes.tsx`,
      `components/trip/note-card.tsx`, `notes-header.tsx` (FR-015, FR-035)
- [ ] T441 [P] [US4] Spending: failing tests in `test/components/us2-components.test.tsx` for the summary
      card (total, category summary, rate date in words, tabular numerals) and rows (icon, right-aligned
      amount); `app/trip/[id]/expenses.tsx`, `components/trip/spending-summary.tsx`, `expense-row.tsx`,
      `expenses-header.tsx` (FR-014)
- [ ] T442 [P] [US4] Photos: failing tests in `test/app/photo-screen.test.tsx`; `app/trip/[id]/photos.tsx`,
      `components/trip/photo-tile.tsx`, `photo-viewer.tsx`, `photos-header.tsx`, `photo-status.tsx`; no
      tint or shadow across thumbnails, boundary where tones match (FR-015, FR-033)
- [ ] T443 [P] [US4] Documents: failing tests in `test/app/document-screens.test.tsx` and
      `document-screens-edges.test.tsx`; `app/trip/[id]/documents.tsx`, `document-view.tsx`,
      `document-capture.tsx`, `components/trip/document-list-item.tsx`, `document-details.tsx`,
      `document-confirm-form.tsx`, `document-camera*.tsx`, `document-image.tsx`, `documents-header.tsx`;
      capture keeps full-bleed camera with opaque controls (FR-015, FR-033)
- [ ] T444 [P] [US4] Offline maps: failing tests in `test/app/offline-maps.test.tsx`;
      `app/trip/[id]/offline-maps.tsx` with download-state chips and storage caption (FR-015)
- [ ] T445 [US4] Update `e2e/02-notes-and-expenses.yaml` and `05-photos-and-documents.yaml` where text
      changed; run on both platforms (FR-037)

---

## Phase 6: User Story 6 - First impression and profile (P3)

- [ ] T446 [US6] Welcome, Login, Register: failing tests in `test/app/auth-screens.test.tsx`;
      `app/(auth)/welcome.tsx`, `login.tsx`, `register.tsx`, `_layout.tsx` (native header with Back on Login
      and Register), `components/auth/provider-button.tsx`, `social-sign-in.tsx`, `google-sign-in-button.tsx`,
      `apple-sign-in-button.tsx` (FR-005, FR-017)
- [ ] T447 [US6] **Light security review** of the auth screens: `secureTextEntry`, `textContentType`,
      `autoComplete`, `autoCapitalize`, error mapping through `describeAuthError`, no field value logged or
      sent to Sentry; record the result here (AGENTS.md security gate)
- [ ] T448 [US6] Profile: failing tests in `test/app/tab-screens.test.tsx`;
      `app/(tabs)/profile/index.tsx` with `Avatar`, grouped rows, Sign out and Delete account set apart;
      `components/auth/sign-out-warning.tsx` restyled keeping the two choices (FR-016)
- [ ] T449 [P] [US6] `app/+not-found.tsx`, `components/ui/conflict-notice.tsx`,
      `components/sync/first-sync-gate.tsx`, `components/require-local-store.tsx` onto toast or alert and
      centred spinner states; tests in `test/components/sync-runtime-*.test.tsx` and
      `test/app/root-layout.test.tsx` (FR-035)
- [ ] T450 [US6] Update `e2e/00-smoke.yaml` and `01-account-and-trip.yaml` where text changed; run the full
      Maestro suite on both platforms (FR-037)

---

## Phase 7: Retire neumorphism (polish and cross-cutting)

- [ ] T451 Failing check first: `apps/mobile/test/no-neumorphism.test.ts` that searches `src/` for
      `surfaceStyle`, `PressableSurface`, `elevationProfile`, `treatment=`, `depth=` and the word
      "neumorphic" and fails on any hit; it is the executable form of SC-001 and fails until T452 to T455 are
      done
- [ ] T452 Delete `src/theme/surfaces.ts`, `elevation-profile.ts`, `hooks/use-surface.ts`,
      `components/ui/surface.tsx`, `pressable-surface.tsx`, `text-field.tsx`, `pill-group.tsx` and their
      tests (FR-038)
- [ ] T453 Remove the `treatment`, `depth`, `radius`, `pending` neumorphic props from
      `components/themed-view.tsx`; remove `Depth`, `LightSource`, `BorderHairline` uses that only served
      shadows, and the `shadowLight`, `shadowDark`, `surfaceSunk` keys from `constants/theme.ts`; delete
      `elevationProfile` and `prefersLessTransparency`-only branches that no longer apply from
      `hooks/use-appearance.ts` (keep the flag) (FR-038)
      **Also, when the last unmigrated screen moves:** `useAppearance().tokens` must switch from the
      two-theme `Colors` to the `Palette` for `themeName` (including `light-contrast` and
      `dark-contrast`). Until then unmigrated screens read `Colors[theme]` and ignore the increased-contrast
      palettes; only the kit-based screens follow `themeName`.
- [ ] T454 Rewrite `eslint.config.js` comments that cite 002 contract C1 to cite C4-1; update
      `apps/mobile/README.md` (dev-client rebuild for the new native modules, theme build, fonts)
- [ ] T455 Rename leftovers (`NeumorphicTabBar` references, test names, comments), remove the 002-only
      theme tests that assert deleted behaviour (`test/theme/elevation-profile.test.ts`,
      `adaptations.test.ts` parts), keep `contrast-gate.test.ts` and `globe-contrast-gate.test.ts`
- [ ] T456 Run `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile && npm run format:check`
      and the quickstart section 9 search; `T451` must now pass (SC-001, SC-004)

---

## Phase 8: User Stories 5 and 7 - Readable anywhere; controls that answer to the touch (P2, P3), and release gates

- [ ] T457 [US5] Appearance matrix sweep (quickstart section 5): every route in light, dark,
      increased contrast, largest text, reduced motion, reduced transparency; fix every clipped, untinted or
      left-behind element (FR-027, FR-028, FR-029, SC-007, SC-008)
- [ ] T458 [US5] VoiceOver and TalkBack pass (quickstart section 6): names, roles, states, order, actions on
      Trips, Trip, add-trip sheet, Profile and sign-in (FR-030, SC-009)
- [ ] T459 [US5] Outdoor and 5-second tests: shown stills, 95% identify what is tappable; 9 of 10 find each
      primary action in direct sunlight; record results (SC-009)
- [ ] T460 [US7] Feedback pass: pressed state within 100 ms on every control kind, busy, disabled,
      selection, save and destructive-confirmation haptics, none under reduced motion; failing tests in
      `components/ui/tappable.test.tsx` and `hooks/use-haptics.test.ts` extended where gaps show (FR-019,
      FR-020, FR-022, SC-005)
- [ ] T461 Performance and size: repeat T415's measurements; fix any regression (virtualisation, memoised
      rows, image recycling); report the bundle and font delta (SC-006, SC-011). Known follow-up: share ONE
      accessibility subscription across all consumers of `useAppearance` (a `useSyncExternalStore` store)
      before the list baseline: today each consumer (`useHaptics`, so every `Button`) runs its own
      `AccessibilityInfo` reads and listeners. `Tappable` and `Button` already read the font scale from
      `useWindowDimensions` and no longer call `useAppearance` themselves.
- [ ] T462 Re-run the 15 offline Maestro phases on two real devices and record them in
      `apps/mobile/e2e/offline/gate-evidence.md` (SC-010)
- [ ] T463 Final gates on the root and on a clean Windows install and the CI runners: `npm ci`,
      `npm run lint && npm run typecheck`, `npm run test:cov -w apps/mobile`,
      `npm run test -w packages/contracts`, `npm run test:unit -w apps/api` as a regression canary,
      `npm run format:check`; update `AGENTS.md` and this file's checkboxes; code review before merge
      (SC-004, SC-012)

---

## Dependencies and order

- Phase 0 then Phase 1, then Phase 2 (T410 to T425). T409 is a hard gate.
- Phase 3 depends on Phase 2; T426 and T427 first, then T428, T429 in parallel, then T430, T431, then
  T432 and the T433 checkpoint. **T433 gates Phase 4.**
- Phases 4, 5 and 6 are independent of each other once T433 passes and may be done in any order or in
  parallel by area; Phase 6's T447 follows T446.
- Phase 7 needs Phases 3 to 6 complete (no screen may still import the old primitives). T451 is written
  first and stays red until T452 to T455 are done.
- Phase 8 runs after Phase 7 (T457 to T460 may start per area after its phase).

## Parallel examples

- Phase 2 adapters T416 to T424 touch different files and run in parallel; T425 waits for them.
- Phase 5 areas T440 to T444 are independent.
- T428 (globe overlays) and T429 (trip cover read) are independent of each other.

## Implementation strategy

1. **First slice (P1)**: Phases 0 to 3 give the user the full "real app" feel on the screens used every
   day, in a state that already ships (unconverted screens are on-palette and flat).
2. **Incremental delivery**: each of Phases 4, 5 and 6 leaves the app consistent and releasable; no phase
   leaves a screen on a different set of colours or themes (D4-12).
3. **Stop conditions**: a failing spike check with no accepted workaround (T409) switches to the fallback;
   a contrast failure retunes the token, never the floor; a missing testID blocks the phase.

## FR coverage

| Requirement      | Tasks                                      |
| ---------------- | ------------------------------------------ |
| FR-001 to FR-004 | T410, T411, T413, T416, T418               |
| FR-005, FR-006   | T417, T418, T446                           |
| FR-007 to FR-010 | T408, T423, T426, T427, T434, T437, T438   |
| FR-011 to FR-013 | T429, T430, T431                           |
| FR-014 to FR-018 | T428, T440 to T444, T446, T448             |
| FR-019 to FR-022 | T413, T417, T422, T460                     |
| FR-023 to FR-030 | T405, T407, T410, T416 to T424, T457, T458 |
| FR-031, FR-032   | T406, T411, T412                           |
| FR-033, FR-034   | T418, T421, T428, T442, T443               |
| FR-035, FR-036   | T422, T425, T430, T449                     |
| FR-037           | T414, T432, T439, T445, T450               |
| FR-038           | T451 to T456                               |

Success criteria: SC-001 T451, T456; SC-002 T410; SC-003 T414, T432, T439, T445, T450; SC-004 T456,
T463; SC-005 T460; SC-006 T415, T461; SC-007 T457; SC-008 T457; SC-009 T458, T459; SC-010 T462;
SC-011 T415, T461; SC-012 T401, T463; SC-013 T433.
