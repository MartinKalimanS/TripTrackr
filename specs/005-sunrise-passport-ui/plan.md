# Implementation Plan: Sunrise Passport UI

**Branch**: `feat/005-sunrise-passport-ui` (documents on `docs/005-sunrise-passport-spec`) | **Date**: 2026-10-12 |
**Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-sunrise-passport-ui/spec.md`

## Summary

Replace the rejected Atlas look with **Sunrise Passport** and re-lay out every screen around it: a sunlit
globe with a three-position sheet (the full position is the Countries list, the globe's accessible twin), a
floating tab pill, trips as pictures (hero, ticket, rows), a trip as a journey (hero, day strip, spine
timeline), countries as deterministic passport stamps, and one set of tokens measured by an extended contrast
gate. The globe's geometry, journey and statistics are untouched; only its style, camera padding and layout
change. No capability, record, permission, synchronisation rule or privacy rule changes.

Five moves, each de-risked by an earlier one:

1. **Branch from 004 and keep its architecture.** Tokens, adapters, headers, form sheets, gates and testID
   parity are reused (research D5-02). The work is values, layouts and a handful of new components.
2. **Tokens and the gate first.** The extended contrast gate (C5-4) and the Atlas-value search (SC-001) are
   written before the palette changes; a failing pair retunes a token, never a floor (D5-22).
3. **One native batch, then spikes.** `expo-glass-effect`, `react-native-view-shot` (spike-gated), two font
   packages and their font entries land in ONE dev-client rebuild (D5-19, SC-017); six device spikes (V1 to V6)
   then settle the unknowns the documentation cannot (research, "Items to verify").
4. **The first slice is reviewed on a phone before anything else is converted.** Home (all three sheet
   positions), Trips and a trip, in both themes, at the largest text size and with increased contrast: SC-013,
   the lesson of Atlas.
5. **Migrate by area, retire Atlas last.** Chrome, Home, Trips, Trip; then everyday screens and forms; then
   sign-in and You; then the sweeps; the Atlas values and the flat strip are removed in the final phase.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, React 19.2.3, React Native 0.86.3 (New Architecture), Expo SDK ~57.0,
`expo-router` ~57.0 (typed routes), React Compiler enabled.

**Primary Dependencies (existing, reused)**: `@rnmapbox/maps` 10.3.5, `heroui-native` 1.0.10, `uniwind` 1.12.0,
`tailwindcss` 4.3.3, `react-native-reanimated` 4.5.1, `react-native-worklets` 0.10.1,
`react-native-gesture-handler` ~2.32, `react-native-svg` 15.15.4, `react-native-screens` ~4.26,
`react-native-safe-area-context`, `react-native-keyboard-controller`, `expo-image`, `expo-image-manipulator`,
`expo-blur`, `expo-haptics`, `expo-font`, `@expo-google-fonts/bricolage-grotesque` 0.4.1,
`@shopify/flash-list` 2.0.2, `decimal.js`, `date-fns`.

**New Dependencies (pinned, installed once in T502, publish dates in research D5-19)**: `expo-glass-effect`
57.0.3, `react-native-view-shot` 5.1.0 (spike-gated), `@expo-google-fonts/dm-sans` 0.4.2,
`@expo-google-fonts/instrument-serif` 0.4.1, `phosphor-react-native` 3.0.6, `react-native-zoom-toolkit` 5.1.1.

**Storage**: none added. Every new view is derived from local rows (data-model); there is no schema change,
no preference store and no cache table (derivative images and placeholders live in the app cache directory).

**Testing**: Jest (`jest-expo`) with `@testing-library/react-native`; the 80% floor in
`apps/mobile/jest.config.js`; the extended contrast gate; the testID parity test against `pre-005-baseline`;
Maestro flows under `apps/mobile/e2e/` plus `assertScreenshot` on 8 to 12 hero screens; a dev gallery route;
a manual on-device review per phase; six device spikes.

**Target Platform**: iOS and Android dev-client builds. No web (001 D-14). Portrait phones.

**Project Type**: Mobile application, the `apps/mobile` workspace of the npm-workspaces monorepo.

**Performance Goals**: press feedback within 100 ms, the sheet and pill settled within 300 ms, in-place changes
within 200 ms (SC-005); the Home sheet drag at the baseline frame rate of the oldest device with the globe
rendering, and no scroll regression on 200 trips, 1,000 expense rows or 1,000 photographs (SC-006); added size
measured, over 1 MB triggers review (SC-011).

**Constraints**: WCAG AA floors (4.5:1 text, 3:1 controls and focus), 7:1 under increased contrast; white text
on a white photograph at 4.5:1; largest text size without clipping; no state by colour alone; the pending-sync
marker; every pre-existing control keeps its accessible name and identifier (FR-081); no raw colour or gradient
literal; offline-first (fonts, icons and every asset bundled, nothing fetched at runtime); the globe stays ONE
`MapView`; quality bar (functions under 50 lines, files under 800, nesting under 4, no debug output).

**Scale/Scope**: about 22 routes, about 75 components (about 25 new), about 230 `testID`s to preserve, about 490
Maestro `id:` references, 8 user stories, 84 functional requirements, 18 success criteria, tasks T500 to T570.

## Constitution Check

_GATE: passed before Phase 0; re-checked after Phase 1 design._

| Principle                     | Posture                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Privacy is structural      | No table, endpoint or screen reads traveller data in a new way beyond derived read-only views of the signed-in traveller's own local rows (Countries, passport, stamps, spending summaries, leg distances). **Visibility posture: private, local, never transmitted, nothing new stored.** `expenses` and `documents` gain no visibility flag and no public-read policy, and appear in no view that could be shared (FR-084). |
| II. Offline is the default    | No network call is added. Fonts, icons, stamps and the generated covers are bundled or drawn; flags are glyphs; the pending marker and the sync chip are restyled and derived from `is_dirty` and the network state; reduced motion removes animation without removing state. A record not yet uploaded is never shown as saved.                                                                                              |
| III. Test-first, 80%          | Every task writes its failing test first; the contrast gate and the Atlas-value search are written before the palette changes; coverage stays at 80% in every workspace; the privacy suite is untouched. The gesture code of the sheet is the largest piece of new logic and is specified by tests before it exists.                                                                                                          |
| IV. Verify before you render  | Every contrast figure was measured with the repository's formula (research D5-22, `design-tokens.md`). The map style keys are checked against the provider's documented keys (the typings mis-name two). Every device unknown is a named spike (V1 to V7), not an assumption. A new privacy or security claim in copy needs verification first (spec, "Prototype elements").                                                  |
| V. Nothing held hostage       | Not affected: no gating, retention or deletion behaviour changes; Tier 3 deletion UI is not built.                                                                                                                                                                                                                                                                                                                            |
| Offline-sync gate (AGENTS.md) | Not a social or sharing feature, so it does not advance. The share, recap and poster items are Tier 3 because of it. It is re-run before release because the feature touches every screen the 15 offline Maestro phases drive (SC-010).                                                                                                                                                                                       |
| Security review               | Not required for the feature as a whole. T555 is a light review of the sign-in and register restyle (`secureTextEntry`, `textContentType`, `autoComplete`, error mapping and logging unchanged); T569 reviews the derived views for any path by which expenses or documents could reach a shareable surface.                                                                                                                  |
| Expo version discipline       | Every Expo API was read from the versioned v57 documentation or the package's page; `expo-glass-effect`, `formSheet` and header options come from the SDK 57 docs and the installed `node_modules`.                                                                                                                                                                                                                           |
| Dependency hygiene            | Exact pins, at least 7 days old (re-verified on 2026-10-12), installed once at the root with the lockfile committed, install scripts reviewed, SDK 57 pins respected (research D5-19).                                                                                                                                                                                                                                        |
| Quality bar                   | The sheet, the pill, the globe layers and the derived models are small files split by concern; the pure derivations (`globeFit`, `deriveStamp`, `composeTripList`, `passportTotals`) are functions under 50 lines.                                                                                                                                                                                                            |

**Result: PASS, no violations; the Complexity Tracking table stays empty.**

### Post-Phase-1 re-evaluation

Re-checked after `data-model.md`, `contracts/` and `quickstart.md` were written. Still PASS, with three
observations recorded rather than waived:

1. The coral button is below 3:1 against white (2.82:1 and 2.40:1). It passes through its label and an edge ring,
   and is the single entry of `FILL_BELOW_FLOOR`, verified by the gate in both directions (C5-4).
2. Capping chrome text at 1.3 times (FR-074) is a deliberate departure from 004's uncapped text and is an owner
   question (Q-1); the layouts reflow rather than clip, so SC-007 is not weakened.
3. Jest cannot judge how the sunrise look reads in daylight, and the 80% floor is met by adapter tests while
   the real risk is the owner's eye. The first-slice review (T547), the screenshot baselines and SC-009 stay
   first-class tasks and are not substituted by coverage.

## Project Structure

### Documentation (this feature)

```text
specs/005-sunrise-passport-ui/
├── spec.md                    # /speckit-specify output
├── plan.md                    # This file
├── research.md                # Phase 0: D5-01 to D5-22 and the device-spike list (V1 to V7)
├── data-model.md              # Phase 1: Palette, type, StampSpec, CountrySummary, TripCardModel, SheetDetent... (no schema change)
├── quickstart.md              # Phase 1: how to validate each phase, the one rebuild, the spikes
├── contracts/
│   ├── design-tokens.md       # C5-1 to C5-12 (palettes, gate, type, space, motion, scrims, globe tokens)
│   ├── components.md          # C5-13 to C5-30 (adapters, tab pill, sheet, home, globe layers, passport...)
│   └── screens.md             # C5-31 and C5-32 (obligations and the blueprint with measurements)
├── checklists/
│   └── requirements.md        # Spec quality checklist
└── tasks.md                   # /speckit-tasks output (T500 to T570)
```

### Source Code (`apps/mobile/`) — what changes

```text
apps/mobile/
├── app.config.ts                           # EDIT  expo-font entries: DM Sans x3, Instrument Serif Italic (Bricolage kept)
├── jest.config.js  jest.setup.ts           # EDIT  mocks: expo-glass-effect, view-shot, zoom-toolkit; phosphor deep imports
├── eslint.config.js                        # EDIT  gradient-literal rule; new import boundaries
├── scripts/build-theme-css.mjs             # EDIT  Sunrise variable map, new app variables
├── assets/fonts/  assets/stamps/           # NEW   font notes; four baked wear masks (grayscale PNG)
├── src/
│   ├── global.css                          # EDIT  font variables for the new families (both name spellings)
│   ├── theme/
│   │   ├── palette.data.js  palette.ts     # EDIT  Sunrise values, the new key set (data-model §1)
│   │   ├── generated/theme.css             # EDIT  regenerated
│   │   ├── typography.ts  shape.ts  motion.ts   # EDIT  nine roles, radii and lifts, springs
│   │   ├── scrim.ts                        # NEW   scrim, sky, passport and cover gradients as data
│   │   └── contrast.ts                     # KEPT  blend() already exists
│   ├── constants/theme.ts                  # EDIT  GlobeColors stops, GlobeStyle group
│   ├── components/
│   │   ├── ui/                             # EDIT/NEW  icon-registry, button, chip, segmented-pill, sync-chip, flag-chip,
│   │   │                                   #   card, stat-tile, area-pill, field, sheet, scrim, generated-cover, stamp,
│   │   │                                   #   animated-number, toast, banner, state skeletons, photo-viewer adapter
│   │   ├── navigation/                     # EDIT/NEW  tab-bar (pill), tab-surface, android-nav-bar
│   │   ├── globe/                          # NEW layers: basemap-config, atmosphere, visited-countries, graticule,
│   │   │                                   #   gradient-arcs, roundels, active-callout; EDIT globe-view, stats-overlay
│   │   ├── home/                           # NEW  home-sheet, greeting-header, stats-row, now-card, countries-list, country-row
│   │   ├── trip/                           # EDIT/NEW  trip-hero-card, ticket-card, trip-row, stop-strip, trip-hero, areas-strip,
│   │   │                                   #   day-chips, stop-row (spine), transit-row, photo-mosaic, spending-*, document-ticket
│   │   └── passport/                       # NEW  passport-card, stamps-page, period-switch
│   ├── features/
│   │   ├── globe/                          # NEW  globe-fit.ts, use-idle-spin.ts, use-globe-actions.ts  (geometry untouched)
│   │   ├── passport/                       # NEW  stamp-spec.ts, country-summary.ts, passport-totals.ts
│   │   ├── trips/                          # NEW  trip-sections.ts, trip-days.ts; EDIT use-trips (card model)
│   │   ├── expenses/                       # NEW  spending-summary.ts
│   │   └── sync/                           # NEW  use-sync-chip-state.ts
│   ├── hooks/use-haptics.ts                # EDIT  semantic map (D5-14)
│   └── app/
│       ├── (tabs)/_layout.tsx  index.tsx   # EDIT  pill, label "You"; Home layers
│       ├── (tabs)/trips/index.tsx          # EDIT  mixed list, filter, FAB
│       ├── (tabs)/profile/index.tsx        # EDIT  passport and stamps
│       ├── trip/[id]/*.tsx                 # EDIT  hero, areas header, area screens
│       ├── modal/*.tsx                     # EDIT  sheets
│       ├── (auth)/*.tsx                    # EDIT  welcome globe sheet, forms
│       └── (dev)/gallery.tsx               # NEW   DEV only
├── e2e/                                    # EDIT  flows listed in `contracts/screens.md`; NEW __baselines__/
└── test/                                   # EXTEND  palette, contrast gate, atlas-values, globe-fit, stamp, sections, testID parity
```

**Structure Decision**: extend the existing layout; add `components/home/` and `components/passport/` and
`features/passport/` as the only new folders. The adapter boundary of 004 is kept. Tests mirror the source tree
under `apps/mobile/test/` and co-located `*.test.tsx`, as configured.

## Decisions

The decisions are in [research.md](./research.md): D5-01 direction; D5-02 reuse of the 004 stack; D5-03 the
Home sheet and camera padding; D5-04 globe style layers; D5-05 tab pill; D5-06 type; D5-07 icons; D5-08 stamps;
D5-09 images; D5-10 scrims and gradients; D5-11 count-up; D5-12 transitions; D5-13 photo viewer; D5-14
skeleton, toast, haptics; D5-15 charts; D5-16 flags; D5-17 derived views and privacy; D5-18 QA; D5-19
dependencies and batches; D5-20 amendments; D5-21 Android; D5-22 measured contrast findings.

## Phasing

| Phase | Name                                                        | Stories       | Exit gate                                                                                     |
| ----- | ----------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| 0     | Prerequisite: branch, baselines, owner answers              | none          | branch from the 004 tip; tag `pre-005-baseline`; open questions answered or defaulted         |
| 1     | Dependencies, fonts, spikes                                 | none          | ONE rebuild done; V1 to V6 recorded in research; fonts load with both name spellings          |
| 2     | Foundation: tokens, gate, type, icons, adapters, gallery    | none          | gates green; contrast gate extended and green; no screen moved                                |
| 3     | Chrome: pill, headers, sync chip                            | US1, US6      | tab tests green on the pill; Android bar; labels "You"; gallery screenshots                   |
| 4     | Home: globe style, sheet, countries, states                 | US1, US6, US8 | sheet at 60 fps (V3); country list reachable by screen reader; flow 03 and 04 pass            |
| 5     | Trips                                                       | US2           | hero, ticket, rows, filter, 200+ scale; flows 01 and 02 pass                                  |
| 6     | Trip detail                                                 | US3           | hero, areas, days, spine; zero, loading, offline, error states                                |
| 6b    | **First-slice owner review (T547)**                         | US1 to US3    | the owner approves Home, Trips, Trip on a phone (SC-013); Phase 7 does not start before this  |
| 7     | Everyday areas and forms                                    | US4, US5      | five areas with four states each; forms pass the keyboard test; flows 02 and 05 pass          |
| 8     | Welcome, sign-in, You, delight                              | US7, US8      | auth flows pass; stamps deterministic (SC-016); sign-out guard intact                         |
| 9     | States, accessibility, text-scale, theme sweeps, baselines  | US6           | SC-007, SC-008, SC-015 recorded; size and fps baselines compared                              |
| 10    | Retire Atlas                                                | all           | the SC-001 search is empty; docs as built                                                     |
| 11    | Device gates, Maestro, offline, reviews, final owner review | all           | Maestro and screenshots pass; two-device offline gate (SC-010); CI and Windows clean (SC-012) |

### Parallel branch groups (each in its own git worktree and branch, merged into `feat/005-sunrise-passport-ui`)

| Group  | Branch                                                                 | Tasks        | Starts after   | Notes                                                  |
| ------ | ---------------------------------------------------------------------- | ------------ | -------------- | ------------------------------------------------------ |
| A      | `feat/005-tokens`                                                      | T513 to T517 | T502, T504     | one agent; everything else waits for T514              |
| B1     | `feat/005-adapters-core`                                               | T518 to T520 | T514 to T516   | [P] with B2 and B3                                     |
| B2     | `feat/005-adapters-surfaces`                                           | T521, T522   | T514 to T516   | [P]                                                    |
| B3     | `feat/005-adapters-visual`                                             | T523, T524   | T514 to T516   | [P]                                                    |
| C      | `feat/005-chrome`                                                      | T526 to T530 | T525           | pill, Android bar, headers, sync chip                  |
| D1     | `feat/005-home-globe`                                                  | T531 to T533 | T525           | [P] with D2: pure fit, style layers, pins              |
| D2     | `feat/005-home-sheet`                                                  | T534 to T538 | T525, T531     | sheet core first, then content, countries, integration |
| E      | `feat/005-trips`                                                       | T539 to T542 | T525           | [P] with D and F                                       |
| F      | `feat/005-trip-detail`                                                 | T543 to T546 | T525           | [P]                                                    |
| G1..G5 | `feat/005-areas-photos`, `-expenses`, `-notes`, `-documents`, `-forms` | T549 to T553 | T547           | five independent branches                              |
| H      | `feat/005-auth-you`                                                    | T554 to T558 | T547           | [P] with G                                             |
| I      | `feat/005-sweeps`                                                      | T559 to T563 | G and H merged | serial                                                 |

## Open questions for the owner

| #    | Question                                                                                                                                            | Default if unanswered | Blocks     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------- |
| Q-1  | May tab labels, chip captions and hero numerals be capped at 1.3 times text size (FR-074), against 004's uncapped text?                             | Yes, those roles only | T515       |
| Q-2  | "N of 195" countries and "N of 7" continents: the numerator counts every country in the app's list, territories included. Keep the fixed 195 and 7? | Yes                   | T536, T556 |
| Q-3  | Flags as platform emoji in a clipped chip (D5-16), or ship an SVG flag set (a dependency and about 250 assets)?                                     | Emoji                 | T520       |
| Q-4  | Trips "Plan a trip" as a floating button on iOS too (the 004 header action goes)?                                                                   | Yes                   | T541       |
| Q-5  | Keep Welcome's two buttons (Create account, Sign in) with Apple and Google inside the forms, instead of the prototype's three equal buttons?        | Keep two              | T554       |
| Q-6  | Add `react-native-view-shot` to the one native batch so pins can be photo roundels (a spike decides; the fallback is dots plus a live pin)?         | Yes, spike-gated      | T502, T508 |
| Q-7  | A later schema change to store a photo placeholder hash (best loading experience) is NOT part of this feature. Agree?                               | Agree                 | T523       |
| Q-8  | The empty-state art is three empty photo frames, not photographs. Agree, or commission illustrations?                                               | Empty frames          | T537       |
| Q-9  | Which Tier 3 items does the owner want specified next (search, trip edit and delete, settings, recap and share)?                                    | None specified now    | none       |
| Q-10 | Glass for the iOS 26 tab pill, with the blur and solid fallbacks, or solid everywhere?                                                              | Glass with fallbacks  | T526, T510 |

## Risks

| Risk                                                                                                        | Likelihood | Impact | Mitigation                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| The owner rejects the look again                                                                            | Medium     | High   | A dev client early; the first-slice review (T547) before Phases 7 to 8; screenshots against the prototype; Atlas kept until Phase 10 |
| The custom sheet drops frames over the live globe on a mid Android phone                                    | Medium     | High   | Camera padding once per settle, never per frame; V3 spike with a throwaway sheet; fallback: fixed stats panel and a modal list       |
| The map's `Atmosphere`, `spaceColor` alpha or roundel capture misbehave on one platform                     | Medium     | Medium | V2 spike; opaque `spaceColor`; fallback: dots plus `MarkerView` for at most 12 pins                                                  |
| The opsz 14 headings look loose, or iOS ignores `tnum` on the embedded face                                 | Medium     | Medium | V1 spike; tracking compensation; upgrade path: instanced opsz 48 files                                                               |
| Glass pill unusable on iOS 26 (opacity bug, reduced transparency)                                           | Low        | Medium | `tabSurface()` fallbacks; solid pill is the design as drawn                                                                          |
| A contrast pair fails on a surface the prototype did not measure (a photograph, the sky, a tint over cream) | Medium     | Medium | The gate lists every pair; a white-photograph fixture; retune tokens, never floors                                                   |
| The label and copy changes break a Maestro flow                                                             | Low        | Medium | Copy policy; every flow named in `screens.md` is re-run in its phase; the parity test                                                |
| Scope creep: a Tier 3 control creeps in as an icon that does nothing                                        | Medium     | Medium | FR-080; screen tests assert no control without a handler; review rule                                                                |
| Two dev-client rebuilds instead of one                                                                      | Low        | Medium | Batch 1 is installed in one task; SC-017; no native addition after the first-slice review                                            |

## Complexity Tracking

> No constitutional violations were identified, so no justifications are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |
