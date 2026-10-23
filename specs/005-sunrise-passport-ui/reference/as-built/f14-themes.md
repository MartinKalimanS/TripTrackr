# F14 Themes, motion and transparency sweep (T562): as built

Branch `feat/f14-themes` (from `feat/ui-stack`). Task T562; spec FR-073, FR-078, FR-079, SC-008; UI-SPEC sections 1 (themes), 2.3
(motion) and 2.4 (surfaces); quickstart section 7. No pictures: this task is a test-first sweep of every route, plus the smallest
fix for every gap it found. The device checks are listed, not claimed.

## What was built

A test kit in `apps/mobile/test/appearance/` (not shipped) and seven suites on it:

| File                                                       | What it is                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit.ts`, `colours.ts`                                   | Walks `screen.toJSON()`. `literal`: a colour in a style or colour prop that is not a token of the theme being painted (so a raw colour, or a token of ANOTHER theme). `translucent`, `blur`, `glass` only when `opaque`.                                                                                                                              |
| `allow-list.ts`                                            | The documented exceptions, each with its reason (below). Anything else translucent fails.                                                                                                                                                                                                                                                             |
| `sweep.tsx`                                                | `sweepScreen(label, build, prepare, settle)`: four themes, then light and dark under reduced transparency. Paints through the REAL appearance chain (`AppearanceScope`, T524): `useAppearance`, `useAccessibilityFlags`, `useColorScheme` answer for the scope; the kit's `useThemeColor` answers from the generated stylesheet of the scope's theme. |
| `audit.test.tsx`                                           | The audit can fail: each finding on a tree that has it, each exception, and the real tab pill (blur on iOS, glass on iOS 26, solid under either flag).                                                                                                                                                                                                |
| `screens-auth`, `screens-tabs`, `screens-trip` `.test.tsx` | The sweeps: 29 screens and states by 6 renderings = 174 renderings, every one without a thrown error.                                                                                                                                                                                                                                                 |
| `inventory.test.ts`                                        | Reads `src/app/**` (layouts and the dev gallery are not screens): 17 screens, each must be imported by a sweep suite.                                                                                                                                                                                                                                 |
| `reduced-motion.test.tsx`, `reduced-motion-home.test.tsx`  | Reduced motion per animated component, each with a control (motion allowed: the movement is there). `motion.ts` reads CSS animations, transitions and layout animations out of the tree.                                                                                                                                                              |
| `live-switching.test.tsx`                                  | The appearance changes on a mounted screen: through the scope, and through the real appearance store fed by `AccessibilityInfo` events.                                                                                                                                                                                                               |

## Screens by theme and flag

Every row: light, dark, light-contrast, dark-contrast (token colours only; the two contrast themes also opaque: no blur, no glass,
no translucent background or fill) and light, dark with reduced transparency (opaque). All six pass for every row.

| Route (file under `src/app`)                               | Sweep rows                                                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `(auth)/welcome`                                           | Welcome                                                                                      |
| `(auth)/login`, `(auth)/register`                          | Sign in, Create account                                                                      |
| `+not-found`                                               | Not found                                                                                    |
| `(tabs)/index` (Home)                                      | Home (live trip, three changes waiting), Home (no trips, last sync failed), Live pin callout |
| `(tabs)/trips/index`                                       | Trips, Trips (offline notice), Trips (sync error notice), Trips (loading), Trips (empty)     |
| `(tabs)/profile/index` (You)                               | You (passport card, stamps, groups)                                                          |
| the tab bar (`(tabs)/_layout` chrome)                      | Tab bar (iOS pill), Tab bar (Android Material bar)                                           |
| `trip/[id]/index`                                          | Trip, Trip (loading), Trip (not on this device)                                              |
| `trip/[id]/photos`                                         | Photos, Photos (loading), Photos (empty)                                                     |
| `trip/[id]/notes`, `expenses`                              | Notes, Spending                                                                              |
| `trip/[id]/documents`, `document-view`, `document-capture` | Documents, Document viewer, Document capture                                                 |
| `trip/[id]/offline-maps`                                   | Offline maps (with one saved map, so the tile's saved area is drawn)                         |
| `modal/add-trip`, `modal/add-expense`                      | Plan a trip (sheet), Add an expense (sheet)                                                  |

Not swept, with the reason: the dev gallery (`(dev)/gallery`, its own suites `test/dev/`); the layouts (`_layout.tsx` x8: they draw
no surface of their own except the tab bar, which is swept; their suites are `test/app/*-layout*.test.tsx`).

## What the sweep found, and the smallest fix

The rows that exposed a gap were red before their fix (the findings below are what the audit printed) and are green after; every other row was green as it stood.

| Gap (FR-072, FR-073)                                                                                                                                                                                                                      | Where                                                                                               | Fix                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The dark themes write the five tints (`accentTint`, `aquaTint`, `amberTint`, `dangerTint`, `successTint`) as 14 to 16 percent colours; `dark-contrast` and dark under reduced transparency drew translucent chips, pills and button fills | `useColors` consumers: `StatusChip`, destructive `Button`, category and privacy chips, notices, ... | `components/ui/solid-ground.ts` (`useOpaqueSurfaces`, `solidOver`); `useColors` reads the `surface` in the SAME kit call and lays a tint over it under either flag. Light tints are opaque already: unchanged. |
| Home search disc ("onSky" icon button) and the sync chip: the paper at 92 percent over the globe                                                                                                                                          | `components/ui/icon-button.tsx`, `sync-chip.tsx`                                                    | the paper itself under either flag                                                                                                                                                                             |
| Selected tab capsule of the dark pill: white at 14 percent on the solid pill                                                                                                                                                              | `components/navigation/tab-capsule.tsx`                                                             | that white laid over the pill's own tint (`tabTint`) under either flag                                                                                                                                         |
| Android indicator: accent at 26 or 28 percent                                                                                                                                                                                             | `components/navigation/android-nav-bar.tsx`                                                         | the accent blended over the bar under increased contrast                                                                                                                                                       |
| Saved area of an offline map tile: coral drawn at opacity .14                                                                                                                                                                             | `components/trip/offline-map-tile.tsx`                                                              | the coral already blended over the sea tint under either flag (`AREA_FILL` exported for the test)                                                                                                              |

Existing expectations that pinned the translucent colour in the contrast themes now pin the opaque one, because FR-072 says so:
`button.test` (destructive fill in the contrast themes: the tint laid over the paper), `tab-pill-fidelity.test` (the dark-contrast
capsule), `android-nav-bar.test` (the indicator in the contrast themes). `theme-tokens.test`: `useColors` makes one kit call per
render (the hook now also hears the shared accessibility store, whose first read re-renders it once) and its last colour is `surface`.

No gap was found in the screens, the globe, the callout, the sheet, the toast, the photo tiles or the forms: they were already
opaque or on a documented exception.

## The allow-list (`test/appearance/allow-list.ts`), with reasons

| Exception                                                      | Reason                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Translucent background equal to the theme's `scrimButton`      | A control disc over a photograph (glass Back, sync badge on a tile, photo-tile veil): the scrim the white glyph needs (M-5), darker in the contrast themes.                                                 |
| `backdrop`                                                     | The dim behind a modal sheet or the viewer: a scrim over the screen, not a surface; the sheet in front is opaque.                                                                                           |
| `hairline` on a node 2 dp or less                              | A divider is a line, translucent by design, explicit in the contrast themes. A 48 dp box in the hairline colour is still a finding.                                                                         |
| `grab` on a node 6 dp or less                                  | The sheet handle is a graphic.                                                                                                                                                                              |
| Sign in with Apple / Google brand colours (`brand-artwork.ts`) | A provider's colours belong to its brand (Apple: black on white or white on black; Google: its light and dark button and the four-colour G). Token-layer data, never a screen literal.                      |
| `status-pill-active` and its dot: the LIGHT palette            | `PhotoStatusPill` is a white pill with navy words on a photograph in every theme, on purpose (it reads on any photograph); its dot and shadow are light tokens (contrast variant under increased contrast). |
| Scrims (`Scrim` gradients), shadows                            | Scrims are gradients, not a background; a `boxShadow` must be a `Lift` of the theme or a token colour, and is drawn BEHIND a surface.                                                                       |

Not auditable under Jest, listed so nobody assumes they were checked (device check D5): the kit's shimmer highlight
(`skeletonHighlight`, 16 percent amber, drawn by the kit's own gradient inside `ShimmerGroup`; removed under reduced motion; it is a
moving highlight over an opaque bone, not a surface), and class-level opacity (`opacity-disabled` on a disabled control, the 3 dp
toast countdown bar `opacity-90`, the `PhotoBone` pin glyph `opacity-50`); Uniwind classes do not resolve to styles in Jest.

## Reduced motion (SC-008), per animated component

| Movement                                  | Test (`test/appearance/`)                 | Control: motion allowed                     | Reduced                                       | Also pinned by                              |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| Count-up                                  | `reduced-motion` "the count-up"           | a frame timer runs                          | final text at once, no timer                  | `animated-number.test`                      |
| Shimmer                                   | "the shimmer"                             | group `shimmer`, 1.4 s                      | group `variant none`, `animation disable-all` | `skeleton.test`, `state-skeletons.test`     |
| Stamp landing (+ its heavy haptic)        | "the stamp landing"                       | `entering` keyframe, landing timer          | no `entering`, no timer                       | `stamp-in.test`                             |
| Haptics (hook, primary press, tab change) | "haptics"                                 | `expo-haptics` called                       | not one call                                  | `use-haptics.test`, `use-haptics-map.test`  |
| Tab capsule spring                        | "the tab capsule spring"                  | `withSpring(.., sheetSpring)`               | none                                          | `tab-bar.test`                              |
| Welcome globe rotation                    | "Welcome: the globe is still"             | still for everyone (no timer, no animation) | the same                                      | `welcome-pictured.test`                     |
| Idle spin of the Home globe               | `reduced-motion-home` "the idle rotation" | one 5 s timer                               | none                                          | `home-screen-motion.test`, `idle-spin.test` |
| Beacon and Home figures                   | "a live trip"                             | timers run                                  | no live timer, no animation in the tree       | `globe-view.test`, `stats-row.test`         |
| Live pin pulse                            | "the live pin"                            | `animationName`, iteration count infinite   | no animation of any kind, a faint still ring  | `active-callout.test`                       |
| Sheet spring                              | "the sheet"                               | a tap on the handle starts a spring         | the same tap jumps, no spring                 | `sheet.test`, `home-sheet.test`             |

Covered by their existing suites only (not repeated): toast `disable-all`, hero collapse, photo viewer fade, `FormModal` slide,
trip cover transition, first-sync spinner, state-view spinner, press scale.

Welcome: the globe is a static composed image for everyone (F12 decision, `welcome-globe.tsx`), so "rotation removed" is satisfied
by construction; the test pins that it stays so. No gap found in the count-up or stamp hooks (the DELIGHT agent's files): they were
only asserted.

## Live switching (FR-078, FR-079)

`live-switching.test.tsx`: (1) the Sign in form stays the same node with the typed text through light, dark, light-contrast,
dark-contrast and back, its canvas repainted each time; (2) the iOS pill swaps blur for solid under reduced transparency and
increased contrast and back; reduced motion silences the next haptic and restores it; (3) the real appearance store follows the
three `AccessibilityInfo` events (`reduceTransparencyChanged`, `darkerSystemColorsChanged`, `reduceMotionChanged`) on a pill that
stays mounted. Every case fails on any `console.error`. The OS colour scheme changing is the scope's path in Jest (the hook reads
React Native's `useColorScheme`, which Jest cannot drive): a device check.

## Contrast gate

`npx jest test/theme/contrast-gate.test.ts`: 213 tests, all pass. **No pair fails.** The two pinned exceptions stay what they were
and are verified in both directions by the gate itself: `FILL_BELOW_FLOOR` (the coral fill is below 3:1 on paper in `light` and
`light-contrast`, compensated by the primary edge ring) and `DISPLAY_SIZE_ONLY` (`accentText` on the light sky glow at display size).

## Deviations, notes for the integrator

- **Token change NOT made (listed, as asked):** the cleanest long-term fix for the dark tints is `palette.data.js` writing
  `dark-contrast` tints as opaque colours (the blends of `solidOver`). That file and `theme.css` belong to `f14-atlas`'s change, so
  the opaque colour is computed in the adapter layer instead; if the palette later does it, `solidOver` simply returns the
  already-opaque colour (it leaves a colour with no alpha byte unchanged) and nothing else changes.
- `useColors` now subscribes to the shared accessibility store (one `useSyncExternalStore`, the one `Button` and `Chip` already
  use), so a consumer re-renders once after the store's first read and when a flag changes. The store keeps one native listener per
  event for the whole app; the cost in a 1,000-row list is a Set entry per mounted consumer. Frame rates are device check D6 (T563).
- `reduceTransparency` is structurally false on Android (`accessibleFallbackFlags`); the Android rows force it anyway, which is a
  stricter check than the platform can ever produce.
- The count-up trigger policy and the stamp landing (DELIGHT) are only asserted: if a policy there stops a count-up on a second
  mount in one module (a "once per appearance" memory), the control of `reduced-motion` "the count-up" ("a frame timer runs") must
  mount in a fresh module state; nothing here edits those hooks.
- `test/appearance/inventory.test.ts` pins 17 screens: a new route without a sweep fails it.

## Device checks (not claimed)

D1. iOS, app open: Settings > Accessibility > Display and Text Size > Increase Contrast, Reduce Transparency; Motion > Reduce Motion;
Display and Brightness > Dark. On Home, Trips, a trip, a form sheet: each change repaints without leaving the app; the pill goes
from glass or blur to solid at once; no haptic after Reduce Motion; nothing stays in the previous theme.
D2. Android, app open: dark mode, High contrast text, Remove animations: same checks on the Material bar and the list screens.
D3. iOS 26 Liquid Glass: Reduce Transparency swaps the `GlassView` for the solid pill with no flash (T510, V4).
D4. The globe and map lighting, the sky, the status bar and the sheet change together with the theme (FR-078): Mapbox is not drawn
under Jest.
D5. The kit's shimmer in the two contrast themes (`skeletonHighlight`, translucent highlight over an opaque bone): decide whether it is
acceptable or the highlight should be solid there; class-level opacity of disabled controls and the toast countdown.
D6. Frame rates and the sheet drag after the `useColors` store subscription (T563 baselines).

## Evidence, one line per small step

| Step                                                                                   | Tests                                                                                                            | Commit                         |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Audit, allow-list, sweep helpers, positive controls                                    | `audit.test` green                                                                                               | `55ec18d`                      |
| Sweep of Welcome, Sign in, Create account, Not found (24 renderings, no screen change) | `screens-auth` 24 green                                                                                          | `5f90556`                      |
| Fix: tints, sky paper, capsule, Android indicator opaque under either flag             | `solid-ground.test`, `theme-tokens.test`, `button.test`, `tab-pill-fidelity`, `android-nav-bar`, `tab-bar` green | `950a013`                      |
| Sweep of Home, Trips, You, the tab bars, every trip route, the sheets; route inventory | `screens-tabs`, `screens-trip`, `inventory` green (red on the four gaps before the fix)                          | `caca78a`                      |
| Reduced motion per component, through the real chain                                   | `reduced-motion`, `reduced-motion-home` green                                                                    | `bb014f6`                      |
| Live switching on mounted screens and from OS events                                   | `live-switching` green                                                                                           | `063f63a`                      |
| Audit reads fill opacity; offline tile saved area opaque (red in 4 renderings first)   | `screens-trip` "Offline maps", `audit.test`, `offline-maps.test` green                                           | `6b45923`                      |
| Trips offline and sync error notices swept                                             | `screens-tabs` green                                                                                             | `cc52682`                      |
| This note                                                                              | gates below                                                                                                      | the commit that adds this file |

Final gates on the tree: the full `npx jest --ci --maxWorkers=2`: 385 suites, 9,291 tests passed, 3 skipped (none in this task's files), one "worker failed to exit gracefully" notice at the end of the run that no suite or `--detectOpenHandles` of the sweeps explains; `npx tsc --noEmit` clean; `npx eslint . --max-warnings=0` clean; `prettier --check` on every
touched file clean; `node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json` holds (205 testIDs, 64 labels; no
id added or removed, the unresolved count file untouched); `node scripts/build-theme-css.mjs --check` up to date.
