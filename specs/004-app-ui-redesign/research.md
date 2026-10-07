# Phase 0 Research: App UI Redesign ("Atlas")

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-07

Decisions are numbered `D4-nn` (feature 003 used `D3-nn`, feature 001 `D-nn`). Facts below were read
from the sources named, or measured with `apps/mobile/src/theme/contrast.ts`'s WCAG formula, on
2026-10-07. Anything that could not be confirmed from documentation is listed in
[Items to verify empirically](#items-to-verify-empirically) and is the content of the spike
(tasks T401 to T409), not an assumption.

## D4-01 — Direction: "Atlas", a content-first travel journal

**Decision**: Replace the neumorphic identity with Atlas: warm paper-tinted neutrals, ink text, one
cobalt accent equal to the globe's "active" connection colour, grouped lists, photo-forward trip
cards, native navigation chrome. Three words: calm, assured, worldly. Light and dark are both
designed; increased-contrast variants of each are generated.

**Rationale**:

- The product is used outdoors, in transit and at night. A flat, high-contrast, content-first style
  is legible in sunlight where soft low-contrast depth is not (feature 002's own risk statement).
- Expo's published native-UI guidance says to follow Apple's Human Interface Guidelines on iOS and
  Material 3 on Android, to use the navigation stack's title rather than a custom text element, and
  never to dress one platform in the other's uniform
  (`github.com/expo/skills`, `expo-native-ui`). The current screens break all three.
- Reference travel apps agree on the shape of the answer. Flighty (Apple Design Award 2023,
  Interaction) aims to be "boringly obvious", gives each item one line like an airport board, packs
  data into glanceable coloured status, puts a map above a list, and works offline
  (`developer.apple.com/news/?id=970ncww4`). Polarsteps makes a globe-like map the hero and surrounds
  it with a visually heavy, photographic feed. TripIt and Wanderlog organise a trip as a
  chronological timeline with a persistent add action (ScreensDesign breakdowns).
- Apple's Liquid Glass guidance reserves translucent material for the navigation layer floating over
  content and says not to use it in the content layer
  (`developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass`). That supports
  opaque cards over the globe (D4-11).
- Keeping the accent equal to the globe's active arc (`GlobeColors.light.active` `#2456C7`, dark
  `#7FA8FF`) makes the accent mean one thing everywhere: "where you are now".

**Palette** (measured, not chosen by eye; the contrast gate re-verifies every run). Light / dark.

| Token                     | Light                     | Dark      | Measured                                                              |
| ------------------------- | ------------------------- | --------- | --------------------------------------------------------------------- |
| canvas                    | `#F5F2EB`                 | `#091018` | grouped-list background                                               |
| surface                   | `#FEFDFB`                 | `#141B25` | cards and rows                                                        |
| field fill                | `#EFEBE2`                 | `#1C2530` | inputs and segments                                                   |
| ink                       | `#111B28`                 | `#F4F1EC` | 15.51:1 / 16.96:1 on canvas                                           |
| muted                     | `#525C69`                 | `#A3ACB8` | 6.07:1 / 8.33:1 on canvas; 5.71:1 / 6.74:1 on field fill              |
| accent                    | `#2456C7`                 | `#7FA8FF` | 5.81:1 / 8.14:1 on canvas; 6.39:1 / 7.37:1 on surface                 |
| accent ink                | `#FFFFFF`                 | `#091018` | 6.50:1 / 8.14:1 on accent                                             |
| border (3:1)              | `#7E8792`                 | `#6B7583` | 3.26:1 / 4.09:1 on canvas; 3.06:1 / 3.32:1 on field fill              |
| danger                    | `#B71A18`                 | `#F7857D` | 5.92:1 / 7.83:1 on canvas                                             |
| success                   | `#00713E`                 | `#65C98C` | 5.47:1 / 9.36:1 on canvas                                             |
| planning (arc)            | `#9A5B00`                 | `#F2B45C` | arcs keep their own gate (against the map casing)                     |
| planning ink (chip label) | `#854E00`                 | `#F2B45C` | `#9A5B00` on a 15% chip is **4.35:1 and fails**; `#854E00` is 4.88:1+ |
| past                      | `#5F6773`                 | `#9CA5B1` | 5.62:1 / 6.95:1 on surface                                            |
| separator                 | tuned by eye, below 1.5:1 | same      | decorative; named in the gate's exemption allowlist                   |

Soft chips (accent text on 15% accent over the background): 5.10:1 on surface, 4.68:1 on canvas in
light; 5.64:1 and 6.39:1 in dark. Increased-contrast candidates: light accent `#173F99` 9.51:1,
border `#4A525C` 7.92:1, danger `#8F1210` 9.28:1; dark accent `#A9C5FF` 12.12:1, border `#A3ACB8`
9.15:1, danger `#FFB1AA` 12.12:1; muted at least 12.95:1. These are starting values; the gate
finalises them (never the floors).

**Alternatives considered**:

- _Night Flight_ (dark-first, luminous accents). Strong atmosphere and flatters the globe, but hardest
  to read in direct sunlight, which is the product's stated worst case.
- _System Native_ (platform semantic colours, dynamic colour). Feels most stock; platform colours are
  opaque native values that Jest cannot measure, which would defeat the automated contrast gate.
- _Keep the blue-grey canvas and only remove the shadows_. Rejected: the canvas, the single hue and the
  all-card layout are part of why the result reads as a prototype.

## D4-02 — UI kit: HeroUI Native on Uniwind, behind a go/no-go spike

**Decision**: Adopt `heroui-native` (with `uniwind` and Tailwind v4) as the component kit, used only
through our own adapters (D4-03). A time-boxed on-device spike (T401 to T409) decides go or no-go
before any product screen moves. On no-go, the same adapters are built on React Native primitives
with the same Atlas tokens, and no screen changes.

**This is a user decision.** The author recommended re-skinning the in-house primitives
(`Screen`, `Surface`, `PressableSurface`, `TextField`) because it keeps about 340 call sites and the
token gate. The user chose to adopt a kit, and chose HeroUI after the comparison below. The spike and
the adapter boundary are how that choice is made safe.

**Facts** (npm and docs read 2026-10-07):

- `heroui-native` 1.0.10, Apache-2.0, published 2026-09-21. First stable 1.0.0 on 2026-03-21, then ten
  releases in six months. Peers: react >=19, react-native >=0.81, `expo-blur` >=14,
  `react-native-svg` ^15.12.1, `react-native-reanimated` ^4.1.1, `react-native-worklets` >=0.5.1,
  `react-native-gesture-handler` ^2.28, `react-native-safe-area-context` ^5.6,
  `react-native-screens` >=4, `tailwind-merge` ^3.4, `tailwind-variants` ^3.2.2,
  `@gorhom/bottom-sheet` ^5.2.9 (declared optional since 1.0.0).
- `uniwind` 1.12.2, MIT, Tailwind v4 only, Metro-based, needs no Babel preset. Versions 1.12.1
  (2026-10-01) and 1.12.2 (2026-10-05) are under seven days old, so **1.12.0 (2026-09-04)** is the
  newest allowed pin.
- Components that cover this product: Button (primary, secondary, tertiary, outline, ghost, danger,
  danger-soft; sm, md, lg; `isIconOnly`; `feedbackVariant`), Card, Surface, ListGroup (title,
  description, prefix, suffix with a default chevron), Chip, TextField with Label, Input, Description
  and FieldError, SearchField, Select, Switch, Tabs, Dialog, BottomSheet, Menu, Popover, Toast, Alert,
  Skeleton, Spinner, Avatar, Separator, PressableFeedback, Typography.
- Theming: CSS variables (`--background`, `--foreground`, `--surface*`, `--overlay*`, `--muted`,
  `--default*`, `--accent*`, `--field-*`, `--success*`, `--warning*`, `--danger*`, `--segment*`,
  `--border`, `--separator`, `--focus`, `--link`, shadows) with `@variant light` / `@variant dark`,
  extra named themes registered through Uniwind's `extraThemes`, custom fonts through
  `--font-normal|medium|semibold|bold`.
- Provider: `HeroUINativeProvider` takes `animation: 'disable-all'`, `textProps`, `textInputProps`,
  `toast`, `isRTL`.
- A public app on **Expo SDK 57, React Native 0.86, Uniwind, HeroUI Native, Reanimated 4,
  jest-expo ~57.0.3 and `@testing-library/react-native` 13**
  (`github.com/AdiRishi/expo-uniwind-starter`) runs its tests with an extended `transformIgnorePatterns`
  (`react-native-svg|react-native-worklets|react-native-reanimated|react-native-gesture-handler|
react-native-safe-area-context|heroui-native|uniwind|tailwind-variants`) and **mocks `heroui-native`
  in Jest** at its setup boundary.

**Alternatives considered**:

| Kit                                      | Why not                                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React Native Paper 5.x                   | Mature and Jest-friendly, but a Material 3 look on iOS too, against Expo's guidance; the Atlas look would be heavy theme overrides                          |
| gluestack-ui v5                          | Brand new; parts of its NativeWind route still rely on pre-release dependencies                                                                             |
| Tamagui 2.x                              | Designed for sharing web and native UI; the web target was removed (001 D-14), leaving its compiler and config surface without its benefit                  |
| React Native Reusables, PanelUI          | Copy-paste or young (PanelUI lists no dependents) and on the same Tailwind paradigm without a maintained kit behind them                                    |
| `@expo/ui` (SwiftUI and Jetpack Compose) | Real native controls but a primitives library, not a design kit; every subtree needs a `Host`. Recorded for later (date pickers, menus) and not adopted now |
| Re-skin in-house primitives              | The author's recommendation; remains the **fallback** if the spike fails                                                                                    |

**Consequences**: a Tailwind toolchain in Metro; a second styling paradigm (classes) beside
`StyleSheet`; `react-native-svg`, `expo-blur` and `expo-haptics` as new native modules (dev-client
rebuild); a lint boundary so the kit cannot spread (D4-03).

## D4-03 — Adapter layer and import boundary

**Decision**: Screens import only from `apps/mobile/src/components/ui/`. Only that folder, and tests,
may import `heroui-native`. The adapters keep this app's own prop API and guarantees (required
accessible labels, busy and disabled semantics, touch-target minimum, preserved test identifiers).

**Rationale**: it localises lock-in, makes the fallback in D4-02 real (swap internals, not call
sites), lets Jest mock the kit at one boundary as the reference app does, and keeps the app's
accessibility promises in one place instead of re-deciding them per screen.

**Alternatives considered**: using the kit directly in screens (fastest, but spreads the kit through
every file and every test and cannot be undone); a facade over the old neumorphic API (rejected by the
user, D4-12).

## D4-04 — One token source: palette, `Colors` and generated CSS

**Decision**: `apps/mobile/src/theme/palette.ts` (new) is the only place a colour is authored (hex per
theme). Three consumers read it: `Colors` in `constants/theme.ts` (keys preserved); a build script
`scripts/build-theme-css.mjs` that writes `src/theme/generated/theme.css`; and the contrast gate. A
Jest test regenerates the CSS in memory and fails when the committed file differs.

**Rationale**: the kit reads CSS variables; the app, the navigation theme, the status bar, the Mapbox
code and the gate read TypeScript. Two hand-kept copies would drift, which is exactly the
"half-converted" state 002 FR-023 forbids. Hex (not OKLCH) in the TypeScript source keeps
`contrastRatio(hex, hex)` and every existing test valid; the OKLCH derivation is recorded in the
design-tokens contract for rationale only.

**Gate extensions** (see `contracts/design-tokens.md` C4-3): four themes; derived soft blends via a
`blend(foreground, background, alpha)` helper added to `contrast.ts`; the kit's hover mixes; status
chip inks; field border against field fill; focus ring; the 7:1 text floor in the increased-contrast
themes. The existing exemption allowlist (separator, backdrop, shadows) stays an enumerated allowlist,
never a skipped assertion.

**Alternatives considered**: author in CSS and parse it in tests (brittle, and TypeScript consumers
would still need the values); use Uniwind's runtime `updateCSSVariables` to push TypeScript tokens into
CSS (works, but the first frame would render before the push and the static file is inspectable and
diffable).

## D4-05 — Themes, reduced motion, reduced transparency

**Decision**:

- Four named themes: `light`, `dark` (kit defaults, overridden), plus `light-contrast` and
  `dark-contrast` registered through `extraThemes`. `useAppearance()` stays the single resolver (002
  contract C4) and an effect in the root layout calls `Uniwind.setTheme(...)` from it. Every theme
  defines the same variables (Uniwind warns in development when one is missing).
- Reduced motion: the provider's `animation` becomes `'disable-all'` while `prefersLessMotion` is
  true; haptics are also off.
- Reduced transparency: structurally satisfied, because no translucent material is used (D4-11); the
  `prefersLessTransparency` flag stays in `useAppearance()` for any later glass.
- Largest text: `textProps` and `textInputProps` are **not** capped (no `maxFontSizeMultiplier`),
  because 002 FR-016 requires the largest platform size to work.

**Rationale**: it keeps 002's contract C4 intact and maps each inherited requirement onto a real
switch. The first-frame concern (the accessibility flags are read asynchronously) is covered by the
splash screen and checked in T406.

## D4-06 — Navigation chrome: stable APIs, native headers, native sheets (D-17 amended)

**Decision**:

- Keep `expo-router/js-tabs` `Tabs` with a custom, restyled, flat bar (`TabBar`, renamed from
  `NeumorphicTabBar`; testIDs `tab-bar`, `tab-<name>`, `tab-mark-<name>` unchanged).
- Trips and Profile become nested stacks inside their tab (`(tabs)/trips/_layout.tsx` plus
  `index.tsx`, same URLs) so they can use native large titles; Home stays headerless.
- `trip/[id]` and `modal` stacks turn native headers on with themed options (`headerLargeTitleStyle` and
  `headerTitleStyle` carry the display face).
- `modal/add-trip` and `modal/add-expense` present as `formSheet` with `sheetAllowedDetents`
  (`fitToContents` for add-trip), keeping `unstable_settings.anchor` so deep links keep their context.
  The stop editor stays a React Native `Modal` (`pageSheet` on iOS), restyled.
- Android has no native large title; Android uses a standard header with the same title.
- **Back parity**: Maestro flows `tapOn: 'Back'` (03-globe; offline 15-a and 15-b). A native iOS back
  button shows the previous title unless `headerBackButtonDisplayMode: 'generic'`; the Android back
  arrow's description is the platform's own. T408 proves "Back" resolves on both, or supplies a custom
  `headerLeft` labelled "Back".

**D-17 amendment**: 001 D-17 kept the stable tabs navigator with a custom bar for two reasons: a
native bar is platform styling, which 002 FR-003 forbade; and the module is exported as
`expo-router/unstable-native-tabs` in SDK 55 to 57. The first reason is gone with 002 FR-003. The
second remains (the Expo documentation lists `expo-router/native-tabs` as SDK 58 and later), so the
decision stands and is re-opened when the SDK is upgraded.

