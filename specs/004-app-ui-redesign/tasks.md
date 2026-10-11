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

- [x] T400 Land the uncommitted feature 003 working tree as separate conventional commits on
      `feat/us3-globe` (API logger pretty-transport; mobile journey legs, flat tab bar, currency picker,
      trip screen; `specs/003-globe-first-home`; run-on-phone scripts; AGENTS/README/gitattributes), run
      `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile`, then create branch
      `feat/004-app-ui-redesign` and tag `pre-004-baseline` (the testID and accessible-name baseline for
      T414). The Maestro flow edits already in the tree (`e2e/03-globe.yaml`) ride with their feature.
      _Done:_ the working tree landed as three branches (`fix/api-log-transport`, `chore/run-on-phone-windows`,
      `feat/003-globe-first-home`), each merged into `feat/us3-globe` with a merge commit; the tag
      `pre-004-baseline` marks the merge tip (307778d); each later area of this feature is its own branch
      merged into `feat/004-app-ui-redesign` after review.

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

- [x] T426 [US1] Failing tests in `apps/mobile/test/components/tab-bar.test.tsx` (moved with `git mv`
      from the 002 tab-bar suite): flat strip, one divider at 3:1, filled selected icon, mark, 56 dp
      budget, touch target, preserved ids, no literal; then rename and re-skin
      `components/navigation/tab-bar.tsx`, update `app/(tabs)/_layout.tsx` (FR-010, FR-025)
      _As built:_ `TabBar` is a `View` of `flex-row border-border bg-background`; the divider's colour is
      the class and its width is the style's hairline `borderTopWidth`, the only width (Tailwind's
      `border-t` would be 1 px and would fight it), and the navigator's bottom inset is the padding. Each
      tab is a `Tappable` (`flex-1`, role `tab`, `selected` state, the route's label as its name) holding
      an `Icon` and a `Text type="caption"`, in the accent ink when selected and the muted ink otherwise,
      so there is no `useAppearance` and no colour in the file. The selected tab draws the filled SF
      Symbol (`globe.europe.africa`, `suitcase`, `person.crop.circle` plus `.fill`), a `font-bold` label
      and the 24 x 3 dp `tab-mark-<name>` bar hanging from the divider (selected tab only, absolute, so
      it costs no height). Android Material Symbols come from one static font in `expo-symbols` with no
      fill axis, so the Android glyph (`globe`, `luggage`, `account_circle`) is the same in both states
      and the accent, weight and mark carry the selection there. The 56 dp budget is `TabMetrics`
      summed (20 icon + 2 gap + 16 caption line + 2 x 4 padding = 46 dp, `TabContentHeight`) and a tab is
      the larger of that and the touch target, so the bar is 46.3 dp on iOS and 48.3 dp on Android, and
      the suite sums it for both platforms. `Tappable` scales its minimum height with the font scale
      (88 dp at scale 2, about 140 dp at Android's largest, for a 20 dp icon and one word), so the tab
      passes `minHeight: MinTouchTarget` as its own style (a caller style wins) and the content grows
      the tab by what it needs; the label has no `numberOfLines` and wraps. `tabBar` stays a
      `(props) => <TabBar {...props} />` render function, not `tabBar={TabBar}`: React Navigation calls
      it inside a context consumer's callback, and the bar must keep its own hook scope.
      `test/app/tabs-layout.test.tsx` mounts the layout over the real navigator: ids, selection and mark
      moving on press, the measured height reaching `useBottomTabBarHeight()`, and the scene background
      equal to the canvas the bar paints. Ids, roles, press and long-press behaviour are unchanged (44
      tests in the component suite, 5 in the layout suite; the testID parity check passes). Device
      checks: the divider is visible in both themes and in increased contrast; the filled icons draw
      on iOS and the same glyphs draw on Android; the mark and the heavier label tell the selected
      tab apart in greyscale and in high contrast; the bar clears the bottom inset with gesture
      navigation on Android and the home indicator on iOS; the focus ring (2 dp, offset 2) is not
      clipped at the bar's edges; and the largest text size on both platforms grows the bar without
      clipping or truncating the label (and by how much).
- [x] T427 [US1] Failing tests in `test/app/tab-screens.test.tsx` and `test/app/trip-and-modal-screens.test.tsx`
      for headers and Back; then nested stacks: move `app/(tabs)/trips.tsx` to `app/(tabs)/trips/_layout.tsx`
      and `index.tsx`, `profile.tsx` likewise (use the Prettier character-class workaround), themed header
      options for `trip/[id]/_layout.tsx` and `modal/_layout.tsx`, `HeaderBackButton` where T408 needs it
      (FR-007, FR-008; D4-06)
      _Done (trips and profile only; the box stays open for the trip and modal stacks):_ `(tabs)/trips` and
      `(tabs)/profile` are directories (`git mv`; same URLs; `(tabs)/_layout.tsx` untouched, `Tabs.Screen`
      names still match). `trips/_layout.tsx` is a `Stack` whose `screenOptions` come from the new adapter hook
      `useStackHeaderOptions('Trips')` (`components/ui/stack-header.ts`, reusable by `trip/[id]` and `modal`);
      `profile/_layout.tsx` is a `Stack` with `headerShown: false` until phase 6. Tests:
      `src/components/ui/stack-header.test.tsx` (options per platform, the hook), `test/app/nested-stack-layouts.test.tsx`
      (route files, what each layout hands `Stack`). Decisions: (1) the option is `headerLargeTitleEnabled`, not
      `headerLargeTitle`, which is `@deprecated` in the installed router 57.0.22 types (the v57 Stack page lists
      `headerLargeTitleEnabled`); (2) the helper is an adapter because `useThemeColor` and `useCSSVariable` may
      not be imported under `src/app` (C4-6; the layouts only call the hook); (3) on iOS the header gets NO
      `headerStyle.backgroundColor`: with a large title React Navigation leaves the header transparent over the
      canvas, and its own comment in `useHeaderConfigProps` says a background there hides the title on iOS 26;
      Android paints the header with the canvas; (4) the collapsed title uses `--font-display` (SemiBold, weight
      `'600'`) and the large title `--font-display-bold` (Bold, `'700'`), the quotes the stylesheet writes
      stripped, each weight being that file's own because React Native picks the nearest weight of a family.
      _Still to do under T427:_ `trip/[id]/_layout.tsx` and `modal/_layout.tsx` header options,
      `HeaderBackButton` where T408 needs it, and the headers-and-Back tests in
      `trip-and-modal-screens.test.tsx`. _Device-only (T408):_ the large title collapses as the trips list scrolls on iOS
      (Jest asserts the options and the list props, not the collapse) and stays visible on iOS 26; both titles draw
      the display face on both platforms.
      _Trip part done (the rest of T427 is still open, so this box stays unticked)._ _As built:_
      `trip/[id]/_layout.tsx` turns the native header on for `index` ONLY
      (`<Stack.Screen name="index" options={{ headerShown: true, title: '', headerLeft }}/>`); notes,
      expenses, photos, documents, document-capture, document-view and offline-maps keep
      `headerShown: false` and their own bars until phase 5. `headerLeft` is `HeaderBackButton` WITHOUT
      the props React Navigation passes: `canGoBack` is `false` for a trip opened with nothing beneath it,
      and the button then goes home (`router.replace('/')`) instead of vanishing. `title` is empty (the
      hero title is the content; two copies would be read twice). The colours come from a new hook,
      `useHeaderTheme()` (`components/ui/header-theme.ts`, tested beside it): the kit's `background` for
      `headerStyle` and `contentStyle`, `accent` for `headerTintColor`, `headerShadowVisible: false`. It
      lives in `components/ui` because only that folder may import the kit; the layout never writes a
      colour. The layout declares no `unstable_settings` or `initialParams`, so the root's `(tabs)`
      anchor, the route's params and deep links are untouched. `test/app/trip-layout.test.tsx` renders the
      layout through a real router and reads the native header config of every trip screen (header only on
      `index`, empty title, no hairline, token colours, `backButtonInCustomView` false), then presses Back
      with history beneath the trip (pops to `/`) and without (replaces with `/`). From the source: the
      first screen of a nested stack still gets `canGoBack` true when the parent stack has a previous
      screen (`NativeStackView.native.js`: `parentHeaderBack`), so a native back button left on would
      have been labelled with the previous screen's route name, `(tabs)`; that is why `headerLeft` is
      used at all.
      Device checks (T408): `tapOn: 'Back'` resolves on the custom `headerLeft` on iOS and Android
      (01-account-and-trip, 03-globe and 04-zoom, every `Back` from a trip); the iOS edge swipe still pops
      the trip with a custom `headerLeft` (desk reading: the swipe belongs to the ROOT stack's
      `trip/[id]` screen, which has no header and no custom left item, and the nested stack's overview is
      its first screen, so its own pop gesture has nothing to pop; confirm on a phone); the Android back
      button and gesture; the header over the hero at the largest text size (the word in the Back control
      drops above font scale 1.3; the bar is fixed-height); the iOS 26 glass capsule behind a custom left
      item; no flash of the previous background while the header animates in.
      _Review follow-up, device checks (T408, T433):_ (1) the iOS edge swipe on the trip overview
      with the custom `headerLeft`. If it does not pop the trip, the fallbacks in order: set
      `gestureEnabled: true` (and, if the edge is too narrow, `fullScreenGestureEnabled: true`) on the
      root stack's `trip/[id]` screen; then drop the custom `headerLeft` and keep the native button
      with `headerBackButtonDisplayMode: 'minimal'` plus a label that reads "Back" (Maestro's
      `tapOn: 'Back'` then needs the native label to resolve, which is item 7 of the research list).
      (2) Maestro `tapOn: 'Back'` TWICE in a row on both platforms (notes then Back to the overview,
      then Back again to the trips list, as 03-globe and the offline flows do): the second tap must
      land on the header's custom view of the overview, with no stale "Back" of the screen above it
      still in the accessibility hierarchy. (3) Header colours in all four themes, including a LIVE
      switch with the trip open (system dark mode, and the increased-contrast setting): the bar, the
      scene and the screen's canvas are one colour with no seam. Known gap, found in review:
      `useAppearance().tokens` is the two-theme `Colors`, so under increased contrast the root stack,
      the navigation theme and `Screen`'s token style paint the BASE canvas (`#F5F2EB`, `#091018`)
      while the kit's `--background`, which the trip header and scene use, is the contrast canvas
      (`#FAF8F3`, `#05090E`). `header-theme.test.tsx` pins light and dark only; whether the contrast
      themes show a seam under the bar is for the device to say, and the fix (a contrast-aware
      `tokens`, or dropping the token style from `Screen`) is phase 7's.
      _Modal part done, so the box is ticked (device checks stay open):_ a form sheet has no native header, so there is
      nothing to theme in `modal/_layout.tsx`. Presentation is an option of the PRESENTED screen, so the root stack's `modal`
      screen takes `formSheetOptions` (`src/app/_layout.tsx`, two lines; the anchor and `Stack.Protected` are untouched) and
      `modal/_layout.tsx` is a `Slot` inside `RequireLocalStore`, not a `Stack`: the v57 modals guide says an Android form sheet
      supports neither native headers nor nested stack navigators. Each sheet draws its own title and Cancel through
      `FormSheet`; there is no Back in a sheet (Cancel, the handle and a swipe down dismiss it). A deep link to a sheet still
      has the tabs beneath it. Tests: `test/app/modal-layout.test.tsx` (real router, 8). The sub-screens of a trip follow the
      overview's header through the `titled()` helper in `trip/[id]/_layout.tsx` (T440 to T444); `profile` has its large title
      (T448).
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
      no text button); it is deliberately not merged into one focus stop (it never was): title, reason and
      button stay separate. **Notice** (`globe-notice`): ONE accessible `alert` named by its title and
      reason (an outer view, like the stats; the card inside is `globe-notice-card`), leading alert icon,
      danger-ink headline, muted detail; no retry, because `useGlobe` has no reload and the copy says to
      restart. Both messages share one `OverlayCard`: `self-stretch` with `max-w-md`, the reason wraps in
      full (the old `numberOfLines` cap of 3 is gone), and an inner `ScrollView` caps the card at 60% of
      the window height (`overlayMaxHeight`), so at the largest text size every word and the action stay
      reachable and the globe is never covered whole. The card owns its padding: none on the card,
      `OVERLAY_CARD_INSET` on the scroller's content, so the cap is the card's whole height and the inset
      is the gutter that keeps a focus ring (`FocusRing`, 4 dp outside) from being clipped by the
      scroller. The Home overlay is a native `SafeAreaView` with `pointerEvents="box-none"` as a prop (and
      still in its style, as before) and `testID="home-overlay"`; its edges stay `top` only, as in the old
      file, because the app is portrait-locked and the side insets are zero (add `left` and `right` if the
      lock is lifted). Home route: a `bg-background` view instead of `ThemedView`, `LoadingState` straight
      on `Screen`; no `ErrorState`, because a failed read keeps the globe and floats the notice (003
      FR-001). Unresolved-id ratchet: ids 34 to 35 (`OverlayCard` forwards `testID`), labels 37 to 38 (the
      notice's label is built from its props). `GlobeView`, arcs, camera, beacon and `GlobeColors` are
      untouched. Device checks (Jest renders no styles): that a `style` of `padding: 0` really replaces
      the kit surface's class padding (Uniwind applies a style after the class, by its source); the cards
      over bright ocean and ice and over the dark night basemap (hairline visible, no halo); display-face
      figures and tabular digits on both platforms; large text on a small phone (the invitation wraps,
      scrolls inside its cap, the primary button stays reachable, the globe still pans and zooms around
      it); the top safe area under the notch and the status bar; TalkBack and VoiceOver read the stats as
      ONE summary, the notice once on appearance as an alert, and the invitation title as a heading
      followed by the button.
- [x] T429 [P] [US2] Failing tests in `apps/mobile/test/db/` and `src/features/trips/__tests__/` for the
      cover rule (designated, earliest, typographic, thumbnail failure) and date range; then
      `db/repositories/photos.ts` (earliest photo per trip, thumbnails only) and the `TripSummary` extension
      in `features/trips/use-trips.ts` per data-model §4 and §5; state the visibility posture in the commit
      (FR-011, FR-012; D4-09)
      Follow-up (not now): reduce cover candidates to one row per trip in SQL (usable-path predicate
      mirrored in SQL, designated cover included, partial index or denormalised `earliest_photo_id`) when a
      library of several thousand photos is a target
- [x] T430 [US2] Failing tests in `test/components/trip-components.test.tsx` and `test/app/tab-screens.test.tsx`
      for the card (cover, status chip, range, stops, currency, pending, whole-card control, chevron),
      skeletons, empty state, iOS header action versus Android FAB with the same `trips-plan-trip`; then
      `components/trip/trip-card.tsx`, `app/(tabs)/trips/index.tsx` (FR-011, FR-021, FR-035)
      _As built:_ tests are `test/components/trip-card.test.tsx` (the card: one button named "title, status, N
      stops" with the hint "Opens the trip", cover, chip, range, stops line, badge, chevron, large text, no neumorphic
      import, every id readable by the id extractor), `test/components/trip-components.test.tsx` (announcement
      parity), `test/app/trips-screen.test.tsx` (states, iOS header action versus Android FAB, list as scroller,
      clearance), `test/app/tab-screens.test.tsx` (trips parts), `src/features/trips/__tests__/trip-date-range.test.ts`,
      `test/features/trip-date-range.{auckland,los-angeles}.test.ts` and `list-screen.test.tsx`. New:
      `components/trip/trip-cover-band.tsx` (thumbnail or status-tinted initial, fallback to the typographic cover
      per thumbnail address when `expo-image` reports an error), `plan-trip-action.tsx`,
      `features/trips/trip-date-range.ts` ("12 Mar – 20 Mar 2026", year once, en dash). The screen is a
      `ListScreen` (`underHeader`, `edges={[]}`: the tab bar clears the home indicator) with `listTestID`, a
      small additive prop on `ListScreen` so `trips-list` stays on the list (populated state only, as before).
      _Review round 1:_ (1) **iOS header action is icon-only**: a plus `Button` (`iconOnly`, `variant="text"`, name
      "Plan a trip", `trips-plan-trip`), a fixed 44 pt square that the font scale does not touch, so large Dynamic
      Type cannot clip or widen the header; the words live in the empty state's own action
      (`trips-empty-plan-trip`). Android keeps the extended FAB. (2) **Date range**: `formatDateRange` returns
      `null` for anything it cannot read (garbage, empty, not on the calendar, reversed, a language tag the platform
      rejects falls back to its own locale) and never throws; the card then shows no date text. It reads the year,
      month and day out of the string, sets them on a `Date` at 12:00 UTC and formats in UTC, so the day shown is the
      day stored in any zone, and its formatters (one per language and with or without the year, `dayFormatter`) are
      built once and kept: a formatter that formatted LOCAL dates would be pinned to the zone it was made in and show
      the wrong day after the phone changed zone. This is deliberate and is not the UTC-conversion mistake the
      date rule forbids (see the module header). (3) **Zones**: `test/env/zone-environment.js` is a Jest environment
      that sets the REAL process zone before a file loads (`process.env.TZ` inside a test changes nothing: Jest
      gives the test a copy of `process.env`); two files run the same suite in Pacific/Auckland and
      America/Los_Angeles, each with a control proving that a UTC-parsing (west) or UTC-formatting (east)
      implementation is wrong there; with each mistake put into the code the other zone's file passed and its own
      failed 13 of its 15 tests. (4) The id ratchet: only `list-screen.tsx:103 testID={listTestID}` raised it (34 to 35
      testIDs), found by diffing the extractor's unresolved list at `ad119a2` against the tree; the cover band and the
      card write every id out with the literal head `trip-card-${id}` and add none. (5) The failed-image state is kept
      against the thumbnail address current when the event ARRIVES: `expo-image` 57.0.5's `onError` is
      `{ error: string }` and names no source, so a stale error cannot be matched to its source; the worst case is a
      placeholder, never a wrong photo (see the band's header). The error state keeps its title and detail and has no
      retry (the live query offers none), a known gap against C4-10 rule 2. The card passes `cue={false}` and draws
      its own chevron beside the text: the cover runs to the card's edge with `-mx-4 -mt-4` over the kit Surface's
      16 dp padding, and the default chevron would hang off the picture. Maestro: no flow depends on text that
      changed (ids, 'No trips yet', 'Planning', '2 stops.*', the card title are all kept), so no flow was edited.
      _Device-only checks:_ (a) the iOS large title collapses over the `FlashList` as it scrolls and the title stays
      visible on iOS 26 (Jest asserts only the props, T408); (b) **Maestro `tapOn: id trips-plan-trip` finds and
      taps the icon-only button inside the iOS native header** (five flows use it: `01-account-and-trip`,
      `02-notes-and-expenses`, `03-globe`, `offline/_helpers/add-trip`, `offline/15-a-over-allowance-offline`), and
      how the button sits in the **glass capsule iOS 26 draws around header items** (its tint, its 44 pt target);
      (c) the Android FAB placement against the tab bar and gesture area, the last card reachable above it, and no
      flow tapping a card centre under it; (d) the photo cover with a real thumbnail, and the typographic fallback
      when the file is gone; (e) VoiceOver and TalkBack read each card as ONE element ("title, status, N stops",
      hint "Opens the trip"); (f) every card at the largest text size (the chip and date rows wrap, the initial
      grows) and the iOS header at the largest Dynamic Type size; (g) light, dark and both contrast themes.
- [x] T431 [US2] Failing tests in `test/app/trip-and-modal-screens.test.tsx` for the hero title
      (`trip-title`), status row, areas row (`trip-links`, `trip-open-<segment>`), timeline and preserved stop
      controls and accessibility actions; then `app/trip/[id]/index.tsx`, `components/trip/stop-row.tsx`,
      `stop-list.tsx`, `status-pill.tsx` (FR-013, FR-024, FR-030, 003 FR-018)
      _As built:_ every pre-004 id and accessible name is unchanged
      (`node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json` holds, and the
      unresolved-id count did not move). No Maestro flow needed an edit (see _Maestro_ below).
      _Screen_ (`app/trip/[id]/index.tsx`): `Screen underHeader`, no bar of its own. Hero: a
      `largeTitle` `Text` with `trip-title` (a heading, in the trip's exact words); one row
      `trip-header-row` of `StatusChip` (keeps `status-pill-<status>` and "Status: <label>"), the home
      currency as muted `callout` text (a bare "EUR", as announced before, not a chip that would need a
      new name) and `SyncBadge` while `is_dirty`. Areas: `trip-links` is a horizontal `ScrollView` with no
      scroll bar, bleeding into the screen's 24 dp side padding (negative margin, the same padding given
      back inside) so a chip is cut by the screen edge; each area is a `Chip` with a leading icon, its old
      accessibility label, `testID trip-open-<segment>` and the same route. "Stops": a `headline` heading
      and the secondary `Button` `trip-add-stop` (label "Add stop", `plus` icon); the screen has no
      primary control. States: the trip loads as `LoadingState` "Loading trip"; a trip not on the device
      is the same `EmptyState`; a trip the store cannot read is a new `ErrorState` "Couldn't read this
      trip" (before, that case fell into "not on this device", which was wrong); the stops load as a
      `ListSkeleton` region named "Loading stops" (a `progressbar`, as the spinner state was), empty and
      error as before. `trip-write-error` is the `InlineError` (role `alert`), after the list as before,
      and the write helper is the shared `useWriteAttempt`. The screen is three small hooks and
      components (`useStopWrites`, `useStopEditor`, `TripDetails`), none over 50 lines.
      _Timeline_ (`stop-row.tsx`, `stop-list.tsx`): a row is one `accessible` `View` named
      `Stop N: place, country. dates` with the same four `accessibilityActions` and handlers, containing
      a rail and a flat `Card` (`pending` gives the dashed edge while the stop is only on the device, and
      the `SyncBadge` stays the text and icon). The rail is drawn per row: a line above every dot but the
      first, below every dot but the last (`stop-rail-top-<id>`, `stop-rail-bottom-<id>`), through the
      12 dp each row carries under its card, so the drag list's `rowGap` is now 0 and the rows stay
      independent sortable items. The dot is the stop's order (`stop-number-<id>`, `numeric` role: tabular
      figures, accent fill, `accent-foreground` ink). Place is a `headline`, country a muted `caption`,
      dates (`stop-dates-<id>`) `numeric` at `callout`. Controls are compact `Button`s in a wrapping row
      (`stop-actions-<id>`): `stop-move-up-<id>` and `stop-move-down-<id>` icon-only `text` buttons
      (disabled at the ends, as announced before), `stop-edit-<id>` "Dates" (`text`, calendar icon) and
      `stop-remove-<id>` "Remove" (`destructive`, trash icon), each with the label and id it had. The
      visible "Stop N" caption became the number in the dot; the row's name already said it. The drag
      handle is a grip glyph in a platform-sized target (`stop-grip-<id>`), same name and hint.
      _Maestro:_ every flow that touches the trip screen was read and none was edited: `tapOn: 'Back'`
      from a trip (03-globe, 04-zoom, the offline helpers) is served by the header control named
      "Back" (its visible word too, at the default text size; 01-appearance's two `Back` steps are the
      sign-in and register screens, not the trip); `trip-add-stop`,
      `trip-open-<segment>`, `stop-editor-*` and `trip-screen` are the same ids; "Italy, spring 2026" is
      the hero title's text; "Planning", "Active" and "Past" are the `StatusChip` words; "No stops yet",
      "Not yet synced" and `Stop N: place.*` (the row's name) are unchanged, and `tapOn: 'Remove Paris'`
      (offline 14-a) matches the Remove button's name as before. `test/testid-maestro.test.ts` agrees.
      None of this was run: Maestro needs a device.
      _Deviations:_ (1) Remove is the `destructive` variant, not `text` as the brief said for the
      controls: it is the one destructive control of the row and a plain-ink Remove would lose the
      danger cue it had (FR-025); the on-phone review (T433) decides whether a soft red fill per row is
      too loud. (2) The pre-004 order of the static text changed (title first, then status, currency,
      pending marker; Back is now the header's); the order of every CONTROL is unchanged.
      003 FR-018 asked for Back and the status on one row; 004 FR-007 and FR-008 moved Back into the
      native header, so the status row is the one under the title and the sideways areas row is as
      specified. `status-pill.tsx` is no longer used by this screen and stays until the cleanup.
      _Tests:_ `trip-and-modal-screens` (hero, status row, order, areas, states, Add stop, write error,
      adapter-only source), `trip-components` (row as a timeline: number, rail, controls, targets,
      pending, actions), `stop-list.test.tsx` (new), and `test/ui-kit/trip-screen-real-render.test.tsx`
      (new: the screen over the REAL kit, nothing throws, ids and names land on the nodes).
      Device checks: (a) Back parity with Maestro on iOS and Android (T427 note); (b) the header over the
      hero at the largest text size; (c) the areas row at the largest text size: it scrolls, the last chip
      is reachable, the focus ring is not clipped, the negative-margin bleed lines up on Android;
      (d) VoiceOver and TalkBack reading order: Back, title (heading), status, currency, pending
      marker, the five areas, "Stops" (heading), Add stop, then one element per stop with its four custom
      actions, then the alert; (e) drag-to-reorder still lifts a row from its grip, the others slide, and
      a drop writes the whole order once (the rows now carry their own 12 dp, which the sortable
      measures; the library's lift scale and shadow are unchanged); (f) the rail meets the dot and the
      place line (the 12 dp stub above the dot is tuned for a 16 dp card padding and a 24 dp line);
      (g) the stop's controls at 360 dp wide at the default size (they may take a second line) and at the
      largest size; (h) the dashed edge and the soft Remove in all four themes, and the dot's ink on its
      fill; (i) the kit's ghost `Button` hover blend needs variables Jest cannot register, so
      `test/ui-kit/trip-screen-real-render.test.tsx` drops that one console message and nothing else.
      _Review fixes (after the first review):_ (1) `useTrip` and `useTripStops` reported `loading: true`
      together with the error of a failed read: drizzle's `useLiveQuery` sets `updatedAt` only when a
      result arrives, so a failure leaves it unset for good, and the screen's `loading` branch, checked
      first, hid the "Couldn't read this trip" state for ever. Fixed twice: both hooks now say
      `loading` only while neither a result nor an error has arrived (`isAwaitingFirstResult`), and the
      screen checks the error before `loading`. Regression tests: through the real hooks over real SQLite
      (`test/features/use-trips.test.tsx`: a dropped table is a read that fails; the first render is still
      loading), and through the screen with `{ loading: true, error }` for the trip and for the stops.
      `useTrips` was left alone. Consumers checked: the add-expense sheet showed a blank page for a
      failed trip read and now shows its "not on this device" state; notes, expenses, photos, documents and
      offline-maps read only `trip.data?.title`; offline-maps already checks `stops.error` before
      `stops.loading`. (2) While a stop is dragged the dots and rail derive from the data index, which only follows the
      drop once it is written back, so they read 1, 3, 2 and the last-row rail stayed on the old last item.
      `StopList` keeps a `dragging` flag from `Sortable.Grid`'s `onDragStart` to `onActiveItemDropped` (the
      drop animation has finished, after `onDragEnd` has written the new order; both are plain JS callbacks
      in react-native-sortables 1.10) and every row shows a neutral dot (`stop-dot-<id>`, same box, no
      number, no rail) meanwhile. The jest stand-in for the library gained `__dragStart` and
      `__activeItemDropped` beside `__dropAt`. Limit: the flag is the list's, not the library's active
      item, so every row goes neutral, not only the carried one; and a `renderItem` that changes with the
      flag re-renders every row on lift and on landing (the library's store notifies on that, by design).
      (3) `useHeaderTheme` colours are now pinned against the root's canvas for light and dark
      (`header-theme.test.tsx`); the contrast themes are a recorded gap (see the T427 device checks).
      (4) `Screen` exports `SCREEN_GUTTER` (its side padding) and the areas row's bleed reads it instead
      of repeating the number.
      _Review follow-up, device checks:_ drag rail artefacts (neutral dots from the lift to the landing,
      numbers back and in order with no flash of the old numbering between the drop and the redraw, the
      lifted row's scale and shadow, auto-scroll while dragging near the screen edge); and the T427
      checks above (swipe-back, Back twice, header colours in all four themes with a live switch).
- [x] T432 [US1] Update `apps/mobile/e2e/01-account-and-trip.yaml` and `03-globe.yaml` only where visible
      text changed; run both on iOS and Android; list each edit and its reason here (FR-037).
      _Desk part done:_ every flow that touches Home, Trips, the trip screen or the tab bar was read against the new
      ids, labels and texts and none needed an edit (the branches record the check per screen); `id: trips-plan-trip`
      now lives in the iOS native header. _Pending on a device:_ running both flows on iOS and Android.
- [ ] T433 [US1] **Checkpoint: on-phone review.** Run quickstart section 3 and the testID parity test;
      the user approves or lists changes before phase 4 (SC-013)

---

## Phase 4: User Story 3 - Forms and sheets that feel native (P2)

**Goal**: every form is a native sheet with a handle, words-only errors and a primary action above the
keyboard.

**Independent Test**: open each form, focus the last field with the keyboard up, submit valid and invalid.

- [x] T434 [P] [US3] Failing tests in `test/app/trip-and-modal-screens.test.tsx` then `app/modal/_layout.tsx`
      (`formSheet`, `sheetAllowedDetents`, anchor kept) and `app/modal/add-trip.tsx` using `Field`,
      `FormActions`, sideways currency row; fits one screen at the default size on 360 x 640 dp (FR-009;
      D4-06, 003 FR-017)
      _As built:_ `components/ui/form-sheet.tsx` is the form-sheet pattern (`FormSheet`, `formSheetOptions`,
      `sheetMaxHeight`) and `test/helpers/keyboard.ts` is its Jest helper. `FormSheet` takes `title`, `testID`, `actions`
      (the `FormActions` props) and `host`. It gives a heading, a `KeyboardAwareScrollView` body with
      `keyboardShouldPersistTaps="handled"`, an opaque footer OUTSIDE the body (`FormActions` unchanged) and an Android
      handle. `host="form-sheet"` (default) is a router sheet that the platform lifts above the keyboard itself
      (react-native-screens 4.26 on Android, UIKit on iOS), so the form is capped to `sheetMaxHeight` rather than given a
      sticky footer that would be lifted twice; `host="modal"` is an RN `Modal`, whose footer is a `KeyboardStickyView` with
      `offset.opened` set to the bottom inset. `add-trip.tsx` is rebuilt on it, with every id kept. The pattern is documented in
      `contracts/components.md` ("As built (T434, T438 pattern)"). Tests: `form-sheet.test.tsx` (27), `test/helpers/keyboard.test.tsx`
      (9), the add-trip block of `trip-and-modal-screens.test.tsx` including the keyboard-visibility test and a 360 x 640
      budget (arithmetic from the token heights, not a measurement). Ratchet testIDs 36 to 37 (`FormSheet` forwards its root
      id). Consequence: every route of the `modal` group is `fitToContents`, add-expense included, which is why T436 had to land
      with it. Device checks: both platforms lift the router sheet fully above the keyboard with Save visible and no double lift
      (the library source and its issues, not a run, are the evidence); no flicker of the keyboard-aware body in an iOS sheet
      (library issue 726); the Android handle is a usable drag target; exactly one bottom inset under Save; the sheet's top gap
      with edge-to-edge window heights; add-trip fits one screen at 360 x 640 and Save is reachable at the largest text size.
- [x] T435 [P] [US3] `components/trip/currency-picker.tsx` and `components/trip/category-picker.tsx` onto
      `ChipGroup` with preserved ids `currency-<CODE>`, `currency-other` (tests in
      `src/features/trips/__tests__/trip-form.test.tsx` and `test/components/`) (FR-025, FR-037)
      _As built:_ `currency-picker.tsx` and `category-picker.tsx` are on `ChipGroup`, `Field`, `InlineError` and `Button`.
      `CurrencyPicker` is one sideways `ChipGroup` (`scroll`) of the ten common codes and "Other", plus a `Field` while "Other" is
      open; exactly one option is selected and opening "Other" clears a common code as before. `CategoryPicker` is a `ChipGroup`
      (one sideways row by default, `scroll={false}` wraps), a "New category" `Field` and a secondary "Add category" `Button`
      (held while blank); its error is an `InlineError` with the one new id `category-error`. Every pre-existing id and name is
      unchanged; `currency-pills` is now the radiogroup that holds the chips and both groups gained a name ("Home currency",
      "Category") and a check glyph on the selected chip. Tests: `test/components/pickers.test.tsx` (20) and
      `trip-form.test.tsx`. Device checks: the largest text size, the focus ring at the row's edges, VoiceOver and TalkBack
      reading each radio, and `currency-CHF` (the fifth chip) in `02-notes-and-expenses` at 360 dp (add a
      `scrollUntilVisible` before that tap if it sits off the row's edge).
- [x] T436 [US3] `app/modal/add-expense.tsx` and `components/trip/date-field.tsx`,
      `anchor-picker.tsx` onto the adapters; failing tests first in `test/app/us2-screens.test.tsx` (FR-009)
      _As built:_ `modal/add-expense.tsx` is the second `FormSheet` form (add-trip's pattern; nothing in the adapter changed):
      root `add-expense-screen`, title "New expense", footer `add-expense-cancel` and `add-expense-save` ("Save expense", the one
      primary). The reading order is kept: title, Amount, Home currency, Category (+ New category), Paid on, City, Note, the save
      alert, Cancel, Save. Amount and Note are `Field`s with their ids and names; Amount stays a decimal STRING (`decimal-pad`,
      `autoFocus`, the placeholder from the device decimal separator) read by `parseAmount` in contracts (decimal.js), never
      `Number` (SC-016); Note has a Done key and a 500 limit; a refusal is `<id>-error`, an alert under the field. The city row is ONE
      sideways `ChipGroup` named "City" ("No city", then each city once; ids `add-expense-city-<id|none>` and the place-name labels
      kept). A save failure is the `InlineError` `add-expense-error`. With no form to show (trip loading, unreadable, not on this
      device) the same root id carries `LoadingState`, `ErrorState` "Couldn't read this trip" (error first, as the trip screen
      does) or the "isn't on this device" `EmptyState`, plus a secondary Close (`add-expense-close`, new): a sheet that is only a
      state needs an explicit way out (FR-009). `DateField` keeps its props, `testID`, `<testID>-picker`, name, value (the day in
      words), hint "Opens a calendar" and the iOS inline calendar and Android dialog; it is built from `Tappable`, `Text`, `Icon` and
      the `Field` height (no new adapter): the label on top, a box with the field fill and a 3:1 boundary (danger while refused), the
      day as `numeric` text that wraps beside a calendar glyph at the largest size, and an alert in words under it
      (`<testID>-error`, new). The iOS calendar stays the system control, not accent-tinted (a token only an adapter can read).
      `AnchorPicker` keeps its props, container id, `anchor-<key>` radios and its words for a trip with no stop; it is a wrapping
      `ChipGroup` with an `InlineError` (`<testID>-error`, or `anchor-picker-error`). Its group is left unnamed on purpose: a name
      would be `accessibilityLabel={label}`, which moves the unresolved-label ratchet. Tests: `us2-screens` (+31: sheet, order, one
      primary, Field words, locale placeholder, six amount strings, city row, day default through a faked `Date`, save error, the
      keyboard-visibility set, the three placeholder states, an adapter-only source scan), `date-field.test.tsx` (19),
      `anchor-picker.test.tsx` (13), `ui-kit/add-expense-real-render.test.tsx` (7). Follow-up: `CurrencyPicker` reads "Home
      currency" for an expense's own currency (T435, kept for FR-030); an optional `label` prop would fix it. Device checks: `autoFocus`
      raising the keyboard during presentation with Save above it (the form is taller than 360 x 640, so the body scrolls under the
      footer), the iOS inline calendar inside a `fitToContents` sheet (growth animation, a calendar below the fold, system accent),
      the Android date dialog from a sheet, `DateField` beside a `Field` in four themes and at the largest text, the sideways city row,
      VoiceOver and TalkBack order, Maestro 02 'Transport' after `hideKeyboard` at 360 x 640.
- [x] T437 [US3] `components/trip/stop-editor.tsx` (`Modal`, `pageSheet` on iOS) and
      `city-picker.tsx` onto `Field`, search list and `FormActions`; failing tests in
      `test/components/city-picker.test.tsx` and `test/app/trip-and-modal-screens.test.tsx`; ids
      `stop-editor`, `stop-editor-place`, `stop-editor-change-city`, `stop-editor-arrive`,
      `stop-editor-depart` kept (FR-009, FR-037)
      _As built:_ `stop-editor.tsx` is an RN `Modal` (the shared `FormModal`, see T438) around `FormSheet host="modal"`: title ("Add
      stop" or "Edit dates"), the picker or the place card, the dates, and a sticky Cancel and Save footer on `KeyboardStickyView`.
      The place is a flat `Card` (`stop-editor-place` is the city text alone, the country beneath, a secondary "Change city" `Button`);
      Save is the one primary in every state. The editor shows no save error: the write happens after it closes and the trip screen's
      `trip-write-error` reports it (T431). `DateField` is used through its props. `city-picker.tsx`: a search `Field` per step and ONE
      `ListGroup` of `ListRow`s (`city-picker-country-<ISO>` named by the country, `city-picker-city-<id>` "City, Country",
      `city-picker-change-country` "Country: X. Change country", trailing "Change"); loading, empty and error are `state-view`
      presentations beside the field so a traveller can retype; the offline note is an alert; the picker has no scroller of its own
      (the sheet body scrolls and keeps taps). The debounce, the geography hooks and every id are unchanged; new ids:
      `stop-editor-modal`, `-frame`, `-handle` (and `-body`, `-footer` from `FormSheet`). Tests: +13 in `city-picker.test.tsx` (rows,
      the 40-country cap and "Keep typing", states, a real-picker keyboard test), +19 in `trip-and-modal-screens.test.tsx` (Modal
      props, handle and inset per platform, order, one primary, keyboard-up submits), `ui-kit/stop-editor-real-render.test.tsx`; no e2e
      edit. Device checks: the iOS page sheet and swipe to Cancel, the handle beside a system grabber on newer iOS, the sticky footer in
      a dragged page sheet (keyboard-controller discussion 867), the footer, keyboard, top inset and Back on Android, largest text,
      Maestro 01, 03 and the offline add-stop helper (they tap city rows by text).
- [x] T438 [US3] `components/trip/note-editor.tsx` as a form sheet; `FormActions` sticky above the keyboard
      with `react-native-keyboard-controller`; a keyboard-visibility test for each form (FR-009)
      _As built:_ the editor stays an RN `Modal` (the notes screen opens it over its list from state and keeps the typed note on a
      failed save; it is not a route). The Modal is the shared `FormModal` (`components/ui/form-modal.tsx`, hoisted by the lead after
      the stop editor and the note editor had each grown the same code: `pageSheet`, `allowSwipeDismissal` so a swipe down is Cancel,
      `animationType` `none` under reduced motion, the iOS handle and the Android top inset; ids `<testID>-modal`, `-frame`,
      `-handle`; `form-modal.test.tsx`, 11). Inside it the body is `FormSheet host="modal"`: the title ("New note" or "Edit note"), a
      `KeyboardAwareScrollView` body of `AnchorPicker` (its current props), the title `Field` and a multiline note `Field`
      (`numberOfLines={6}`), then `InlineError`, and a sticky `FormActions` footer (Cancel, "Save note", the one primary) on a
      `KeyboardStickyView`. The form remounts per opening. Ids, names, copy and wire shape are unchanged (`note-editor`, `-anchor`,
      `-title`, `-body`, `-error`, `-cancel`, `-save`); new: `note-editor-scroll` (the sheet's body), `-footer`,
      `note-editor-title-error`, `note-editor-body-error`. Additive adapter changes: `FormSheet.bodyTestID` (the Note field owns
      `note-editor-body`, so the scroller cannot be `<id>-body`; `expectActionAboveKeyboard` takes `{ bodyTestID }`) and `Field`:
      `numberOfLines` on a multiline field is a minimum height of `lines x 24 dp + 16 dp` times the font scale (RN 0.86 honours the
      prop on Android only, so an iOS text area opened one line high; nothing else in `src` is a multiline `Field`). Tests:
      `test/components/note-editor.test.tsx` (30: presentation, parts and order, ids and names, one primary, Field attributes, words-only
      errors, largest text, the keyboard-visibility block on 360 x 640 for add, edit, invalid submit and save error), plus additions to
      `field.test.tsx`, `form-sheet.test.tsx` and `test/helpers/keyboard.test.tsx`. Every form sheet now has its keyboard-visibility
      test: add-trip (T434), add-expense (T436), the stop editor (T437) and this one. Known gap: the save error is last in the
      scrolling body and could sit below the fold with the keyboard up (announced as an alert; a `FormSheet` notice slot above the
      actions would fix it). Device checks: pageSheet interactive dismissal and the sticky footer following the keyboard on iOS
      (keyboard-controller discussion 867), the Android Modal (whether `statusBarTranslucent` and `navigationBarTranslucent` are needed
      for the footer to land on the keyboard, whether the bottom inset doubles), the six-line note field (internal scroll on Android,
      the caret followed, no clipping at the largest text size), Maestro 02 and the offline note flows.
- [x] T439 [US3] Update `e2e/01-account-and-trip.yaml` and `02-notes-and-expenses.yaml` where text changed;
      run on both platforms (FR-037)
      _Desk part done (as T432):_ every flow named here was read against the new ids, labels and texts of the screens it drives (the
      branches record the check per screen, and `test/testid-maestro.test.ts` agrees that every selector a flow uses is still served)
      and none needed an edit. _Pending on a device:_ running them on iOS and Android. Where the new layouts are taller or the sheets
      are shorter, a flow may need a `scrollUntilVisible` before a tap; the ones to watch are in the device checks of T435 (`currency-CHF`
      in 02 at 360 dp), T436 ('Transport' after `hideKeyboard`), T443 (flow 05 reaching `document-confirm-save` and
      `document-upload-status`) and T446 (`register-submit` after `hideKeyboard` in 01 and the offline helpers).

---

## Phase 5: User Story 4 - The everyday screens (P2)

**Goal**: notes, spending, photos, documents and offline maps follow the shared list, grid and state
language.

**Independent Test**: each area with data, with none, while loading and with a forced error.

- [x] T440 [P] [US4] Notes: failing tests in `test/app/us2-screens.test.tsx`; `app/trip/[id]/notes.tsx`,
      `components/trip/note-card.tsx`, `notes-header.tsx` (FR-015, FR-035)
      _As built:_ the screen has no bar of its own. `trip/[id]/_layout.tsx` turns the native header on for `notes` with the static
      title "Notes" and `HeaderBackButton` as `headerLeft`, as the overview. The title's ink and face come from the new adapter
      hook `useHeaderTitleStyle()` (`components/ui/header-title-style.ts`): a native title with no colour of its own takes
      `headerTintColor`, the accent, which FR-003 reserves for primary actions and selection, so the hook gives it the
      foreground ink and the display face (SemiBold), pinned in its test to what `stackHeaderOptions` gives top-level headers.
      The trip name is not in the title any more and `notes-title` is retired and allowlisted in
      `test/testid-parity.allowlist.json` (FR-007; no flow or test reads it). Screen: `ListScreen underHeader`; states per C4-10
      (`ListSkeleton card` named "Loading notes", `ErrorState` checked before loading with no retry because a live query has
      nothing to re-run, the same gap as Trips, and an empty state whose text names "New note" and which offers it as
      `notes-empty-add`). `notes-header.tsx` keeps the filter chips (one sideways `ChipGroup`, `notes-filter-<key>`), "New note"
      (`notes-add`, the one primary) and `notes-write-error` in the old reading order. `note-card.tsx`: an outer accessible
      `View` (`note-card-<id>`, same label, Edit and Delete actions) around a raised `Card` (`note-surface-<id>`; `pending`
      gives the dashed edge and `SyncBadge` stays the words and icon) with the anchor caption, headline title, a 160-character
      preview and Edit (`text`) and Delete (`destructive`) buttons with their old ids and names. Tests:
      `us2-screens.test.tsx`, `us2-components.test.tsx` (NoteCard), `trip-layout.test.tsx`,
      `test/ui-kit/notes-spending-real-render.test.tsx`, `header-title-style.test.tsx`. Device checks: Back and Back twice,
      iOS swipe-back with the custom `headerLeft` and the sideways filter chips, the title face and ink in four themes, the
      filter row at the largest text size, `Edit <title>` on iOS where the card is an accessible group, the soft red Delete.
- [x] T441 [P] [US4] Spending: failing tests in `test/components/us2-components.test.tsx` for the summary
      card (total, category summary, rate date in words, tabular numerals) and rows (icon, right-aligned
      amount); `app/trip/[id]/expenses.tsx`, `components/trip/spending-summary.tsx`, `expense-row.tsx`,
      `expenses-header.tsx` (FR-014)
      _As built:_ the native header for `expenses` is titled "Spending" and `expenses-title` is retired and allowlisted like
      `notes-title`. `SpendingSummary` is one raised `Card` (`spending-summary`): the home-currency total is the only
      `largeTitle` numeral (display face, tabular) under a muted "Total in CHF" caption; sections By category, By day, Rates
      applied and Awaiting a rate are headings (the pending one an `alert`); amounts and dates are `numeric` text; the rate date is
      in words ("Rates by <source>, as of <date>."). Rows are grouped by day (`features/expenses/group-by-day.ts`; one FlashList
      item is one day, a `ListGroup` headed by the date, `expense-day-<date>`). A row (`expense-row.tsx`) is a plain `View` in
      the group because `ListRow` has no slot for the marker and Delete: category icon (`components/trip/category-icon.ts`,
      `expense-icon-<id>`), the category headline with the note under it, the right-aligned tabular paid amount
      (`expense-paid-<id>`) over the home figure or "Awaiting a rate" (`expense-home-<id>`), the `SyncBadge` while pending and
      Delete (`expense-remove-<id>`, destructive), with the same spoken label as before. `expenses-header.tsx` keeps "Add
      expense" (`expenses-add`, the one primary) and the summary toggle, a `Tappable` named "Hide summary" or "Show summary" with
      its `expanded` state (the `Button` adapter has none). States as Notes (`ListSkeleton row` "Loading expenses", `ErrorState`
      with no retry, an empty state offering `expenses-empty-add`). Tests: `us2-components` (summary, row), `us2-screens`,
      `category-icon.test.ts`, `group-by-day.test.ts` and the real-kit render. Device checks: a grouped row, the card and the
      total at the largest text size on a 360 dp phone, FlashList measuring day groups and 1,000 rows (SC-006), the toggle
      announced as expanded or collapsed.
- [x] T442 [P] [US4] Photos: failing tests in `test/app/photo-screen.test.tsx`; `app/trip/[id]/photos.tsx`,
      `components/trip/photo-tile.tsx`, `photo-viewer.tsx`, `photos-header.tsx`, `photo-status.tsx`; no
      tint or shadow across thumbnails, boundary where tones match (FR-015, FR-033)
      _As built:_ no pre-004 id, name, role or state changed (parity holds; the unresolved-id ratchet did not move). Header:
      `trip/[id]/_layout.tsx` has a native header for `photos` ("Photos", `HeaderBackButton`, `useHeaderTheme`, the title style of
      `useHeaderTitleStyle`). `photos-title` cannot live in a native title, so it is the first line of the page and now holds only
      the trip's name (a `headline`, left out when the trip is not on the device); Maestro waits on that id. Screen
      (`photos.tsx`): `ListScreen underHeader` (`photos-screen`, new `photos-list`); loading is a `GridSkeleton` (new
      `ui/grid-skeleton.tsx`: square tiles in the grid's own column count under `LoadingRegion`, one `progressbar` "Loading
      photos"); error is `ErrorState` with "Try again", which remounts the gallery and so really re-reads the live query; empty
      names the next step; a failed or first read never shows rows left over. Header block (`photos-header.tsx`): `photos-add`
      is the only primary and `photos-take` a secondary, both announced busy during a capture; capture errors are
      `InlineError` (`photos-capture-error`), the info message a polite `Text` (`photos-capture-message`), a Settings failure
      `photos-settings-error`. Tile (`photo-tile.tsx`): one `Tappable` (`photo-open-<id>`, same name and hint, new
      `feedback="ring"`, additive) around a `MediaFrame` (hairline, no fill or shadow, nothing inside but the image) and the
      caption; press and focus draw a ring OUTSIDE the tile, never a fill, tint or chevron over a photograph (FR-033).
      `photo-status.tsx` keeps "Waiting to upload" and "Upload failed" and adds an icon (`photo-status-icon`) and a dashed or solid
      edge. Viewer: Close secondary, Delete destructive, filing a `ChipGroup`, no primary; `private-note.tsx` is shared by the
      header and the viewer. Tests: `photo-screen` (+ `-atlas`, `-harness`), `photos-header`, `ui-kit/photo-screen-real-render`,
      `grid-skeleton`, `tappable` additions. Device checks: title face and Back parity, the ring following the 16 dp corner within
      100 ms, skeleton tile layout, badge and retry wrapping at the largest text size, the hairline around a near-white photo in
      four themes, flows 05 and offline 01 and 06 on two devices.
- [x] T443 [P] [US4] Documents: failing tests in `test/app/document-screens.test.tsx` and
      `document-screens-edges.test.tsx`; `app/trip/[id]/documents.tsx`, `document-view.tsx`,
      `document-capture.tsx`, `components/trip/document-list-item.tsx`, `document-details.tsx`,
      `document-confirm-form.tsx`, `document-camera*.tsx`, `document-image.tsx`, `documents-header.tsx`;
      capture keeps full-bleed camera with opaque controls (FR-015, FR-033)
      _As built:_ `trip/[id]/_layout.tsx` has a native header for `documents` ("Documents") and `document-view` ("Document").
      `document-capture` stays headerless: it is a camera surface with its own opaque bar (`Button` text "Back" with a chevron,
      `document-capture-title`) and its preview is a full-width 3:4 hairline `MediaFrame` with every control opaque and OUTSIDE
      it (it never was full-bleed; nothing is drawn across the picture, FR-033). Ids, names, hints, roles and order of every
      pre-004 control are kept (parity holds, ratchet unchanged, no Maestro edit). List: `ListScreen underHeader`; the header
      block is `documents-title` (a muted context line with its old words, not a second title), the privacy promise as a flat
      notice `Card` (`documents-privacy`) and "Add document" (`documents-add`), the one primary. A row is ONE `Card` button
      (`document-row-<id>`, the same spoken sentence, hint "Opens the document", chevron) with a kind icon, `SyncBadge` and a
      dashed edge while a badge shows. States: `ListSkeleton` "Loading documents", an empty state that points at "Add document",
      and `ErrorState` with "Try again", which re-reads by remounting the live-query reader (`key`); the capture guard sits in the
      OUTER screen, so a retry never leaves a gap in protection. Viewer: `Screen keyboardAware underHeader`, the kind as a heading,
      the picture in a hairline `MediaFrame`, the fields in one `Card`, a secondary review button, Delete `destructive`, and
      "Confirm details" the one primary while the form is open. `DocumentConfirmForm` uses `Field`, `DateField` (still on the old
      look until T436 lands) and two `Button`s laid out as `FormActions` lays its own: `FormActions` was NOT used because it names
      Cancel `<prefix>-cancel` and the baseline names "Not now" and `document-confirm-not-now`, which the extractor only reads as
      literals (an additive-props version failed the parity check and was reverted). Capture: the kinds are a `ChipGroup`, the
      shutter is the one primary while the camera is live, the permission card has one primary, "Saving to this device..." is a
      polite live region. Security and privacy self-review: the vault, upload, cache, capture guard, app-switcher protection and
      logging are untouched; no sharing control; no new logging. Tests: `document-screens` (+ `-edges`) 61 to 108,
      `trip-layout` 12 to 17, `ui-kit/document-screens-real-render` (7). Follow-up: the confirm form sits in a keyboard-aware
      `Screen`, not on the shared sticky adapter. Device checks: Back twice on the list and the viewer, flow 05 reachability without
      a scroll (pages are about 32 dp taller; add `scrollUntilVisible` if not), the hairline in four themes (`MediaFrame` still reads
      `Colors[theme]`), keyboard and the Done key, kind icons, screenshot blocking and the Android recents blanking after a retry.
- [x] T444 [P] [US4] Offline maps: failing tests in `test/app/offline-maps.test.tsx`;
      `app/trip/[id]/offline-maps.tsx` with download-state chips and storage caption (FR-015)
      _As built:_ `trip/[id]/_layout.tsx` has a native header for `offline-maps` ("Offline maps"). The page draws no title or Back;
      it opens with the trip's name (`offline-maps-title`, which read "Offline maps - trip" before; absent until the trip is read)
      and the "what this is for" paragraph. One raised `Card` per city (`components/trip/offline-city-card.tsx`,
      `offline-city-<id>`): name as `headline`, country as muted `caption`, a status chip, then actions. The chip is the new
      `ToneChip` adapter (`components/ui/tone-chip.tsx`: icon and words in a capsule; `muted` and `default` outlined, `success` and
      `danger` soft 15% fills; one announced `text` element named by its spoken form). `offline-status-<id>` is that chip with the
      old text and spoken label ("Ready offline, 12.4 megabytes"); a failure stays an `InlineError` alert because a sentence is too
      long for a chip. Actions are compact `Button`s in `offline-actions-<id>` (wraps at large text): Download and Try again
      `secondary`, Stop and Remove `destructive`, ids, names and words unchanged; nothing is primary (FR-005). The storage caption
      (`offline-storage`, `features/trips/offline-storage.ts`) sums finished packs only ("Maps for this trip's cities use 20.5 MB
      on this device."). States: placeholder cards in one named `progressbar` region while stops, Mapbox or saved maps load;
      empty states that name the next step; Try again only on the saved-maps read (the stops live query and the Mapbox token have
      nothing to re-run: a recorded gap against C4-10 rule 2). Pack logic, confirmations and `use-offline-pack.ts` are untouched.
      Tests: `offline-maps`, `offline-maps-header` (real router), `ui-kit/offline-maps-real-render`, `tone-chip`,
      `test/features/offline-storage.test.ts`. Ratchet: labels 38 to 39. Device checks: `04-zoom` (taps `offline-download-.*` and
      waits for `offline-status-.*` with text `Ready offline.*`; the id now sits on the chip's accessible view), Back twice, the
      chips in four themes, large text, glyphs on both platforms.
- [x] T445 [US4] Update `e2e/02-notes-and-expenses.yaml` and `05-photos-and-documents.yaml` where text
      changed; run on both platforms (FR-037)
      _Desk part done (as T432):_ every flow named here was read against the new ids, labels and texts of the screens it drives (the
      branches record the check per screen, and `test/testid-maestro.test.ts` agrees that every selector a flow uses is still served)
      and none needed an edit. _Pending on a device:_ running them on iOS and Android. Where the new layouts are taller or the sheets
      are shorter, a flow may need a `scrollUntilVisible` before a tap; the ones to watch are in the device checks of T435 (`currency-CHF`
      in 02 at 360 dp), T436 ('Transport' after `hideKeyboard`), T443 (flow 05 reaching `document-confirm-save` and
      `document-upload-status`) and T446 (`register-submit` after `hideKeyboard` in 01 and the offline helpers).

      Also worth a look in 04-zoom: the offline status chip carries the old id and text on its accessible view (T444), and every
      `tapOn: 'Back'` after the notes, spending, photos, documents and offline-maps screens is now the header's Back (twice in a row
      must land on the screen beneath, not on a stale Back).

---

## Phase 6: User Story 6 - First impression and profile (P3)

- [x] T446 [US6] Welcome, Login, Register: failing tests in `test/app/auth-screens.test.tsx`;
      `app/(auth)/welcome.tsx`, `login.tsx`, `register.tsx`, `_layout.tsx` (native header with Back on Login
      and Register), `components/auth/provider-button.tsx`, `social-sign-in.tsx`, `google-sign-in-button.tsx`,
      `apple-sign-in-button.tsx` (FR-005, FR-017)
      _As built:_ `(auth)/_layout.tsx` keeps the `welcome` anchor and hides the header on welcome; Sign in and Create account get a
      native header (display-face title, token colours, no hairline) whose `headerLeft` is `HeaderBackButton`, so the control is
      named "Back" and `tapOn: 'Back'` should keep resolving. Screens: `Screen testID underHeader keyboardAware` for login and
      register; a fields `View`, then a `*-actions` `View` (`mt-auto`: the actions sit at the bottom of a tall screen and right
      after the fields on a short one) holding the `InlineError` (`login-error`, `register-error`), the one primary `Button`
      (`size="lg"`, `busy` while pending) and `SocialSignIn`. Welcome is a hero plus `welcome-actions` (Create account primary, Sign
      in secondary). Every id, name and the reading order are kept; added ids: `welcome-hero`, `welcome-actions`, `login-actions`,
      `register-actions`, `social-sign-in-buttons`, `provider-button-spacer`, `brand-glyph`. `ProviderButton` is a full-width outline
      `Tappable` with `BrandGlyph` (the only Ionicons importer, `components/ui/brand-glyph.tsx`) and "Continue with <Provider>";
      unavailable is disabled with "..., coming soon" in the name; busy shows "Signing in..." with the name unchanged. The custom
      Apple outline button stays (the native one offers only Apple's own looks and cannot sit as the same-prominence pair with
      Google's). Tests: `auth-screens`, `auth-layout`, `provider-button`, `social-sign-in`, `brand-glyph`,
      `ui-kit/auth-screens-real-render`. Device checks: Back parity and the iOS swipe-back from both forms, the register layout on
      the smallest phone (`register-submit` after `hideKeyboard`, which `01-account-and-trip` and the offline helpers assume; the
      stacked provider buttons add about 50 dp: add `scrollUntilVisible` if it is off screen), the keyboard under the native header,
      four themes, large text. Still open before release: the provider artwork and the stale wording of the "Branded sign-in
      buttons" row in `docs/release/store-readiness.md`.
- [x] T447 [US6] **Light security review** of the auth screens: `secureTextEntry`, `textContentType`,
      `autoComplete`, `autoCapitalize`, error mapping through `describeAuthError`, no field value logged or
      sent to Sentry; record the result here (AGENTS.md security gate)
      _Review result (no finding above low; two fixes made):_ `secureTextEntry` is on `login-password`, `register-password` and
      `register-confirm-password` only, with no reveal toggle. `textContentType`/`autoComplete` are `emailAddress`/`email`,
      `password`/`current-password` (login), `newPassword`/`new-password` (register), `name`/`name`. The three password fields had no
      explicit `autoCapitalize="none"` and `autoCorrect={false}`: now set (low; the OS already disables both for secure entry).
      Memory: TanStack Query kept the login and register mutation variables, the password, for five minutes after unmount;
      `gcTime: 0` on `useLogin` and `useRegister` (`features/auth/use-session.ts`, mutation options only; the session store and
      API are untouched) fixes it, pinned by `test/features/use-session-retention.test.tsx` with a default `QueryClient`. Screens
      render only `describeAuthError(error)`; unmapped API codes show the server message, which the API keeps free of input values.
      The auth sources contain no `console`, `Sentry` or storage call (a static test) and runtime spies see no email, password or
      token during submit, refusal and provider flows. No password or email in route params or URLs. Paste and autofill are intact
      (no `contextMenuHidden`, `editable={false}`, `onPaste`, `maxLength`). Regression tests: `test/app/auth-security.test.tsx` and
      the real-kit render. An independent read-only security review of the merged tree found nothing at medium or above. Not security,
      pre-existing and left alone: `returnKeyType="next"` on the name, email and register password fields moves no focus (no refs).
- [x] T448 [US6] Profile: failing tests in `test/app/tab-screens.test.tsx`;
      `app/(tabs)/profile/index.tsx` with `Avatar`, grouped rows, Sign out and Delete account set apart;
      `components/auth/sign-out-warning.tsx` restyled keeping the two choices (FR-016)
      _As built:_ `profile/_layout.tsx` is `<Stack screenOptions={useStackHeaderOptions('Profile')} />` (the Trips pattern: iOS large
      title, Android standard header). `profile/index.tsx` is a `Screen underHeader edges={[]}` with no title of its own: an identity
      `Card` (`profile-identity`) with a decorative `Avatar` and the name and email; an "Account" `ListGroup` with the home currency
      (the row's label keeps "Home currency: EUR" as one phrase); an "App" `ListGroup` with the version (`profile-version` on the
      trailing text); and a set-apart block (`profile-actions`): a Sign out group, then the warning or `profile-sign-out-error`
      (`InlineError`), then a Delete account group. Both action rows use `tone="destructive"` (danger ink plus an icon); Sign out
      has a logout icon and a visible description, Delete account stays disabled with "Coming soon". No control on the profile is
      primary. `SignOutWarning` keeps the wrapper `View` (`sign-out-warning`, role `alert`, assertive live region) around a `Card`;
      `sign-out-warning-stay` is the one primary and `sign-out-warning-anyway` the destructive one with the same hint; copy,
      announcement and behaviour are unchanged. Additive adapter changes: `ListRow` gained `busy` (announced busy and disabled,
      presses ignored, spinner in place of the chevron); `state-view.tsx` gained optional gate props, all off by default. Security
      self-review and an independent read: sign out still pushes first, the unsynced-changes guard and both choices are intact,
      `force: true` is reachable only from the warning, a busy row ignores a second press, no logging or new network call.
      Tests: `tab-screens`, `sync-runtime-profile`, `nested-stack-layouts`, `list-group`, `ui-kit/profile-gates-real-render`.
      Device checks: the large title collapse (iOS), Maestro `11-a-sign-out-unsynced` reaching the warning and both choices
      without a scroll on a small phone, largest text, the busy spinner, Delete account legibility in four themes.
- [x] T449 [P] [US6] `app/+not-found.tsx`, `components/ui/conflict-notice.tsx`,
      `components/sync/first-sync-gate.tsx`, `components/require-local-store.tsx` onto toast or alert and
      centred spinner states; tests in `test/components/sync-runtime-*.test.tsx` and
      `test/app/root-layout.test.tsx` (FR-035)
      _As built:_ `+not-found.tsx` is an `EmptyState` with an icon and `<Link asChild><Button>` "Back to your globe" as the one
      primary (the router passes `role="link"`, so it is still announced as a link; `test/app/not-found.test.tsx` presses through
      a real router). `conflict-notice.tsx` shows each notice as a raised `Card` (`conflict-notice-<id>`) with a sync glyph, the
      engine's sentence, a secondary "View trip" (`-open`) and a text "Dismiss" (`-dismiss`); the polite scroll region
      (`conflict-notices`, 40% cap), the iOS announcement and every label are unchanged. It is a banner, not the kit's Toast,
      because FR-040 means the traveller must be told and a toast leaves by itself, so no toast adapter was added.
      `first-sync-gate.tsx`: opening and syncing are a `LoadingState` (one progressbar named by its title, the detail as value
      text, no spinner under reduced motion), offline and session-ended a neutral `EmptyState`, failed an `ErrorState` whose retry is
      secondary and announced busy; `first-sync-state` keeps its id and polite live region. `require-local-store.tsx` needed no
      change (already on `LoadingState`/`ErrorState`, ids `local-store-opening` and `local-store-error`). `state-view.tsx` gained
      optional gate props (`detail` and `spinner` on `LoadingState`, `testID` and `accessibilityLiveRegion` on any state, `busy` on an
      `EmptyState` action, `retryBusy` on `ErrorState`). Tests: `not-found`, `sync-runtime-conflict-notice` (+7),
      `sync-runtime-first-sync` (+8), `ui-kit/profile-gates-real-render`. Device checks: Maestro `07-b` and `10-b` waits ('Syncing
      your trips', 'You.re offline') on both platforms, screen-reader reading of the progressbar and the notices, largest text,
      `Link asChild` navigating through the `Button` adapter.
- [x] T450 [US6] Update `e2e/00-smoke.yaml` and `01-account-and-trip.yaml` where text changed; run the full
      Maestro suite on both platforms (FR-037)
      _Desk part done (as T432):_ every flow named here was read against the new ids, labels and texts of the screens it drives (the
      branches record the check per screen, and `test/testid-maestro.test.ts` agrees that every selector a flow uses is still served)
      and none needed an edit. _Pending on a device:_ running them on iOS and Android. Where the new layouts are taller or the sheets
      are shorter, a flow may need a `scrollUntilVisible` before a tap; the ones to watch are in the device checks of T435 (`currency-CHF`
      in 02 at 360 dp), T436 ('Transport' after `hideKeyboard`), T443 (flow 05 reaching `document-confirm-save` and
      `document-upload-status`) and T446 (`register-submit` after `hideKeyboard` in 01 and the offline helpers).

      Also: `11-a-sign-out-unsynced` taps `profile-sign-out` and waits for `sign-out-warning` (T448: the profile is taller now), and
      `07-b` and `10-b` wait on 'Syncing your trips' and the offline text (T449). `01-appearance` uses `tapOn: 'Back'` on Sign in and
      Create account (T446).

---

## Phase 7: Retire neumorphism (polish and cross-cutting)

- [x] T451 Failing check first: `apps/mobile/test/no-neumorphism.test.ts` that searches `src/` for
      `surfaceStyle`, `PressableSurface`, `elevationProfile`, `treatment=`, `depth=` and the word
      "neumorphic" and fails on any hit; it is the executable form of SC-001 and fails until T452 to T455 are
      done
      _As built:_ `test/no-neumorphism.test.ts` reads every text file under `src/` (ts, tsx, js, jsx, css, json, md; co-located tests
      included, `test/` and `specs/` excluded on purpose) and fails with `file:line label text` per hit. The patterns are the quickstart
      section 9 ones, case-insensitive, plus `depth=`: `neumorph`, `surfaceStyle`, `PressableSurface`, `elevationProfile`,
      `treatment=`, `depth=`. It also asserts the tree has more than 100 files and that each pattern matches a sample, so a path typo
      cannot make "no hits" vacuous. The first run was red with 114 hits in 37 files; it is green after T452 to T455.
- [x] T452 Delete `src/theme/surfaces.ts`, `elevation-profile.ts`, `hooks/use-surface.ts`,
      `components/ui/surface.tsx`, `pressable-surface.tsx`, `text-field.tsx`, `pill-group.tsx` and their
      tests (FR-038)
      _As built:_ deleted `theme/surfaces.ts`, `theme/elevation-profile.ts`, `theme/ink.ts`, `hooks/use-surface.ts`,
      `components/ui/{surface,pressable-surface,text-field,pill-group}.tsx`, `components/themed-view.tsx`,
      `components/themed-text.tsx` (no user was left), `components/trip/status-pill.tsx` (only a test imported it; `StatusChip`
      replaced it) and the tests of `surface`, `pressable-surface`, `text-field` and `themed-view`, plus
      `test/theme/{elevation-profile,surfaces-flat-border,adaptations}.test.ts`. `surface-nesting.tsx` stays. Every behaviour the new
      code keeps is pinned by its replacement's suite (busy, disabled, touch target and focus ring in `tappable` and `button`; error and
      announcement in `field`; "Status: ..." and the two-child shape in `chip`; the 7:1 contrast in `palette-gate`). Dropped with them:
      the FR-025 "controls over media" test in `media-frame.test.tsx` (no control overlays media now). The parity check named
      `text-field-surface` (the retired `TextField`'s internal id; no screen, test or flow used it), now in
      `test/testid-parity.allowlist.json` with a T452 reason; the ids `notes-title` and `expenses-title` (T440, T441) are there too. The
      unresolved-id ratchet moved with the deletions (the retired primitives forwarded dynamic ids and labels) and with `FormSheet`,
      `FormModal` and the new adapters; its current value is in `test/fixtures/testid-unresolved-count.json`.
- [x] T453 Remove the `treatment`, `depth`, `radius`, `pending` neumorphic props from
      `components/themed-view.tsx`; remove `Depth`, `LightSource`, `BorderHairline` uses that only served
      shadows, and the `shadowLight`, `shadowDark`, `surfaceSunk` keys from `constants/theme.ts`; delete
      `elevationProfile` and `prefersLessTransparency`-only branches that no longer apply from
      `hooks/use-appearance.ts` (keep the flag) (FR-038)
      **Also, when the last unmigrated screen moves:** `useAppearance().tokens` must switch from the
      two-theme `Colors` to the `Palette` for `themeName` (including `light-contrast` and
      `dark-contrast`). Until then unmigrated screens read `Colors[theme]` and ignore the increased-contrast
      palettes; only the kit-based screens follow `themeName`.
      _As built:_ `ThemedView` is deleted: `Screen` and `ListScreen` render a `View` with the `bg-background` class and the canvas token
      style, as before. `Colors` (`constants/theme.ts`) is keyed by all four theme names (canvas, surface, textPrimary, textMuted, border,
      accent, accentInk, danger), read from `Palettes[name]`, and `useAppearance().tokens` is `Colors[themeName]`, so the root view, the
      root stack scene, the navigation theme, the tab scenes, `Screen`, `ListScreen` and `MediaFrame` paint the CONTRAST canvas the kit's
      `--background` uses: the gap recorded under T427 and T431 is closed in Jest. Removed: `elevationProfile` from the context; `Depth`,
      `DepthLevel`, `LightSource`; the keys `shadowLight`, `shadowDark`, `surfaceSunk`, `borderStrong` and `separator`. Kept:
      `BorderHairline` (tab bar divider, `MediaFrame`), `Radius`, `prefersLessTransparency` (nothing branches on it; the flag stays).
      `ThemeName` moved to `theme/palette.ts`. Tests: tokens per theme name and the live contrast switch (`use-appearance.test.ts`,
      `use-appearance-shared.test.tsx`); `--background` equals the canvas token in four themes (`header-theme.test.tsx`); tab scenes in four
      themes; the root view, navigation theme, root scene and a real `Screen` in four themes and on a live switch (`root-layout.test.tsx`,
      reading the outermost scene wrapper because the kit paints nested stacks and Jest stubs it); the `MediaFrame` edge in four themes. A
      mutation back to `Colors[theme]` fails six of them. _Device only, still open:_ no seam under the native header, the trip scene or the
      tab bar in all four themes with a live system dark-mode or increased-contrast switch with a trip open, and the splash-to-first-frame
      canvas in the two contrast themes.
- [x] T454 Rewrite `eslint.config.js` comments that cite 002 contract C1 to cite C4-1; update
      `apps/mobile/README.md` (dev-client rebuild for the new native modules, theme build, fonts)
      _As built:_ `eslint.config.js` cites C4-1 and FR-036 (it cited 002 C1, and its message pointed at the deleted `use-surface`), with one
      shared raw-colour message. `apps/mobile/README.md` gained the dev-client rebuild (`react-native-svg`, `expo-blur`, `expo-haptics`
      and the `expo-font` plugin), the Atlas look, `theme:build` and `theme:check`, the fonts, the Windows Jest, ESLint and Prettier
      commands and a refreshed layout map.
- [x] T455 Rename leftovers (`NeumorphicTabBar` references, test names, comments), remove the 002-only
      theme tests that assert deleted behaviour (`test/theme/elevation-profile.test.ts`,
      `adaptations.test.ts` parts), keep `contrast-gate.test.ts` and `globe-contrast-gate.test.ts`
      _As built:_ no `NeumorphicTabBar` reference remained. Test names that said "neumorphic" now say "retired"; stale "until phase 7" and
      "unmigrated" comments are reworded in `chip`, `field`, `screen`, `sync-badge`, `text`, `shape` and `tappable`.
      `contrast-gate.test.ts` is kept and runs over the four themes; `globe-contrast-gate.test.ts` is untouched. Removed with their
      subject: `elevation-profile`, `surfaces-flat-border` and `adaptations` tests; trimmed: the `StatusPill` block of
      `trip-components.test.tsx` (covered by `chip.test.tsx`), the `surfaceStyle` block of `edge-cases.test.ts`; `theme-switch.test.ts` is
      rewritten for four themes.
- [x] T456 Run `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile && npm run format:check`
      and the quickstart section 9 search; `T451` must now pass (SC-001, SC-004)
      _As built (at the end of phase 7):_ `tsc --noEmit` and `eslint . --max-warnings=0` clean; Jest with coverage 195 suites, 4335 tests (after the merge with the feedback pass),
      98.69 / 95.13 / 99.09 / 99.51 (statements, branches, functions, lines); `prettier --check` clean on the changed files; the testid
      baseline check and `theme:check` pass; the quickstart section 9 search prints nothing and `no-neumorphism.test.ts` is green.

---

## Phase 8: User Stories 5 and 7 - Readable anywhere; controls that answer to the touch (P2, P3), and release gates

- [ ] T457 [US5] Appearance matrix sweep (quickstart section 5): every route in light, dark,
      increased contrast, largest text, reduced motion, reduced transparency; fix every clipped, untinted or
      left-behind element (FR-027, FR-028, FR-029, SC-007, SC-008)
- [ ] T458 [US5] VoiceOver and TalkBack pass (quickstart section 6): names, roles, states, order, actions on
      Trips, Trip, add-trip sheet, Profile and sign-in (FR-030, SC-009)
- [ ] T459 [US5] Outdoor and 5-second tests: shown stills, 95% identify what is tappable; 9 of 10 find each
      primary action in direct sunlight; record results (SC-009)
- [x] T460 [US7] Feedback pass: pressed state within 100 ms on every control kind, busy, disabled,
      selection, save and destructive-confirmation haptics, none under reduced motion; failing tests in
      `components/ui/tappable.test.tsx` and `hooks/use-haptics.test.ts` extended where gaps show (FR-019,
      FR-020, FR-022, SC-005)
      _As built (desk part; the device checks below are pending):_ every control is a `Tappable`, `Button`, `Chip`, `ListRow` or `Card`, and
      all answer at touch-down: `Tappable` and `Card` are asserted through the responder (`test/helpers/touch.ts`: grant, no timer, no
      release), the others by their `active:` classes; the `Chip`, `ListRow` and `Card` pressed fills are now measured (a 1.08:1 step and
      labels at their floor in four themes, `test/ui-kit/pressed-fills-chip-row-card.test.ts`; they must never sit on an overlay, because
      in the dark themes `surface-tertiary` IS the overlay). Gaps closed: (1) the kit's press scale on `Button` ran 300 ms, over FR-022's
      200 ms and the 100 ms press token: it is now `Motion.pressMs` both ways (the highlight stays off); (2) no save played a haptic:
      `useWriteAttempt.attemptSave` plays `success` once the local write has gone through (never on a failure) and add-trip and add-expense
      play it after the create; wired for the trip, expense, note, stop and document-fields saves; (3) a confirmed deletion played nothing:
      `attemptRemoval` (and `useHaptics().warning()` in offline maps) plays `warning` when the native confirmation is answered (note,
      expense, stop, document, photo, offline map Remove and Stop); the destructive `Button` still warns on the press that opens the
      question, so a deletion buzzes twice (a decision for the device pass); (4) the stop grip showed nothing for the 150 ms hold: it now
      paints the held fill from the touch events, and the lift and the drop settle in `Motion.transitionMs` instead of 300 ms. Reduced
      motion: every haptic goes through `useHaptics` (the only `expo-haptics` import), asserted through the real hook for `Button`,
      `ChipGroup`, add-trip and the sign-out warning. Left as is: no success haptic on photo or document capture (a record is not saved until
      uploaded, AGENTS.md); Sortable's item enter and exit and reorder transitions stay at the library's 300 ms; save buttons have no busy
      state (synchronous local writes), so a fast double tap before the sheet dismisses might create a duplicate trip (not tested).
      _Device checks:_ real touch-to-paint latency (and iOS `ScrollView` delaying content touches); that Uniwind's `active:` classes reach
      the kit's animated `Pressable` for `Button`, `Chip` and `ListRow` (research D4-02 item 4: if not, `Button`'s only pressed cue is the
      100 ms scale); that touch events fire on the grip beside the gesture-handler drag; haptic strength, and whether selection plus
      success on one save is too busy.
- [ ] T461 Performance and size: repeat T415's measurements; fix any regression (virtualisation, memoised
      rows, image recycling); report the bundle and font delta (SC-006, SC-011). `Tappable` and `Button` read the
      font scale from `useWindowDimensions` and do not call `useAppearance` themselves. Follow-up, before the
      list baseline:
  - [x] Share ONE accessibility subscription across all consumers of `useAppearance`: a module-level
        `useSyncExternalStore` store (`hooks/appearance-store.ts`), ref-counted, stale-while-revalidate and
        with a stable snapshot, so `useHaptics` (so every `Button`) no longer runs its own
        `AccessibilityInfo` reads and listeners (contract C4-4; `hooks/appearance-store.test.ts`,
        `hooks/use-appearance-shared.test.tsx`).
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
