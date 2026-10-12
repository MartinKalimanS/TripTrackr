---
description: 'Task list for Sunrise Passport UI'
---

# Tasks: Sunrise Passport UI

**Input**: Design documents from `/specs/005-sunrise-passport-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **MANDATORY.** Constitution Principle III requires test-first development (red, green, refactor)
and an 80% coverage floor in every workspace. Every implementation task below is preceded by its failing test,
written and observed failing first; the task line names both. Jest cannot judge how the look reads in daylight:
the tasks marked **[DEVICE]** can only be verified on a phone (list at the end).

**Organization**: grouped by phase; each phase names the git branch (and worktree) its tasks belong to so
parallel agents do not collide. Phase 2 gates everything; **T547, the first-slice owner review, gates Phase 7
onwards (SC-013)**.

## Format: `[ID] [P?] [Story] Description (FR-nnn; D5-nn)`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[DEVICE]**: verifiable only on a real phone
- **[Story]**: US1 to US8 from [spec.md](./spec.md); setup, foundation and polish tasks carry none
- A trailing `(FR-nnn; D5-nn)` names the requirement or decision the task satisfies

## Path Conventions

Mobile app: the `apps/mobile` workspace. Source under `apps/mobile/src/`, tests under `apps/mobile/test/` and
co-located `*.test.ts(x)`, end-to-end flows under `apps/mobile/e2e/`, per-app config (`jest.config.js`,
`eslint.config.js`, `metro.config.js`, `tsconfig.json`, `app.config.ts`) in `apps/mobile/`. Route files need
Prettier character classes (`AGENTS.md`).

## Rules that apply to every task

- Dependencies are added only in T502, with one root `npm install` and the lockfile committed; any other
  `package.json` edit is followed by `npm install` at the **root**. Never `npm install` inside a workspace.
- Do not touch `docs/travelappblueprint.md` or `docs/travelappfullspec.md`.
- Do not touch the globe's geometry, arcs, journey legs, statistics or camera zoom and pitch rules
  (`great-circle.ts`, `journey.ts`, `arc-features.ts`, `travel-stats.ts`, `camera.ts`); style, camera padding and
  layout around the globe may change (FR-082).
- No raw colour or gradient literal outside the token layer and `components/ui/scrim.tsx`; no Tier 3 control,
  not even an inert one (FR-009, FR-080).
- A task that changes a visible string a Maestro flow taps edits that flow in the same change and records it in
  "Maestro flow edits" at the end (FR-081).
- Each pure derivation (`globeFit`, `deriveStamp`, `composeTripList`, `passportTotals`, `spendingSummary`,
  `countrySummaries`) is a function under 50 lines with its own test file.
- Every new screen or derived view states its visibility posture in its pull request: **private, local, never
  transmitted, nothing new stored** (FR-084).

---

## Phase 0: Prerequisites (branch `feat/005-sunrise-passport-ui`)

- [x] T500 Create `feat/005-sunrise-passport-ui` from the tip of `feat/004-app-ui-redesign` after
      `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile` pass there; tag `pre-005-baseline`.
      Capture, from that tag: the baseline of every `testID` and accessible name (the existing
      `test/testid-parity` extractor), the list of strings the Maestro flows assert (spec, "Copy and label policy"),
      the release bundle size and font asset size, and, **[DEVICE]**, the scroll frame rate of a 200-trip list, a
      1,000-row expense list and a 1,000-photo grid on the oldest test device (FR-081; SC-003, SC-006, SC-011)
- [x] T501 Record the owner's answers to Q-1 to Q-10 of `plan.md` (or their defaults) in `research.md`; list
      feature 004's open device checks (research item V7) as carried and repeated in T547 and T566 (FR-081; D5-18)

---

## Phase 1: Dependencies, fonts, spikes (one rebuild; no product screen changes)

**Purpose**: land the one native batch and settle the unknowns the documentation cannot. Work on
`feat/005-deps-fonts` for T502 to T506; each spike is a throwaway branch `spike/005-<name>` that carries only
findings and config worth keeping. The seven checks are in
[research.md](./research.md#items-to-verify-empirically-device-spikes).

- [x] T502 Failing tests first: `adapter-guards` (the new packages importable only from `components/ui/**`,
      `components/navigation/**` and tests) and `test/config/app-config.test.ts` (the font entries). Then ONE root
      `npm install` with exact pins `expo-glass-effect` 57.0.3, `react-native-view-shot` 5.1.0 (if Q-6 is yes),
      `@expo-google-fonts/dm-sans` 0.4.2, `@expo-google-fonts/instrument-serif` 0.4.1, `phosphor-react-native`
      3.0.6, `react-native-zoom-toolkit` 5.1.1; re-run `npm view <pkg> time --json` for each (at least 7 days
      old), review install scripts, `npm audit`, `npm run doctor`, `npm ci --dry-run` on Windows; commit the
      lockfile; rebuild the Android and iOS dev clients ONCE (SC-012, SC-017; D5-19)
- [x] T503 [P] Jest mocks, with a failing suite that imports each module first: `expo-glass-effect`
      (`GlassView`, `isLiquidGlassAvailable`), `react-native-view-shot` (`captureRef`), `react-native-zoom-toolkit`,
      Phosphor deep imports; `transformIgnorePatterns` and `jest.setup.ts` (D5-19). _As built:_ one stand-in
      file each in `test/mocks/` (`expo-glass-effect`, `react-native-view-shot`, `react-native-zoom-toolkit`:
      `ResumableZoom` and `Gallery`), three one-line `jest.mock` entries in `jest.setup.ts`, pinned by
      `test/mocks/native-batch.test.tsx` (21 tests, observed red first). The glass is unavailable by default (as on
      Android); `captureRef` rejects an unlaid-out view as the native module does. Phosphor needs no stand-in:
      its deep path is `phosphor-react-native/src/icons/<Name>` (the only subpath its `exports` serves), added to
      `transformIgnorePatterns`; the bare package is refused under Jest by a `moduleNameMapper` entry
      (`test/stubs/phosphor-barrel.js`), so the 1,500-icon barrel is never loaded (D5-07).
- [x] T504 [P] Fonts: extend `test/theme/global-css.test.ts` first (every family name read from the font files, both
      spellings, no third Bricolage weight, six files in all); then the `expo-font` entries in `app.config.ts`
      (Bricolage 600 and 700, DM Sans 400, 600 and 700, Instrument Serif Italic 400) and the `global.css`
      variables with the `@variant ios` PostScript names (FR-004; D5-06). _As built:_ six variables in
      `global.css`: `--font-display` and `--font-display-bold` (Bricolage 600, 700), `--font-body`,
      `--font-body-semibold` and `--font-body-bold` (DM Sans 400, 600, 700) and `--font-serif` (Instrument Serif
      Italic 400); the classes are `font-display`, `font-display-bold`, `font-body`, `font-body-semibold`,
      `font-body-bold` and `font-serif`. Android answers to the file name (`DMSans_400Regular`, ...,
      `InstrumentSerif_400Regular_Italic`), iOS to the PostScript name (`DMSans-Regular`, `DMSans-SemiBold`,
      `DMSans-Bold`, `InstrumentSerif-Italic`). `app.config.ts` lists the six files by package specifier;
      `app-config.test.ts`, `global-css.test.ts` and `css-variable-stand-in.test.ts` were extended first. The
      kit's own `--font-normal` and the other three stay unset (the adapters decide, T518).
- [x] T505 [P] Failing `test/globe/basemap-config-keys.test.ts`: every `StyleImport` config key is in a literal
      allow-list taken from the provider's Standard documentation; `colorBoundaries` and `colorGreenspaces` are
      rejected; then the `basemap-config.ts` skeleton that satisfies it (SC-014; D5-04). _As built:_ the list is
      the 46 properties of `docs.mapbox.com/map-styles/reference/standard/`; the test also scans every inline
      `StyleImport` config in `src/` and pins which typed keys the package gets wrong. `basemap-config.ts` exports
      `BasemapConfigs` (`light` by day, `dark` by night) and `BasemapWorldScaleLabels`, typed so that a
      non-Standard key does not compile; the starting colours of C5-11 are in `constants/globe-basemap.ts`
      (outside the component lint scope; T532 folds them into `GlobeStyle` and wires the config in).
      `globe-view.tsx` is unchanged.
- [x] T506 Desk spike: with the packages installed, `npx expo export --platform android` and `--platform ios`
      bundle with the Sentry Debug ID present; the React Compiler compiles a throwaway screen using Phosphor,
      the glass mock and the zoom mock with no bail-out; the whole existing suite is green; record the result in
      research (SC-012; D5-19). _As built:_ pass; both exports bundle with the Debug ID, the compiler compiles 3
      functions with 0 bail-outs, the suite is 197 suites and 4,397 tests green; recorded in `research.md`,
      "Desk spike T506".
- [ ] T507 [DEVICE] V1 fonts: render the gallery's type specimen on iOS and Android; check the six faces load
      with both name spellings, `1111` and `0000` have equal widths in Bricolage with `tabular-nums` on iOS,
      the prototype's headings are within 3 percent of width with the tracking compensation of C5-7, and
      Dynamic Type and Android 200 percent scale every role; record the final tracking values in
      `typography.ts` and the result in research (FR-004, FR-074; D5-06)
- [ ] T508 [DEVICE] V2 globe style on a throwaway branch: `Atmosphere` overrides Standard's fog at globe zoom and
      `spaceColor` alpha 0 is or is not see-through; `MarkerView` on the far side of the globe; a hidden
      `view-shot` roundel (laid out at `left: -2000`) captures on both platforms and its colour fidelity;
      visited fill, keyline and gradient arcs read in day and night; decide roundels or the dots fallback
      (FR-010, FR-011; D5-04)
- [ ] T509 [DEVICE] V3 sheet: a throwaway `Sheet` over the live globe with a FlashList body on a mid Android phone
      and an iPhone: 60 fps while dragging (SC-006), scroll hand-off, `BackHandler` stepping, the camera padding
      and zoom keep the planet in the free band at 640 and 932 dp, no elevation problem over the `TextureView`;
      record frame rates (FR-012, FR-013; D5-03)
- [ ] T510 [DEVICE] V4 glass and the pill on an iOS 26 phone and an earlier iPhone: `GlassView` renders, the
      opacity-0 bug is avoided, fallbacks to `BlurView` and solid under reduced transparency and in the contrast
      themes; the Android bar's insets with gesture and three-button navigation (FR-022, FR-028; D5-05)
- [ ] T511 [DEVICE] V5 stamps and zoom: `<Image>` in an SVG `<Mask>` on both platforms (else `MaskedView`),
      `TextPath` in the embedded Bricolage, a 120-stamp list at 60 fps, and `react-native-zoom-toolkit` 5.1.1 on
      Reanimated 4.5.1 and Gesture Handler 2.32 (pinch, double-tap, swipe, pull to close) (FR-059, FR-046; D5-08,
      D5-13)
- [ ] T512 [DEVICE] V6 motion and images: `Link.AppleZoom` latency on the trip route (drop above about 400 ms),
      WEBP encoding through `expo-image-manipulator` on iOS (else JPEG 78), flag glyphs at 20 by 14 on both
      platforms, the Android haptic constants of the haptics map (FR-062; D5-09, D5-12, D5-14, D5-16)

---

## Phase 2: Foundation (blocking; no screen moves)

**Purpose**: the token source, the gate, the type and icon systems, the adapters and the gallery. After this
phase every screen still renders (it is on the new palette through `Colors`), but none has moved.

### Tokens and gate (branch `feat/005-tokens`, one agent)

- [x] T513 Failing tests first, written and observed red: `test/theme/palette.test.ts` (the new key set in all
      four themes; the amended invariants: `surface` is `#FFFFFF` in the light themes, `statusActive` equals
      `GlobeColors` where both exist); `test/theme/contrast-gate.test.ts` extended with every pair class P1 to
      P23 of `design-tokens.md` C5-4, the `FILL_BELOW_FLOOR` allowlist verified in both directions, the white
      photograph fixture for P8 to P11, the enumerated exemption list; `test/theme/gate-exemptions.ts` updated
      (FR-068, FR-069, FR-072; D5-22; SC-002)
      _As built:_ the gate is `test/theme/contrast-gate.test.ts` (it replaces 004's `palette-gate.test.ts`) over
      `palette-gate-support.ts` and `gate-exemptions.ts`: P1 to P23 per theme with their pair counts pinned, P8 to
      P11 over `WHITE_PHOTO`, `FILL_BELOW_FLOOR` and `DISPLAY_SIZE_ONLY` verified in both directions, the C5-3
      table reproduced; written red first (43 failing tests, two suites that could not load). See
      `contracts/design-tokens.md`, "As built (T513, T514)".
- [x] T514 Implement `palette.data.js` and `palette.ts` with the values of C5-3 and the new key set; re-point
      `Colors` (keys preserved) and the 004 aliases (`surfaceTertiary` to `pressed`, `separator` to `hairline`);
      extend `scripts/build-theme-css.mjs` and regenerate `generated/theme.css` (C5-6); retune any token the
      gate rejects, never a floor; update the tests that asserted Atlas values (FR-001, FR-002, FR-078, FR-079;
      D5-02, D5-22)
      _As built:_ 59 keys (the eight aliases are resolved from the key they equal), `scrim.ts` added, `theme.css`
      regenerated (32 kit and 41 app variables); five values retuned by the gate and recorded with their ratios
      (`dark-contrast` `danger`, `success`, `amberInk`; `light-contrast` `accentText`; the dark globe `active`
      start); `Colors` keeps its eight keys; five coral-derived pairs of the 004 adapters that fall short until
      T519 to T521 are enumerated and verified in both directions.
- [x] T515 [P] Type: failing `test/theme/typography.test.ts` (nine roles, three weights, every `tabularNumbers`
      role in a Bricolage family, the capped roles carry `maxFontSizeMultiplier` 1.3 and nothing else does, line
      heights exceed sizes) then `typography.ts`, `text.tsx` and the `ThemedText` shim (FR-004, FR-074; D5-06;
      Q-1)
      _As built:_ `TypeRoles` is a second table beside the 004 `TextRoles` (five role names collide with different
      sizes and 004 tests pin them); `Text variant="display|numeral|title|headline|callout|body|label|caption|eyebrow|accent"`
      selects it, `type` keeps the 004 roles. `numeral` and `eyebrow` are always capped at 1.3, `callout`, `label` and
      `caption` with `capped`. There is no `themed-text.tsx` (T452 retired it): the shim is `Text`'s 004 `type` path and
      `LegacyRoleMap`. The DM Sans and Instrument Serif classes await T504 in `global.css` (a list in `text.test.tsx`).
- [x] T516 [P] Shape and motion: failing `test/theme/shape.test.ts` and `motion.test.ts` (radii, space, lifts per
      theme, springs and durations of C5-9) then `shape.ts`, `motion.ts`, `Lift` and `IconSize` (FR-001, FR-003,
      FR-005, FR-027; D5-03)
      _As built:_ `Space`, `ScreenMargin`, `Radii` (not `Radius`: `constants/theme.ts` owns it), `cornerOf`,
      `innerRadius`, `Lift`, `liftOf`, `LiftElevation`, `IconSize`, `IconWeights`, and `Motion` extended with every row of
      C5-9 and the reduced-motion twins (`motionDuration`, `pressScaleOf`, `springOf`); the 004 tables are unchanged.
- [x] T517 Failing-first guards: `test/theme/atlas-values.test.ts` (the 004 palette literals, listed in
      `test/theme/atlas-values.ts`, found nowhere in `src/`; **stays red until T564**), the ESLint rule rejecting
      gradient strings outside `src/theme/` and `components/ui/scrim.tsx`, and the extension of
      `no-neumorphism.test.ts` for the Atlas-only treatments (FR-009, FR-083; SC-001)
      _As built:_ `atlas-values.test.ts` is **green from T514**, not red until T564: T514 re-pointed the palette, the
      globe colours and the comments, so no Atlas literal is left in `src/` and the guard stands as a regression test
      (a planted `#2456C7` fails it). The Atlas-only treatments (004 shape tables, the flat tab strip mark, the two
      004 text roles) are a ratchet in `no-neumorphism.test.ts` plus a strict zero test under `ATLAS_RETIREMENT=1`
      (red until T564, skipped otherwise); the ESLint rule has its cases in `boundary-rules.test.ts`.

### Adapters (each: failing test first in `apps/mobile/src/components/ui/*.test.tsx`)

- [ ] T518 [P] Branch `feat/005-adapters-core`. `Icon` registry over Phosphor (`icon-registry.ts`, about 60 deep
      imports, `regular`, `fill`, `duotone`, sizes 16, 20, 24, decorative by default, mirrored direction glyphs);
      a codemod from `{ ios, android }` names to registry keys at every call site; update `icon.test.tsx` and the
      tab-bar tests (FR-005; D5-07)
- [ ] T519 [P] `Button` (five variants, the primary edge ring, pressed fills, scale .97), `Tappable`, icon
      buttons (`default`, `tonal`, `ghost`, `glass`, `onSky`), the focus ring 2.5 dp with a 2 dp gap, busy and
      disabled semantics, haptics by variant; failing tests for labels, targets scaled by font scale, ring token,
      only `ink` on a pressed fill (FR-006, FR-063, FR-069, FR-071; D5-14; SC-005)
- [ ] T520 [P] `Chip`, `ChipGroup`, `SegmentedPill`, `StatusChip` (words Planning, Active, Past kept), `SyncChip`,
      `SyncBadge`, `FlagChip` (glyph in a clipped box, letters fallback), `PrivacyChip`; every existing id and
      text equivalent preserved (FR-055, FR-065, FR-070; D5-16; Q-3)
- [x] T521 [P] Branch `feat/005-adapters-surfaces`. `Card` (`lift`, `tile`, `flat`, `overMap`, `pending`),
      `ListGroup`, `ListRow`, `StatTile`, `AreaPill`, `Field` (56 dp, cream, 3:1 border, words and icon errors),
      `FormActions`, `InlineError`; nesting guard kept (FR-055, FR-069; D5-02)
      _As built:_ `Card` (`lift`, `tile`, `flat`, `overMap`, `pending`; the nesting guard kept) over the two `Lift` tokens
      (`lift.ts`), `ListGroup` as a cream tile and `ListRow` at 60 dp, `StatTile`, `AreaPill` (a tile `Card`), `Field` (56 dp,
      adapter-held focus ring, error and helper icons), `FormActions` and `InlineError`; written red first. The 004 tests that
      pinned Atlas classes are updated to the contract. See `contracts/components.md`, "As built (T521, T522)".
- [x] T522 [P] `Skeleton` shapes (`TripListSkeleton`, `TripDetailSkeleton`, `AreaSkeleton`, `HomeSkeleton`),
      `EmptyState` variants (`ghost-stamp`, `frames`, `plain`, `filtered`), `ErrorState`, `Banner`, `Toast` over
      the HeroUI toast, `PermissionState`; each skeleton ONE `progressbar`; failing tests for roles and states
      (FR-064, FR-065, FR-066, FR-067; D5-14)
      _As built:_ `skeleton.tsx` (`ShimmerGroup`, `Bone`, `PhotoBone`) and `screen-skeletons.tsx` (`TripListSkeleton`,
      `TripDetailSkeleton`, `AreaSkeleton`, `HomeSkeleton`, each ONE `progressbar`), `EmptyState` variants over `state-art.tsx`,
      `ErrorState`, `Banner`, `Toast` and `useToast` over the HeroUI Toast, `PermissionState`; the shimmer is still under
      reduced motion. See `contracts/components.md`, "As built (T521, T522)".
- [ ] T523 [P] Branch `feat/005-adapters-visual`. `Scrim` (the only gradient consumer) with `top`, `bottom`,
      `caption`, `sky` and a white-photograph contrast test; `GeneratedCover` (three palettes, `fnv1a32` pick);
      `Stamp` and `GhostStamp` (SVG, `TextPath`, baked wear mask, accessible label on the parent); `AnimatedNumber`
      (final value announced, final text under reduced motion); `useHaptics` semantic map (FR-007, FR-008, FR-060,
      FR-062, FR-076; D5-08, D5-10, D5-11, D5-14; Q-7)
- [ ] T524 Dev gallery `app/(dev)/gallery.tsx` behind a `Stack.Protected` `__DEV__` guard: every adapter in four
      themes at font scale 1 and 2, a numerals row, skeletons, the sheet detents, stamps and scrims over the
      white-photograph fixture; the `assertScreenshot` harness and `e2e/__baselines__/` (D5-18)
- [ ] T525 Foundation gate: `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile`,
      `npm run theme:check -w apps/mobile` (a clean `theme.css`), the testID parity test; merge groups A, B1, B2
      and B3; no screen moved (SC-004; D5-02)

---

## Phase 3: Chrome (branch `feat/005-chrome`) — User Stories 1 and 6

- [ ] T526 [US1] Failing `test/components/tab-bar.test.tsx` (pill geometry, ids `tab-bar`, `tab-<name>`,
      `tab-mark-<name>` on the selected capsule, roles `tablist` and `tab`, selected state, targets 44 and 48,
      labels wrap and the pill grows, `tabSurface()` choice for every flag combination, no opacity animation on the
      glass); then the pill with `tab-surface.tsx` (glass, blur, solid), the capsule spring and
      `BottomTabBarHeightCallbackContext` (FR-022, FR-023, FR-027; D5-05; Q-10). **[DEVICE]** part is T510
- [ ] T527 [P] [US1] Android navigation bar `android-nav-bar.tsx` (64 dp plus inset, 56 by 32 indicator, hairline,
      no blur), the rounded-square FAB shape and the 32 by 4 handle as shared tokens; failing tests first
      (FR-022, FR-028; D5-05, D5-21)
- [ ] T528 [P] [US1] Headers: `useStackHeaderOptions` restyled (large title in `display` on iOS for Trips and You,
      standard on Android), `HeaderBackButton` as a round cream control and a `glass` variant for the trip hero,
      transparent trip header, the `useHeroCollapse(scrollY)` hook; failing tests for the options per platform
      and the name "Back" (FR-025; D5-12)
- [ ] T529 [P] [US6] Sync: failing `use-sync-chip-state.test.ts` (dirty-row count over the seven tables, network,
      runtime status to `SyncChipState`), then `features/sync/use-sync-chip-state.ts`, the chip and `Banner`
      wiring, and the per-record marker (read-only; nothing written) (FR-026, FR-065; D5-17)
- [ ] T530 [US1] Tabs layout: label "You" (id unchanged), scenes extend under the pill, content insets from the
      pill height, a bottom fade; update `tabs-layout` and `tab-screens` tests and the accessible-name baseline
      with the deliberate label change (FR-023, FR-024, FR-081)

---

## Phase 4: Home (branches `feat/005-home-globe` and `feat/005-home-sheet`) — User Stories 1, 6 and 8

**Purpose**: the signature screen, reviewed first. The globe's geometry is untouched.

- [ ] T531 [P] [US1] Failing `test/features/globe-fit.test.ts` (peek radius `clamp((band − 24) / 2, 110, 175)`,
      other detents `clamp(0.95 × band, 150, 286)`, padding, `zoomDelta` clamped to `minZoomLevel`, at least 220 dp
      of free space and 20 dp of margin at peek for window heights 640 to 932) then `features/globe/globe-fit.ts`
      (FR-013; D5-03; SC-018)
- [ ] T532 [P] [US1] Globe style (branch `feat/005-home-globe`): failing tests (filter built with the worldview
      clause, allow-listed config keys from T505, gradient stops measured by the globe gate, graticule geometry,
      stand-in tags) then `GlobeColors` stops and `GlobeStyle`, `basemap-config.ts`, `AtmosphereLayer`,
      `VisitedCountriesLayer`, `GraticuleLayer`, `GradientArcLayer`; extend
      `test/theme/globe-contrast-gate.test.ts` first (FR-010, FR-082; D5-04, D5-22; SC-014)
- [ ] T533 [P] [US1] Pins: failing tests (status rank order, dots beyond about 60, callout side flip, still under
      reduced motion, announced once) then `RoundelLayer`, the `CircleLayer` fallback and `ActiveCallout` (ONE
      `MarkerView` with pulse rings); the shared hit source and `tripIdFromPress` unchanged (FR-011; D5-04)
- [ ] T534 [US1] Branch `feat/005-home-sheet`. Failing `ui/sheet.test.tsx` with `fireGestureHandler` (nearest
      detent by velocity, rubber band, body scroll hand-off, `adjustable` handle with increment and decrement and
      `accessibilityValue`, `BackHandler` stepping, one settle callback, selection haptic, no per-frame JS), then
      `components/ui/sheet.tsx` and `detentHeight()`; **[DEVICE]** 60 fps is T509 (FR-012, FR-017, FR-027; D5-03;
      SC-005)
- [ ] T535 [US1] Failing tests then `components/home/`: `GreetingHeader` (date, "Hello, _name_", the serif
      accent), `StatsRow` (three `StatTile`s, `globe-stat-countries` text is the plain number, stacked at font
      scale 1.15 and above, `AnimatedNumber` final label), `NowCard`, `NextRow`, the peek content; figures follow
      the device locale (FR-014, FR-015, FR-060, FR-077; D5-11)
- [ ] T536 [US1] Failing `features/passport/country-summary.test.ts` (grouping by continent, trips per country, first
      and last visit, `isNow`, `focus` bounds, unknown continents never counted, the numerator equals
      `travelSummary`) then `country-summary.ts`, `CountriesList` (ring, search, sticky continent headers,
      FlashList, no-results), `CountryRow` (press lowers the sheet to half and flies the globe), screen-reader
      row names (FR-016, FR-017, FR-084; D5-17; Q-2)
- [ ] T537 [US1] Home integration: camera padding and zoom on each settle (`globeFit`, 280 ms), logo and
      attribution offsets, `PlanTripFab` and its rules (hidden at full and with no trips), recentre control after
      the camera moved, `useIdleSpin` with every stop condition, `useGlobeActions` (next trip, previous trip,
      recentre, open countries), `InvitationCard` with three empty frames, `HomeSkeleton`, offline and error
      `Banner`s, the unreadable-store notice; failing tests for each rule using the Mapbox stand-in and a spied
      `setInterval`. **[DEVICE]** visual check is T547 (FR-013, FR-017, FR-018, FR-019, FR-020, FR-021; D5-03,
      D5-04; Q-8)
- [ ] T538 [US1] Update and run `03-globe` and `04-zoom` (and `offline/14-*`) against the new Home; record any edit in
      "Maestro flow edits"; ids `globe-stats`, `globe-stat-countries`, `globe-stat-distance`, `globe-empty-state`,
      `globe-notice`, `home-plan-trip`, `home-add-stop`, `home-open-trips` unchanged (FR-081, FR-082; SC-003, SC-014)

---

## Phase 5: Trips (branch `feat/005-trips`) — User Story 2

- [ ] T539 [P] [US2] Failing `features/trips/trip-sections.test.ts` (hero is the earliest-arrival active trip; the
      ticket is the earliest-start planning trip; rows by year newest first with totals; no-stop trips under "No
      dates yet"; filter before composition; `dayOf`, `daysToGo`, strip dots; the cover rule then generated
      palette) then `trip-sections.ts` and the `useTrips` card model (FR-030, FR-034, FR-035; D5-17)
- [ ] T540 [P] [US2] Failing tests then `TripHeroCard`, `TicketCard` (stacks at font scale 1.15), `TripRow`,
      `StopStrip`, `YearHeader`, `YearScrubber` (adjustable); ids `trip-card-<id>` with the label "title,
      status, N stops" and the 004 sub-ids kept (FR-031, FR-032, FR-033, FR-034; D5-10)
- [ ] T541 [US2] Trips screen: failing tests then the mixed FlashList (`getItemType`), `SegmentedPill` filter with
      counts, header count, `PlanTripFab` ("Plan a trip" on both platforms; `trips-plan-trip` unique), sync chip,
      `TripListSkeleton`, filtered-empty, empty "No trips yet", error and offline `Banner`s, bottom padding past
      the pill and the FAB; 200-trip fixture test (FR-029, FR-035, FR-036, FR-024; D5-12; Q-4)
- [ ] T542 [US2] Run `01-account-and-trip`, `02-notes-and-expenses` and `05-photos-and-documents` through Trips;
      record any edit in "Maestro flow edits" (FR-081; SC-003)

---

## Phase 6: Trip detail (branch `feat/005-trip-detail`) — User Story 3

- [ ] T543 [P] [US3] Failing tests then `TripHero` (parallax, bottom-anchored two-line title that grows upward,
      eyebrow with `FlagChip`, `scrim.top` and the caption scrim, `trip-title` kept), `CollapsedBar`, `ProgressRow`
      with "Day N of M" and dots; the title stays visible at font scale 2 (FR-037, FR-038, FR-007; D5-10, D5-12)
- [ ] T544 [P] [US3] Failing `features/trips/trip-days.test.ts` then `trip-days.ts`, `AreasStrip` (four `AreaPill`s,
      counts and spending total, lock marks, one privacy line from the existing copy, the Offline maps row,
      2 columns at scale 1.15), `DayChips` (select, pin, hidden with no stops); ids `trip-links` and
      `trip-open-*` kept (FR-039, FR-040; D5-17)
- [ ] T545 [P] [US3] Failing tests then `StopRow` with the spine (node states, solid and dotted segments),
      `TransitRow` (great-circle km, omitted when a stop is unplaced), city thumbnails, "Now" chip,
      `AddStopRow`; per-stop controls and `accessibilityActions` kept with every id (FR-041; D5-17)
- [ ] T546 [US3] Trip screen assembly and states: zero stops (`GhostStamp`, "No stops yet", "Add stop"), loading
      `TripDetailSkeleton`, offline and error `Banner`s with the `warn` Photos tile and Retry, generated cover;
      run `01-account-and-trip` and `03-globe` trip steps; record edits (FR-042, FR-043, FR-025, FR-081)
- [ ] T547 [DEVICE] **First-slice owner review (SC-013)**: build a dev client; on one iPhone and one Android phone
      walk Home (all three sheet positions, empty, loading, offline), Trips (mixed, 200+, no cover) and a trip in
      light, dark, increased contrast and at the largest text size, with the Android navigation bar; run the
      appearance matrix of the quickstart on these screens; repeat 004's open checks (V7). The owner approves or
      lists changes; **Phases 7 and 8 do not start before approval** (D5-01, D5-18; SC-009, SC-013)

---

## Phase 7: Everyday areas and forms (after T547; five parallel branches) — User Stories 4 and 5

- [ ] T548 [US4] Branch `feat/005-areas-shared` (merged first). Failing tests then `AreaHeader` (Back, title,
      subtitle, `PrivacyChip`), `AreaFab` (hides with the keyboard), the area skeletons and empty states with the
      existing strings (FR-044, FR-064; D5-14)
- [ ] T549 [P] [US4] Branch `feat/005-areas-photos`. Failing tests (grouping by day, mosaic geometry and `+N`,
      each upload state, the summary line, no overlay on a thumbnail, viewer controls kept) then `DayHeader`,
      `PhotoMosaic`, `UploadState`, `UploadSummary`, the `PhotoViewer` adapter over the zoom toolkit with
      progressive loading; ids kept; `05-photos-and-documents` and `offline/06-*` (FR-045, FR-046, FR-081; D5-09,
      D5-13)
- [ ] T550 [P] [US4] Branch `feat/005-areas-expenses`. Failing `features/expenses/spending-summary.test.ts` (exact
      `decimal.js` sums, per-day and per-category totals, pending conversions counted and excluded, average per
      day, no `Number` on an amount) then `spending-summary.ts`, `SpendingHero`, `DayBars`, `CategoryBar`,
      `ExpenseRow`, and the amount-first Add expense sheet with the keyboard test; `02-notes-and-expenses`
      (FR-047, FR-054; D5-15)
- [ ] T551 [P] [US4] Branch `feat/005-areas-notes`. Failing tests then `NoteCard` and the note editor sheet with
      Cancel and Save (no autosave), keyboard test; `02-notes-and-expenses` (FR-048; D5-14)
- [ ] T552 [P] [US4] Branch `feat/005-areas-documents`. Failing tests then `DocumentTicket` (three kinds: boarding
      pass, booking, other), the viewer with the barcode on a white plate, `PrivacyChip` and the existing privacy
      line, `OfflineCityCard` and `StorageBar`; screen-capture protection unchanged;
      `05-photos-and-documents` (FR-049, FR-050; D5-17)
- [ ] T553 [P] [US5] Branch `feat/005-areas-forms`. Failing keyboard-visibility tests then the `FormSheet` look (28 dp
      radius, handle, Cancel in ink), New trip with name and currency only, the stop editor with `RoutePreview`
      and `NightsStepper` over the unchanged date fields, the city picker with flag chips; `01-account-and-trip`
      date-picker taps and `03-globe` (FR-051, FR-052, FR-053, FR-055; D5-16)

---

## Phase 8: Welcome, sign-in, You, delight (branch `feat/005-auth-you`) — User Stories 7 and 8

- [ ] T554 [P] [US7] Failing tests then Welcome: sky `Scrim`, the turning globe (static under reduced motion,
      `useIdleSpin` at world scale), the 28 dp sheet with the existing tagline (one nested accent word) and the
      two buttons; `01-appearance` (FR-056, FR-019; D5-04; Q-5)
- [ ] T555 [P] [US7] Sign in and Create account restyle: failing tests for the thumb-zone primary, words-and-icon
      errors and the unchanged `secureTextEntry`, `textContentType`, `autoComplete`; a light security review
      (error mapping and logging unchanged); `00-smoke`, `offline/00-a-setup-account` (FR-057)
- [ ] T556 [P] [US7] Failing `features/passport/stamp-spec.test.ts` (200 or more country and date pairs give the same
      stamp twice, fixed shape, ink, rotation between −8 and 8, wear and perforation by the hash rules), then
      `passport-totals.test.ts` (period membership by first arrival, continents excluding Unknown, lap fraction)
      then `stamp-spec.ts`, `passport-totals.ts` (FR-058, FR-059, FR-084; D5-08, D5-17; SC-016)
- [ ] T557 [US7] You screen: failing tests then identity ("Traveller since" from the account's creation year),
      `PeriodSwitch`, `PassportCard`, `StampsPage` (rasterised past about 100 stamps), the Account and App groups,
      Sign out and Delete account set apart with the guard unchanged; `offline/11-*`; a 120-stamp scroll test
      (FR-058, FR-059, FR-081; D5-08; Q-2)
- [ ] T558 [US8] Delight: failing tests then count-up trigger policy once per appearance, the stamp landing for
      stamps earned in the last 7 days once per session with the heavy haptic, the live pin pulse, selection
      haptics on detent, tab and chip; nothing under reduced motion (FR-060, FR-061, FR-062; D5-11, D5-14)

---

## Phase 9: States, accessibility, text scale, themes, baselines (branch `feat/005-sweeps`) — User Story 6

- [ ] T559 [US6] State sweep: every route has loading, empty and error to one standard; camera and photographs
      denial screens; filtered-empty and no-results; a test that fails on a screen state with no handler for any
      control and on any Tier 3 control (FR-064, FR-066, FR-080; D5-14)
- [ ] T560 [US6] Accessibility sweep: names, roles, states and order unchanged for every pre-existing control
      (the parity test and an order test per screen), decorative art hidden, animated figures announce the final
      value, locale formats for figures, dates, plurals and units, the globe's actions and the Countries list reach
      every country and trip (a test over a 30-country fixture). **[DEVICE]** VoiceOver and TalkBack walks of Home,
      Trips, a trip and You (FR-070, FR-075, FR-076, FR-077, FR-080; SC-015)
- [ ] T561 [US6] Text-scale sweep: reflow tests at scale 1, 1.15, 1.5 and 2 for Home figures, areas, ticket, passport
      grid, tabs, hero title; no fixed heights remain. **[DEVICE]** iOS largest accessibility size and Android
      200 percent on every screen in four themes (FR-074; SC-007)
- [ ] T562 [US6] Theme, motion and transparency sweep: four themes on every screen, the contrast themes opaque (no
      glass or blur), reduced motion removes rotation, pulse, count-up, stamp landing, shimmer and haptics, reduced
      transparency; a test that no translucent surface renders under either flag. **[DEVICE]** live switching
      with the app open (FR-073, FR-078, FR-079; SC-008)
- [ ] T563 [US6] Baselines compared: the frame rates of T500 and the sheet drag (SC-006), release bundle and font
      size against `pre-005-baseline` (over 1 MB reviewed, SC-011), press feedback within 100 ms and settle within
      300 ms (FR-027, FR-081; SC-005, SC-006, SC-011). **[DEVICE]**

---

## Phase 10: Retire Atlas

- [ ] T564 Remove every Atlas palette value, the flat tab strip code, the Atlas-only adapters and the 004 aliases that
      nothing uses; `test/theme/atlas-values.test.ts` turns green; the neumorphism search stays empty (FR-083;
      SC-001)
- [ ] T565 Docs as built: `AGENTS.md` (the look, the chrome, the libraries), `research.md` spike results, the
      amendments of 003 and 004 pointing at their final state, the as-built notes of the contracts (FR-083; D5-20)

---

## Phase 11: Device gates, Maestro, reviews

- [ ] T566 [DEVICE] Full Maestro run (`npm run e2e -w apps/mobile`) on an iOS and an Android device; `assertScreenshot`
      baselines for 8 to 12 hero screens (Home three positions, Trips, Trip, Photos, Spending, You, Welcome, a
      sheet); every flow edit listed below (FR-081; SC-003; D5-18)
- [ ] T567 [DEVICE] Re-run the 15-row offline-synchronisation gate on two real devices and record it in
      `apps/mobile/e2e/offline/gate-evidence.md` (FR-065, FR-081; SC-010)
- [ ] T568 Clean `npm ci` and the full checks on Windows and the first CI run of the branch; coverage at least 80% in
      every workspace; the privacy and API suites unaffected (D5-19; SC-004, SC-012)
- [ ] T569 Code review and a security review of the derived views (no path by which expenses or documents reach a
      shareable surface; nothing transmitted; nothing stored) and of the sign-in restyle (FR-084, FR-080)
- [ ] T570 [DEVICE] Final owner review on a phone in both themes, at the largest text size and with increased
      contrast; first-time-viewer test of Home, Trips and a trip (95 percent identify what is tappable; 9 of 10
      find the primary action in sunlight) (D5-01; SC-009, SC-013)

---

## Dependencies and order

- Phase 0, then Phase 1 (T502 first; T503 to T505 in parallel; T506; the spikes T507 to T512 need the rebuilt dev
  client and may run in parallel on different devices).
- Phase 2: T513 first (red), then T514, then T515 and T516 in parallel, T517 any time after T513; adapters
  (T518 to T523) after T514 to T516, in three parallel branches; T524 after T518 to T523; T525 merges them.
- Phases 3, 4, 5 and 6 depend on T525 and are independent of each other (groups C, D1, D2, E, F run in parallel);
  within Phase 4, T531 precedes T537 and T534 precedes T535 to T537.
- **T547 gates Phases 7 and 8.** Phase 7's tasks T549 to T553 and Phase 8's tasks are independent branches after
  T548 (shared header) is merged.
- Phase 9 needs Phases 7 and 8 merged; Phase 10 needs Phase 9; Phase 11 needs Phase 10 (T567 may start once all
  screens are merged).

## Parallel examples

- Phase 2 adapters: T518 to T520 (core), T521 and T522 (surfaces), T523 (visual) touch different files.
- Phase 4: T531, T532 and T533 are independent; the sheet (T534) does not wait for them.
- Phase 7: T549 to T553 are independent areas.
- Phase 1 spikes T507 to T512 are independent devices and topics.

## Implementation strategy

1. **First slice (Phases 0 to 6, ending in T547)**: the owner sees Home, Trips and a trip on a phone before
   anything else is converted. Unconverted screens are already on the new palette through `Colors` and are
   coherent, if plainer.
2. **Incremental delivery**: each of Phases 7 and 8 leaves the app releasable; no phase leaves a screen on a
   different set of colours or themes.
3. **Stop conditions**: a failing spike with no accepted workaround switches to its fallback (roundels to dots,
   glass to solid, zoom toolkit to a custom viewer, statics to instanced fonts); a contrast failure retunes the
   token, never the floor; a missing `testID` blocks the phase; a Tier 3 control blocks the merge.

## Tasks that can ONLY be verified on a device

T500 (frame rates), T507 (fonts and `tnum`), T508 (globe style, roundels), T509 (sheet at 60 fps), T510 (glass,
the Android bar), T511 (stamps in a mask, the zoom toolkit), T512 (Apple zoom, WEBP, flags, haptics), T547 (first
slice), T560 (VoiceOver and TalkBack), T561 (largest text), T562 (live theme and motion switching), T563
(baselines), T566 (Maestro and screenshots), T567 (two-device offline gate), T570 (final review). Their desk parts
(a failing test, a mock, a bundle) are inside the task lines above.

## Maestro flow edits

Recorded here as made (feature 004 recorded them the same way). None is expected: the flows tap identifiers, and
the one label change ("Profile" to "You") is not tapped by text.

| Task         | Flow | Edit | Reason |
| ------------ | ---- | ---- | ------ |
| _(none yet)_ |      |      |        |

## FR coverage

| Requirement      | Tasks                                                            |
| ---------------- | ---------------------------------------------------------------- |
| FR-001           | T514, T516                                                       |
| FR-002           | T514                                                             |
| FR-003           | T516                                                             |
| FR-004           | T504, T507, T515                                                 |
| FR-005           | T516, T518                                                       |
| FR-006           | T519                                                             |
| FR-007           | T523, T543                                                       |
| FR-008           | T523                                                             |
| FR-009           | T517                                                             |
| FR-010           | T508, T532                                                       |
| FR-011           | T508, T533                                                       |
| FR-012           | T509, T534                                                       |
| FR-013           | T509, T531, T537                                                 |
| FR-014, FR-015   | T535                                                             |
| FR-016           | T536                                                             |
| FR-017           | T534, T536, T537                                                 |
| FR-018           | T537                                                             |
| FR-019           | T537, T554                                                       |
| FR-020, FR-021   | T537                                                             |
| FR-022           | T510, T526, T527                                                 |
| FR-023           | T526, T530                                                       |
| FR-024           | T530, T541                                                       |
| FR-025           | T528, T546                                                       |
| FR-026           | T529                                                             |
| FR-027           | T516, T526, T534, T563                                           |
| FR-028           | T510, T527                                                       |
| FR-029           | T541                                                             |
| FR-030           | T539                                                             |
| FR-031 to FR-033 | T540                                                             |
| FR-034           | T539, T540                                                       |
| FR-035           | T539, T541                                                       |
| FR-036           | T541                                                             |
| FR-037, FR-038   | T543                                                             |
| FR-039, FR-040   | T544                                                             |
| FR-041           | T545                                                             |
| FR-042, FR-043   | T546                                                             |
| FR-044           | T548                                                             |
| FR-045           | T549                                                             |
| FR-046           | T511, T549                                                       |
| FR-047           | T550                                                             |
| FR-048           | T551                                                             |
| FR-049, FR-050   | T552                                                             |
| FR-051 to FR-053 | T553                                                             |
| FR-054           | T550                                                             |
| FR-055           | T520, T521, T553                                                 |
| FR-056           | T554                                                             |
| FR-057           | T555                                                             |
| FR-058           | T556, T557                                                       |
| FR-059           | T511, T556, T557                                                 |
| FR-060           | T523, T535, T558                                                 |
| FR-061           | T558                                                             |
| FR-062           | T512, T523, T558                                                 |
| FR-063           | T519                                                             |
| FR-064           | T522, T548, T559                                                 |
| FR-065           | T520, T522, T529, T567                                           |
| FR-066           | T522, T559                                                       |
| FR-067           | T522                                                             |
| FR-068           | T513                                                             |
| FR-069           | T513, T519, T521                                                 |
| FR-070           | T520, T560                                                       |
| FR-071           | T519                                                             |
| FR-072           | T513                                                             |
| FR-073           | T562                                                             |
| FR-074           | T507, T515, T561                                                 |
| FR-075           | T560                                                             |
| FR-076           | T523, T560                                                       |
| FR-077           | T535, T560                                                       |
| FR-078, FR-079   | T514, T562                                                       |
| FR-080           | T559, T560, T569                                                 |
| FR-081           | T500, T501, T530, T538, T542, T546, T549, T557, T563, T566, T567 |
| FR-082           | T532, T538                                                       |
| FR-083           | T517, T564, T565                                                 |
| FR-084           | T536, T556, T569                                                 |

Success criteria: SC-001 T517, T564; SC-002 T513; SC-003 T500, T538, T542, T566; SC-004 T525, T568; SC-005 T519, T534, T563; SC-006 T500, T509, T563; SC-007 T561; SC-008 T562; SC-009 T547, T570; SC-010 T567; SC-011 T500, T563; SC-012 T502, T506, T568; SC-013 T547, T570; SC-014 T505, T532, T538; SC-015 T560; SC-016 T556; SC-017 T502; SC-018 T531.

## Decision coverage

| Decision | Tasks                                          |
| -------- | ---------------------------------------------- |
| D5-01    | T547, T570                                     |
| D5-02    | T514, T521, T525                               |
| D5-03    | T509, T516, T531, T534, T537                   |
| D5-04    | T505, T508, T532, T533, T537, T554             |
| D5-05    | T510, T526, T527                               |
| D5-06    | T504, T507, T515                               |
| D5-07    | T518                                           |
| D5-08    | T511, T523, T556, T557                         |
| D5-09    | T512, T549                                     |
| D5-10    | T523, T540, T543                               |
| D5-11    | T523, T535, T558                               |
| D5-12    | T512, T528, T541, T543                         |
| D5-13    | T511, T549                                     |
| D5-14    | T512, T519, T522, T523, T548, T551, T558, T559 |
| D5-15    | T550                                           |
| D5-16    | T512, T520, T553                               |
| D5-17    | T529, T536, T539, T544, T545, T552, T556       |
| D5-18    | T501, T524, T547, T566                         |
| D5-19    | T502, T503, T506, T568                         |
| D5-20    | T565                                           |
| D5-21    | T527                                           |
| D5-22    | T513, T514, T532                               |