**Alternatives considered**: `NativeTabs` now (Liquid Glass bar on iOS 26, Material 3 bar on Android,
accessibility for free, but an `unstable` API, tab-bar tests and testIDs to redo); a JS `Tabs` header
(React Navigation's header is not a native large title).

## D4-07 — Typography: system text, one bundled display face

**Decision**: interface text uses the platform face (SF Pro, Roboto) so Dynamic Type and font scaling
work for free; one display face, two weights (semibold, bold), carries large titles, the trip title and
prominent figures (totals, statistics). Scale of five sizes: 32/38 large title, 22/28 title, 16/24 body,
14/20 callout, 12/16 caption (iOS headline 17). Tabular numerals for money, distance, counts and dates.
Sentence case. The display face is bundled through the `expo-font` config plugin (no runtime download),
registered as `--font-display` and `--font-display-bold`.

**Shortlist** (all published as `@expo-google-fonts/*`, OFL): Bricolage Grotesque, Young Serif, Geist.
The final pick is made on a device in T408; the choice is recorded here when made.

**Rationale**: system text is what makes an app feel native; a display face supplies identity at the
two places the traveller looks first. React Native has no dynamic weights for custom fonts, so each
weight is a separate family name and the count is kept to two.

**Alternatives considered**: system fonts only (most native, least identity); one custom family
everywhere (strongest identity, heavier and weaker platform feel).

## D4-08 — Icons: one adapter over `expo-symbols`

**Decision**: an `Icon` adapter over `SymbolView` taking `{ ios, android }` names, as the tab bar does
today; sizes 16, 20, 24. Ionicons stay only for the Google and Apple brand glyphs already used.

**Rationale**: Expo's guidance prefers `expo-symbols` on iOS and requires a Material equivalent on
Android; one adapter prevents SF-only icons from sneaking in.

## D4-09 — Trip cover is derived, private and local

**Decision**: a trip card's cover is, in order, the photograph named by `trips.cover_photo_id` if its
file is on the device and has a thumbnail; otherwise the trip's earliest photograph with a local
thumbnail; otherwise a typographic cover tinted by status. One extra local read (earliest photo per
trip) is joined in memory with the stop counts, as `useTrips` does today. Only thumbnails are drawn,
with `recyclingKey`, as `PhotoTile` does.

**Facts**: `cover_photo_id` already exists (`apps/mobile/src/db/schema.ts`); it is `null` at creation
(`repositories/trips.ts`) and is rewritten only when sync remaps a photo id
(`repositories/sync.ts`). Nothing sets it today, so the earliest-photo rule carries the feature; "set
cover" is out of scope.

**Visibility posture** (AGENTS.md): private. Read from the signed-in traveller's own local rows, drawn on
their device, never transmitted, no new endpoint, table, permission or sync field.

## D4-10 — Haptics

**Decision**: `expo-haptics` through a `useHaptics()` adapter: selection on chip and segment change,
success on save or create, warning on destructive confirmation. Disabled while `prefersLessMotion` is
true and silently a no-op where unsupported.

## D4-11 — Globe overlays stay opaque; glass and `@expo/ui` are not adopted

**Decision**: the stats panel, the invitation card and the notice over the globe are opaque cards with
a hairline boundary, no shadow, no tint, no translucency (002 FR-024 and FR-025 carry over as
FR-018 and FR-033). `expo-glass-effect` stays installed and unused (002 R-007 stands); `@expo/ui` is
not adopted.

**Rationale**: translucency over a busy map is least legible exactly where the control matters, needs
per-theme testing, and would need an opaque fallback for reduced transparency (FR-028). Apple reserves
glass for the navigation layer, and these cards are content-layer controls.

## D4-12 — Migration: re-point tokens first, migrate by area, delete last

**Decision** (user decision):

1. **Re-point `Colors`** (keys preserved) at the Atlas palette and force the flat elevation profile so
   every unconverted screen is already in Atlas colours and dark mode, with shadows collapsed.
2. Add the kit and adapters beside the old primitives.
3. Convert by area: Home, Trips and Trip first (review on a phone), then forms and sheets, everyday
   screens, sign-in and Profile.
4. Delete `surfaces.ts`, `elevation-profile.ts`, `use-surface.ts`, `Surface`, `PressableSurface`, the
   `treatment`/`depth`/`pending` props, shadow tokens and `Depth`/`LightSource` at the end.

**Rationale**: the app keeps working and every phase can ship; the interim look is coherent rather than
mixed. A facade that re-implements `PressableSurface` over the kit was rejected because it would keep
neumorphic-shaped props (`treatment`, `depth`) alive in the codebase.

## D4-13 — Jest strategy

**Decision**: tests assert on our adapters' contracts (labels, roles, states, preserved ids), not on kit
internals. `heroui-native` is replaced by one shared stand-in in `jest.setup.ts` (as the SDK 57
reference app does), plus `react-native-reanimated/mock`, a worklets mock and a `uniwind`
`useCSSVariable` stub. `transformIgnorePatterns` gains the kit and its peers. The spike (T404) also
renders the **real** `Button` and `Field` once to prove they can run under Jest; the end-to-end truth
is Maestro on device.

**Risks noted**: `jest-expo` 57 pins `@react-native/jest-preset ^0.85` while React Native is 0.86
(`github.com/expo/expo/issues/47435`); this repository already runs `jest-expo ^57.0.5` successfully,
and the spike re-confirms after the install.

## D4-14 — Dependencies and supply chain

**Decision**: exact pins, one `npm install` at the repository root, lockfile committed, each version
published at least seven days before the install (verify with `npm view <pkg>@<version> time`), install
scripts reviewed, `npm audit` run, native modules at the SDK 57 pin from `bundledNativeModules.json`.

| Package                               | Pin                    | Notes                                                           |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `heroui-native`                       | 1.0.10                 | 2026-09-21                                                      |
| `uniwind`                             | 1.12.0                 | 2026-09-04; 1.12.1 and 1.12.2 are too new                       |
| `tailwindcss`                         | 4.3.3                  | confirm publish date at install                                 |
| `tailwind-variants`, `tailwind-merge` | 3.3.1, 3.7.0           | confirm publish dates                                           |
| `react-native-svg`                    | 15.15.4                | SDK 57 pin; `npx expo install`                                  |
| `expo-blur`                           | ~57.0.3                | required peer of the kit                                        |
| `expo-haptics`                        | ~57.0.3                | SDK 57 pin                                                      |
| display font                          | `@expo-google-fonts/*` | chosen in T408; two weights; embedded by the `expo-font` plugin |

Not added: `@gorhom/bottom-sheet` (our sheets are Expo Router form sheets; the spike confirms the kit
loads without it), `@expo/ui`, any Uniwind Pro licence. Tailwind's native engine (`@tailwindcss/oxide`)
ships per-platform binaries; the spike runs `npm ci` on Windows and on the CI runners (SC-012).

## D4-15 — Amendments to earlier specifications

Recorded in [spec.md](./spec.md#amendments-to-earlier-specifications): 002 FR-001 to FR-006 superseded;
002 FR-007 to FR-029 inherited and restated without shadows; 002 FR-009 clarified to the wording of the
accessibility rule it cites (WCAG 1.4.11 asks for 3:1 on the visual information needed to identify a
control, which a chevron, icon or label can supply for a card or row); 001 D-17 rationale amended (D4-06);
003 FR-013 to FR-018 kept and FR-019 extended.

## Items to verify empirically

These could not be confirmed from documentation and are the acceptance checks of the spike.

1. **Metro**: `withUniwindConfig` as the outermost wrapper over `getSentryExpoConfig`, the `.sql`
   source extension and the test-file block list still bundles on iOS and Android, and the Sentry Debug
   ID is still embedded. (T402)
2. **React Compiler**: kit and adapter components render correctly with `experiments.reactCompiler`
   on; any file that needs `"use no memo"` is listed. (T403)
3. **Jest**: the extended `transformIgnorePatterns`, mocks and `.css` handling run the whole existing
   suite and one real render of `Button` and `Field`. (T404)
4. **Pass-through**: `testID`, `accessibilityLabel`, role, state and hint reach the native node on
   Button, Card, ListGroup item, Input and Chip; touch targets of sizes sm, md, lg are at least 44 dp on
   iOS and 48 dp on Android; busy and disabled are announced. (T405)
5. **Themes**: four themes switch live with the system theme; the increased-contrast themes follow
   `useAppearance()`; no flash beyond the splash. (T406)
6. **Reduced motion and largest text**: `animation: 'disable-all'` removes the kit's animation; at font
   scale 2.0 Button, Chip and ListGroup do not clip. (T407)
7. **Back parity**: `tapOn: 'Back'` resolves on a native header on iOS and Android, else a custom
   `headerLeft` labelled "Back" is used; `formSheet` behaves on both platforms; the display face loads
   from the `expo-font` plugin and applies to `headerLargeTitleStyle`. (T408)
8. **Bottom-sheet peer**: `heroui-native` loads and renders without `@gorhom/bottom-sheet` installed.
   (T401)
9. **Continuous corners**: whether the kit's rounded views honour `borderCurve: 'continuous'`; if not,
   adapters set it. (T405)
10. **Windows and CI**: `npm ci` succeeds and the checks pass on Windows and on the CI runners. (T401)

**Go/no-go outcome** (filled in by T409): _pending_.
