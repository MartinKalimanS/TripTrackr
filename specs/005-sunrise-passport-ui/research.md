# Phase 0 Research: Sunrise Passport UI

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-12

Decisions are numbered `D5-nn` (feature 004 used `D4-nn`, feature 003 `D3-nn`, feature 001 `D-nn`). Facts
were read from the sources named, measured with the WCAG 2.x formula (the one in
`apps/mobile/src/theme/contrast.ts`) on 2026-10-12, or verified with `npm view` and the GitHub API on that
date. Research notes outside the repository (kept by the author, not required to follow this document):
`ui-refs/round2-audit-notes.md`, `round2-inspiration-notes.md`, `round2-libraries-notes.md` and the round 1
notes. The design source is the prototype v2 (`ui-proto/sunrise-v2/`: `tokens.css`, `styles.css`, `app.js`,
`globe.js`, `extra/`). Anything that could not be confirmed from documentation is listed in
[Items to verify empirically](#items-to-verify-empirically-device-spikes) and is the content of the spikes
(tasks T507 to T512), not an assumption.

## D5-01 — Direction: Sunrise Passport

**Decision**: Replace the Atlas look with Sunrise Passport: white and cream surfaces, deep navy ink, coral for
the one thing to do and for "now", aqua for water and "only you", amber for planned; a display face
(Bricolage Grotesque) with a readable text face (DM Sans) and one italic serif accent word (Instrument
Serif); a sunlit globe under a bottom sheet; a floating tab pill; trips as pictures; countries as stamps. A
dark twin (Nightfall) and increased-contrast variants of both are designed.

**Rationale**:

- The owner reviewed Atlas on a phone and rejected it as ugly. The structure of feature 004 (headers, sheets,
  adapters, gates) is sound and is kept; the look, the layouts and the chrome are what change.
- The prototype was audited in two rounds. Round 2 (`round2-audit-notes.md`) scored v1 at 1.5 for state
  coverage, 2.5 for spacing and shape, and found 104 defects (7 blockers). v2 fixes the blockers that are
  visual (a measured token set with 9 type sizes, 8 spacing steps, 5 radii, 2 lifts; deterministic photo
  scrims; fluid layouts; loading, offline, error, zero-stop and no-cover frames; a Countries list as the
  full sheet position). v2's own audit (`audit-report.md`) still lists 4 contrast failures and 2 layout
  items over 3 frame variants; they are named in the spec and fixed by the gate (spec, "Prototype elements").
- The same audit lists what is already excellent and must not change: the palette identity, the globe look
  (cream land, coral edges, lifted arcs), the sheet-over-globe composition, status never by colour alone,
  the 20 dp margin discipline, concentric nesting, the passport card and the generated stamps.
- References agree on the shape: Polarsteps makes a globe-like map the hero; Flighty is "boringly obvious" and
  glanceable; Wanderly and Waymark use day chips and a numbered timeline with dotted transit; Stamp
  Collection and Dongengin Stamps give the stamp anatomy (`round2-inspiration-notes.md`, section 1).

**Alternatives considered**:

- _Keep Atlas and retune it._ The owner's complaint is about the whole impression (palette, flat strip,
  all-card layout), not one value.
- _Night Flight (dark-first)._ Rejected in 004 for sunlight legibility; unchanged.
- _Use prototype v1._ 104 defects, no states, fixed heights that collapse under text scaling.

**Consequences**: a new palette and type system through the existing token pipeline (D5-02); new components
(sheet, pill, stamp, hero card, ticket); two rewritten screens (Home layout, Trip detail); restyled
everything else; Tier 3 items listed, not built (spec).

## D5-02 — Reuse the 004 stack; change values, not the architecture

**Decision**: Keep HeroUI Native on Uniwind behind the adapters of `components/ui/` (004 D4-02, D4-03), the
single palette source (`src/theme/palette.data.js`) feeding `Colors`, the generated `theme.css` and the
contrast gate (004 D4-04), the four theme names, the nested stacks, native headers and form sheets
(004 D4-06) and the testID parity tests. The Sunrise tokens map onto the kit's variables through
`scripts/build-theme-css.mjs`; where the kit has no variable the app adds its own `--*` variables as 004
already does for `--status-*` and `--pending`.

**Rationale**: the structure passed its desk checks; replacing it would restart the spike (004 T401 to T409)
for no visible gain. The cost of a look change is concentrated in the palette file, the type table, a few
adapters and the screens, which is what the task list reflects.

**Alternatives considered**: dropping the kit for plain React Native views (loses the Skeleton, Toast and
accessibility work already done; reopens 004's fallback decision); a second token pipeline for Sunrise
(drift, forbidden by 004 D4-04).

**Consequences**: the kit's `theme === 'dark'` comparisons and the explicit-colour rule from 004 research
item 5 still apply; the Sunrise `pressed` fill is a new key (D5-22).

## D5-03 — Home: a custom sheet over a full-bleed globe, not `@gorhom/bottom-sheet`

**Decision**: Build `components/ui/sheet.tsx` (a small Reanimated and Gesture Handler sheet) and use it for
the Home sheet: three detents, a handle that is an adjustable accessibility control, a spring settle, a
selection haptic per settle, `BackHandler` stepping full to half to peek on Android. The sheet is a sibling
of the globe in `HomeGlobe`, `position: absolute`, container `pointerEvents="box-none"`, so touches in the
sheet never reach the map and touches above it go to the map: there is no gesture conflict to arbitrate.

**Camera follows the sheet** (research notes section 1): the camera's `padding` is set **once per settle**
(from the sheet's snap start, with an `easeTo` animation of about 280 ms, equal to the spring), never per
frame, and the zoom is re-fitted by `z0 + log2(visibleHeight / fullHeight)` because padding moves the
centre but does not rescale the sphere. The pure function `globeFit()` (contract C5-22) states the rule the
prototype's `app.js` uses (`cameraFor`): peek radius `clamp((band − 24) / 2, 110, 175)` centred in the free
band; other detents radius `clamp(0.95 × band, 150, 286)`, with `band = sheetTop − headerBottom`. The map's
logo and attribution are moved above the sheet with `logoPosition` and `attributionPosition` (both exist on
`MapView`) on each settle and are never hidden (the provider's terms).

**Facts** (GitHub API, 2026-10-12): `gorhom/react-native-bottom-sheet` was last pushed 2026-05-09 (latest
release 5.2.14), has 66 open issues, and its issue #2737 ("scrollTo re-entrancy in the default scroll
handlers overflows the native stack on iOS Fabric") is our exact case, a persistent sheet over a full-bleed
view with scrolling content, reproduced on React Native 0.86.2, Reanimated 4.5.1, Worklets 0.10.1 and
Gesture Handler 2.32.0, which is this repository's stack apart from one patch release of React Native (0.86.3). The issue was closed on 2026-10-05, but its fix,
PR #2760 ("prevent locked scroll re-entry"), was closed **without merging**. Two more reports in the same repository: #2764 (a closed sheet's backdrop stays
`pointerEvents: auto` and blocks every touch on devices with a fractional dp screen height) and #2758 (a native
dependency warning with Reanimated 4.6.0).

**Alternatives considered**:

| Option                             | Why not                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `@gorhom/bottom-sheet` 5.2.14      | The facts above; remains the fallback with a local patch of PR #2760 (`patch-package`)               |
| `@lodev09/react-native-true-sheet` | A native modal presented above the app: the floating pill would be hidden; fine later for forms      |
| `@expo/ui` BottomSheet             | Documented as a modal sheet that slides up, anchor-triggered                                         |
| Router `formSheet`                 | A route modal over the tab bar; kept for forms, wrong for a persistent sheet                         |
| HeroUI `BottomSheet`               | Needs `@gorhom/bottom-sheet` (an optional peer, not installed); must not be imported by the adapters |

**Consequences**: about 250 lines of gesture code to own (tests first, `fireGestureHandler` from
`react-native-gesture-handler/jest-utils`); the sheet content uses a FlashList or ScrollView whose
`scrollEnabled` changes only when a detent settles, with `activeOffsetY` and `failOffsetX` so horizontal
swipes win; the device spike V3 (T509) measures 60 fps while the globe renders.

## D5-04 — The globe's look: map style layers, not a new map

**Decision**: Keep ONE `MapView` (001 D-30). Restyle it with tokens (`GlobeColors`, a new `GlobeStyle` group)
and these layers, all in the existing `components/globe/` and each gated:

- **Standard style configuration** through `StyleImport id="basemap" existing config`: `colorLand`,
  `colorWater`, `colorGreenspace` (soft sage), `colorAdminBoundaries` (warm tan, thin), `lightPreset`
  `day` or `night`, and the label toggles off at world scale. **The package's typings (`StyleImport.tsx` in 10.3.5) contain two
  mis-named keys**: `colorBoundaries` and `colorGreenspaces`; Mapbox's real keys are
  `colorAdminBoundaries` and `colorGreenspace`, and `StyleImport.config` accepts any string key, so the typo
  type-checks and is silently ignored. A unit test checks every config key against a literal allow-list
  taken from `docs.mapbox.com/map-styles/reference/standard/` (T505; SC-014).
- **Atmosphere** (`<Atmosphere style>`: `color`, `highColor`, `spaceColor`, `horizonBlend`,
  `starIntensity`): a cream-white horizon, a pale aqua high colour, a warm peach space colour (an opaque
  token, because an alpha below 1 on `color` loads more tiles), no stars. Whether it overrides Standard's
  own fog at globe zoom, and whether `spaceColor` with alpha 0 shows the React Native sky behind the map,
  are device checks (V2).
- **Visited countries**: a `VectorSource` on `mapbox://mapbox.country-boundaries-v1` (source layer
  `country_boundaries`, property `iso_3166_1`) and a `FillLayer` (`slot="bottom"`, token fill, a coral-line
  keyline layer above it). The filter always includes a worldview clause, or disputed areas draw twice and
  the alpha stacks. `visitedIso2` is derived from the same local store as the statistics, memoised.
  Planned countries use the amber dashed keyline.
- **Graticule**: one static GeoJSON of meridians and parallels every 30 degrees, a `LineLayer` fading out
  above zoom 4.
- **Gradient arcs**: `lineGradient` over `line-progress`, which needs `lineMetrics: true` on its own
  `ShapeSource` and cannot be combined with `lineDasharray`. So past and active connections are gradient
  layers on a separate source (one Feature per leg, so each leg gets the whole ramp), and planned
  connections keep the existing dashed layer. The shared hit-test source is not changed.
- **Pins**: a `SymbolLayer` with `Images` for photo roundels (circular crop, white ring, baked into a
  bitmap, `iconAllowOverlap`, size by zoom, active last), and ONE `MarkerView` for the live trip (callout tag
  and pulse rings with Reanimated). Beyond roughly 60 roundels the rest are plain `CircleLayer` dots.
  Roundel bitmaps are produced with `react-native-view-shot` from a hidden laid-out view (V2). If that
  fails, the fallback is the existing `CircleLayer` dots plus `MarkerView` for at most 12 pins.
- **Idle rotation**: not a `requestAnimationFrame` loop (every frame would cross the bridge). A chain of
  native camera moves, `setCamera({ centerCoordinate, animationMode: 'linearTo', animationDuration: 5000 })`
  re-armed from `onMapIdle`, with every stop condition of FR-019 (touch, sheet above half, not focused, app
  inactive, 45 s cap, reduced motion).
- Every custom layer sets `*EmissiveStrength: 1` (as the arcs already do) or the `night` preset shades the
  colour away from its token.

**Rationale**: everything exists in the installed typings (`@rnmapbox/maps` 10.3.5); native culling hides
the far side of the globe for symbols; the geometry code (`great-circle.ts`, `journey.ts`, `arc-features.ts`)
is untouched (FR-082).

**Alternatives considered**: the prototype's own look (a canvas with per-country gradient fills, lit
highlight and limb shading) cannot be reproduced by a flat `fill-color`, `fog` and `line-gradient`; the
design accepts less lighting (audit R-01). `MarkerView` for every pin (a native view repositioned every
camera frame: fine for a dozen, not for hundreds); `PointAnnotation` (legacy bitmap snapshots).

**Consequences**: `GlobeColors` changes values and gains stops, so `test/theme/globe-contrast-gate.test.ts`
is extended first (D5-22); the Jest Mapbox stand-in already tags layers `mapbox-<Kind>-<id>`.

## D5-05 — Tab pill: glass on iOS 26, blur before it, solid otherwise; a navigation bar on Android

**Decision**: The tab bar stays the JS `Tabs` navigator with a custom `tabBar` (001 D-17, 004 D4-06) and
becomes a floating pill (`bottom = max(insets.bottom − 10, 12)`, sides 16 dp, height 64 dp, padding 6,
radius full). Its surface is chosen by one function, `tabSurface()`: iOS 26 or later with
`isLiquidGlassAvailable()`, reduce transparency off and no contrast theme gives `GlassView`
(`expo-glass-effect` 57.0.3, the SDK 57 pin); otherwise iOS gives `BlurView` (`expo-blur`, installed);
otherwise (Android, reduced transparency, increased contrast) a solid `paper` surface with the hairline and
the floating lift. The selected tab is a tinted capsule (`translateX` by `index × tabWidth`, one spring)
with a filled icon and a heavier label. Android gets the Material 3 Expressive navigation bar: full width,
64 dp plus the inset, a 56 by 32 dp indicator, no blur.

**Rationale**:

- `expo-glass-effect` is MIT, already in `node_modules` (`expo-router` 57's manifest names it), and falls back
  to a plain view below iOS 26. Its known issue is that **opacity 0 on a `GlassView` or any ancestor makes
  the glass vanish** (`github.com/expo/expo/issues/41024`): the pill is hidden with `translateY`, never
  faded.
- On Android `expo-blur` only blurs what is inside a `BlurTargetView` (API 31 and later), so the map would
  have to be re-blurred every frame while it animates: too costly for always-on chrome.
- The prototype's pill is 84 to 98 percent opaque, so a solid pill is faithful; glass is an enhancement.

**Alternatives considered**: `NativeTabs` (still `unstable-` in SDK 57, 004 D4-06); a flat strip (rejected by
the owner's review); a pill with Android blur (cost).

**Consequences**: the contrast themes and reduced transparency are opaque by construction (SC-008); the
pill reports `height + bottomOffset` through `BottomTabBarHeightCallbackContext` so lists and the sheet pad
their content; the glass decision is a device check (V4); AGENTS.md's "never give a tab a surface" is
replaced (spec, Amendments).

## D5-06 — Type: Bricolage Grotesque statics, DM Sans, one Instrument Serif word

**Decision**: Three bundled families through the `expo-font` config plugin, no runtime download:

| Role                               | Family and file                                                                 | Weights used  |
| ---------------------------------- | ------------------------------------------------------------------------------- | ------------- |
| Display, numerals, titles, buttons | Bricolage Grotesque, `@expo-google-fonts/bricolage-grotesque` 0.4.1 (installed) | 600, 700      |
| Body and labels                    | DM Sans, `@expo-google-fonts/dm-sans` 0.4.2                                     | 400, 600, 700 |
| Accent word (one per screen)       | Instrument Serif Italic, `@expo-google-fonts/instrument-serif` 0.4.1            | 400 italic    |

Nine sizes (40, 36, 28, 22, 17, 16, 14, 13, 12) and weights 400, 600 and 700 only (contract C5-6). The
tracking of the prototype's headings is compensated (below). **Figures that animate or align are set in
Bricolage with `fontVariant: ['tabular-nums']`, never in DM Sans.**

**Facts** (measured on the real files with fontTools, 2026-10-11):

- React Native 0.86.3 has **no `fontVariationSettings`** (a search of `node_modules/react-native` finds no
  hit; the platform changes landed on the main branch in August 2026, so React Native 0.88 or later). The
  prototype's variable axes (`opsz` 20 to 72, weight 650) cannot be used on SDK 57.
- The Google statics in `@expo-google-fonts/bricolage-grotesque` are cut at `opsz` 14 (the text size): the
  advance of "H" is 723 units, against 685 at `opsz` 48 and 633 at `opsz` 96, so the shipped faces are
  roughly 6 to 14 percent wider and looser than the prototype's headings. Bricolage has `tnum` and `pnum`
  (digits proportional by default; `tnum` maps to tabular glyphs, all 622 units wide).
- DM Sans has **no `tnum` or `pnum`** features at all, and proportional digits (a "1" is 328 to 364 units
  against 690 to 704 for a "0"), so `fontVariant: ['tabular-nums']` is a silent no-op on it.
- Android resolves a custom font by family name (the file name without the extension); iOS by PostScript
  name. Each weight is its own family; `fontWeight: 'normal'` is set beside a weight-named family to avoid
  double emboldening. `global.css` therefore carries both spellings, as 004 D4-07 already does, and
  `test/theme/global-css.test.ts` reads every name from the font files.

**Tracking compensation** (starting values, finalised on a device in V1 against the prototype's rendered
headings, tolerance 3 percent of width): display and title 0.01 em tighter than the prototype's −0.025 em and
−0.02 em, so −0.035 em and −0.030 em; numeral −0.040 em; headline −0.020 em; callout and below unchanged.

**Alternatives considered**: instancing the variable font at `opsz` 48 (and 72 to 96 for the hero numeral)
with fontTools, Latin-subset to about 43 kB per weight, keeping `tnum`: the **upgrade path** if V1 shows the
statics too loose (OFL permits derivatives; the PostScript and family names would be renamed and the OFL
text kept in `assets/fonts/`); the platform face for body text (004's choice, rejected for brand
coherence: React Native scales any font by the user's setting, so DM Sans scales as well).

**Consequences**: text caps for chrome (`maxFontSizeMultiplier` 1.3 on tab labels, chip captions and hero
numerals only, FR-074; an owner question); SVG `Text` ignores font scaling, so stamps are decorative and
labelled on the parent (D5-08); six font files, measured in SC-011.

## D5-07 — Icons: one vocabulary, `phosphor-react-native`

**Decision**: Replace the `expo-symbols` implementation of the `Icon` adapter with `phosphor-react-native`
3.0.6 (MIT, peers `react`, `react-native`, `react-native-svg`; `exports` map `./src/icons/*`). `IconName`
changes from `{ ios, android }` to a registry key (`'globe'`, `'suitcase'`, `'user'`, …) resolved in
`icon-registry.ts`, which imports about 60 icons by deep path so Metro and Jest never load the 1,500-icon
barrel. Weights: `regular` at rest (stroke about 1.5 at 24), `fill` for the selected tab and for
status glyphs, `duotone` for the stat tiles. Sizes 16, 20, 24 (FR-005). Brand glyphs for Google and Apple
stay where they are.

**Rationale**: `expo-symbols` is still `isBeta: true` in SDK 57, draws SF Symbols on iOS and a static
Material Symbols font on Android (no fill axis), so the weight and shape differ per platform; a brand with a
specific voice needs one set. Phosphor ships `fill` and `duotone`, which the selected state and the stat
tiles use.

**Alternatives considered**: keep `expo-symbols` (zero cost; the fallback); `lucide-react-native`
1.52.0 (one stroke weight, no fill; the second fallback).

**Consequences**: every `IconName` call site, `icon.test.tsx` and the tab-bar tests change in one codemod
(T518); an SVG icon in a long list costs more than a font glyph, so each icon is one memoised `Svg`; the
`no-neumorphism` and adapter-guard tests are extended.

## D5-08 — Stamps: SVG with `textPath`, a baked wear mask, deterministic

**Decision**: A stamp is a `react-native-svg` drawing in a 120 by 120 viewBox: an outer ring (stroke, dashed
for the perforated variants), an inner ring, the country code in Bricolage Bold, circular text on a
`TextPath` (`startOffset="50%"`, `textAnchor="middle"`) and the date. There are six shapes (circle, rounded
rectangle, hexagon, octagon, scallop, oval) and four inks (coral, navy, teal, green), each a token with a
measured pair on cream (≥ 5.0:1) and a dark twin. The shape, ink, tilt (±8 degrees) and wear texture index
come from a deterministic hash of the ISO code and the date of the first visit (`StampSpec`, data-model).
Distressed edges are **baked**: four grayscale wear PNGs (about 15 to 30 kB each) used as an SVG `<Mask>`.

**Facts**: `react-native-svg` 15.15.4 does not implement `feTurbulence`, `feDisplacementMap`,
`feMorphology` or lighting filters: they warn and render nothing; Android native filter views exist only for
Blend, ColorMatrix, Composite, Flood, GaussianBlur, Merge and Offset. SVG `Text` does not follow Dynamic
Type. The prototype's `grunge` filter is therefore not portable.

**Alternatives considered**: a seeded random-dot `<Mask>` (80 to 120 circles per stamp: too many nodes for a
list); `@react-native-masked-view/masked-view` 0.3.2 (SDK-pinned, already present) if `<Image>` in `<Mask>`
fails on Android; clean vector stamps (acceptable, zero risk; the last fallback); Skia (a 10 MB dependency
for one effect).

**Consequences**: a stamp is `accessible={false}` with the meaning on the parent (`Stamp: Portugal, 12
October 2026`); for long passports (100 or more stamps) a stamp is rasterised once per
`(shape, code, date)` into the cache with `view-shot` and drawn with `expo-image`; SVG font names must match
`global.css` per platform; spike V5 (T511) proves `<Image>` in `<Mask>` on both platforms.

## D5-09 — Images: `expo-image`, existing thumbnails, no schema change

**Decision**: Draw covers, roundels and grids with `expo-image` using the traveller's local thumbnail
(`has_thumbnail`, 004 D4-09) with `recyclingKey={photo.id}`, `contentFit="cover"`, a 220 ms transition and
`cachePolicy` `memory-disk` for covers and roundels. A larger "card" and "cover" derivative (720 and
1,440 px long edge) is generated on first use with `expo-image-manipulator` into the app cache (never a
database column). A ThumbHash placeholder is generated on first use with `Image.generateThumbhashAsync` from
the local thumbnail and cached beside it; it is **not stored in SQLite and not synced** (a column would be a
schema change, which this feature excludes). Photo grids use `numColumns={3}` FlashList with `getItemType`.

**Alternatives considered**: storing the hash in the photo row (best experience; a schema and wire change,
deferred, owner question); WEBP derivatives everywhere (the encoder's behaviour on iOS is a device check, V6;
JPEG 78 otherwise).

**Consequences**: a cover is never transmitted (004 D4-09 posture kept: private, local, nothing added to any
sync payload).

## D5-10 — Scrims and gradients: Uniwind `bg-linear-*` behind one `Scrim` component

**Decision**: Gradients (photo scrims, the sky, the passport card, generated covers) use React Native 0.86's
`experimental_backgroundImage` (`linear-gradient(...)`, `radial-gradient(...)`) through Uniwind's
`bg-linear-*` classes, wrapped in ONE `components/ui/scrim.tsx` so a rename of the experimental prop in a
later React Native is one edit. Stops are tokens (`scrim.top`, `scrim.bottom`, per theme). The **caption
scrim is deterministic**: a 48 dp ramp from 0 to .66 alpha plus a solid block that wraps the text from .66 to
.88, so the alpha under any text line is at least .64 at every text scale (the prototype's `cap-ramp` and
`cap-solid`). Text on a photograph is opaque white, never an alpha white. Floating icon buttons use a dark
disc (`scrimBtn`).

**Measured** (WCAG formula, white text over a WHITE photograph under the navy scrim): alpha .64 gives 5.33:1,
.66 gives 5.68:1, .88 gives 12.44:1; the increased-contrast scrim (`rgba(6,18,34,…)`) at .78 gives 9.55:1
and at .94 gives 16.41:1. A white icon on the light `scrimBtn` (`rgba(9,24,43,.46)`) over a white photograph
is **3.03:1**, which clears the 3:1 graphic floor by 0.03; the gate finalises the alpha (.50 gives 3.41:1,
.55 gives 4.00:1). The increased-contrast `scrimBtn` (.66) gives 6.09:1.

**Alternatives considered**: `expo-linear-gradient` 57.0.2 (SDK-pinned, 110 kB; the fallback and not
installed); a progressive blur under the caption (a delight idea; not available without a native module);
gradient text (no `background-clip` in React Native).

**Consequences**: every photograph slot is tested with a white-photograph fixture (SC-002); the
`experimental_` prefix is isolated.

## D5-11 — Count-up: in-house `AnimatedNumber`

**Decision**: `components/ui/animated-number.tsx`: a shared value (or a `requestAnimationFrame` loop for three
numbers over 700 to 900 ms), `Easing.out(Easing.cubic)` (or exponential) once per mount, staggered by 80 ms;
it renders the final text synchronously under reduced motion and **always** sets `accessibilityLabel` to the
final formatted value, so a screen reader never reads "3, 17, 42". Figures use `Intl.NumberFormat`, compact
notation from 7 digits ("1.26M"), and a lighter sibling `Text` for "/195" on the same baseline.

**Alternatives considered**: `number-flow-react-native` 0.5.1 (53 days old, 0.x, one maintainer: a Batch 2
polish for an odometer look, behind the same adapter); `TextInput` with `useAnimatedProps({ text })` (flickers
on Android Fabric; announces nothing); `react-native-animated-numbers` (stale).

## D5-12 — Transitions: `fade_from_bottom` baseline

**Decision**: The trip route opens with `animation: 'fade_from_bottom'` (Android) and the default slide on
iOS; its cover is an `expo-image` with a transition, already decoded because the card used the same source and
`recyclingKey`. The hero collapses with a scroll offset shared value (`useScrollOffset`): parallax 0.5, title
cross-fade into a solid 56 dp header, scrim opacity. `Link.AppleZoom` is a spike only (V6).

**Facts**: `Link.AppleZoom` is alpha, iOS 18 and later, and Expo's documentation says to avoid zoom
transitions between screens that have a header and notes about 1 s open latency
(`github.com/expo/expo/issues/42797`); the trip route has a header. Reanimated 4.5.1 shared-element
transitions are behind `ENABLE_SHARED_ELEMENT_TRANSITIONS: false` ("not recommended for production",
native-stack only), so they are not enabled.

**Alternatives considered**: a hand-rolled overlay hero (measure the card, animate an absolutely positioned
image, about 80 lines): the fallback if the owner insists on a morph on Android.

## D5-13 — Photo viewer: `react-native-zoom-toolkit`

**Decision**: `react-native-zoom-toolkit` 5.1.1 (MIT, 367 kB unpacked, peers `react` and `react-native`;
`ResumableZoom` and `Gallery`; built on Reanimated and Gesture Handler) behind `components/ui/photo-viewer`,
with `expo-image` children (`contentFit="contain"`, thumbnail first), the full-screen `Modal` the viewer
already is, and the existing retry, refile, delete and Close controls. It declares no Reanimated or Gesture
Handler peers and was developed on Reanimated 4.1.1 and Gesture Handler 2.28, so V5 smoke-tests it on 4.5.1
and 2.32.

**Alternatives considered**: a custom Gesture Handler viewer (about 150 lines: the fallback);
`react-native-awesome-gallery` (stale, peer Reanimated 3); `@likashefqet/react-native-image-zoom` (single
image).

## D5-14 — Skeleton, toast, haptics, refresh

**Decision**: Keep HeroUI Native `Skeleton` and `Toast` behind the adapters (`grid-skeleton.tsx`,
`state-skeletons`, a new `toast.tsx`); shape skeletons from the real card geometry (hero 16:10, ticket,
roundel). Haptics through `useHaptics()` with semantic names: sheet snap and tab change give
`selectionAsync` (Android `Segment_Tick` and `Virtual_Key`), primary press `impactAsync(Light)`, stamp
landing `impactAsync(Heavy)`, success and error `notificationAsync`; never during a scroll; debounced 80 ms;
off under reduced motion. No pull-to-refresh in this feature.

**Alternatives considered**: `sonner-native` 0.27.0 (the toast fallback); `burnt` (native toasts, stale);
`moti` and `react-native-skeleton-placeholder` (stale).

## D5-15 — Charts: custom SVG

**Decision**: The expense per-day bars, the category bar and the passport ring are `react-native-svg`
drawings with animated `strokeDashoffset` or heights (`useAnimatedProps`), tabular labels, and exact
`decimal.js` arithmetic for every sum and average (AGENTS.md; SC-016 of feature 001).

**Alternatives considered**: `react-native-gifted-charts` 1.4.80 (367 kB, 99 open issues); `victory-native` and
`@shopify/react-native-skia` (about 10 MB, only if Skia is adopted for other reasons).

## D5-16 — Flags: Unicode flag glyphs in a clipped chip

**Decision**: A `FlagChip` draws the flag emoji for the country's ISO alpha-2 code (`countries.iso_code`)
inside a 20 by 14 dp rounded box with a hairline (28 by 20 large), and falls back to the two-letter code in a
neutral chip where the platform lacks the glyph. There is no flag package and no network.

**Rationale**: offline-first (001) rules out image CDNs; a flat SVG set of about 250 flags would be a new
dependency for decoration. **Alternatives considered**: `country-flag-icons` (SVG strings, a dependency and
about 250 assets). **Consequences**: emoji flags differ in style between platforms and cannot be cropped to the
exact flag ratio; V6 checks both at 20 by 14.

## D5-17 — Derived views read local data only

**Decision**: The Countries list, the passport totals, the stamps, the per-day and per-category spending
summaries, the leg distances, "Day N of M", the countdown and the year totals are pure functions of the local
store (`features/passport/`, `features/trips/`, `features/expenses/`), recomputed from live queries. They add no
table, column, preference or sync field (data-model). Where a view needs "seen" state (the stamp landing),
the rule is "earned in the last seven days and not yet shown in this session", held in memory.

**Rationale**: Constitution I and AGENTS.md ("every new screen that touches traveller data states its
visibility posture"): **private, local, never transmitted**; expenses and documents appear in no view that
could be shared (spec FR-084, and the poster is Tier 3).

## D5-18 — QA: a dev gallery and screenshot assertions

**Decision**: A `__DEV__`-only route `app/(dev)/gallery.tsx` (behind a `Stack.Protected` guard) renders every
adapter in the four themes at font scale 1 and 2, a numerals row (tabular check), skeletons, the sheet
detents, the stamps and the scrims over a white-photograph fixture; Maestro's `assertScreenshot` covers 8 to
12 hero screens against baselines in `e2e/__baselines__/` on one pinned emulator and one simulator, cropped on
a test identifier to avoid the status bar. Reassure and Storybook are deferred.

**Facts**: `assertScreenshot` exists (default threshold 95 percent, `cropOn`, `thresholdPercentage`;
dynamic thresholds had a parse bug, `github.com/mobile-dev-inc/Maestro/issues/3337`). Jest cannot measure how
a screen looks; the 80 percent floor is easily met by adapter tests while the real risk is daylight on a
phone (004 plan, observation 2), so the owner review (T547, T570) is a first-class task.

## D5-19 — Dependencies, supply chain and batches

**Decision**: exact pins, published at least seven days before the install (`npm view <pkg> time --json`
re-run at install time), one `npm install` at the repository root with the lockfile committed, install scripts
reviewed, `npm audit` run, native modules at the SDK 57 pin from `node_modules/expo/bundledNativeModules.json`.
Stay on the SDK 57 pins: do not bump Reanimated and Worklets (latest 4.7.1 and 0.13.0 need a different
pairing), Gesture Handler (3.3.0 changes the API), FlashList (2.3.3) or the map package piecemeal.

**New dependencies** (publish dates verified with the npm registry on 2026-10-12; whole days from the publish time to 2026-10-12 00:00):

| Package                               | Pin    | Published  | Age | Licence         | Role                                                       | Batch        |
| ------------------------------------- | ------ | ---------- | --- | --------------- | ---------------------------------------------------------- | ------------ |
| `expo-glass-effect`                   | 57.0.3 | 2026-09-11 | 30  | MIT             | Tab pill glass on iOS 26 (SDK pin `~57.0.3`)               | 1            |
| `react-native-view-shot`              | 5.1.0  | 2026-05-03 | 161 | MIT             | Roundel and long-list stamp bitmaps (SDK pin; spike-gated) | 1            |
| `@expo-google-fonts/dm-sans`          | 0.4.2  | 2025-09-12 | 394 | MIT AND OFL-1.1 | Body face, 3 weights embedded by the `expo-font` plugin    | 1            |
| `@expo-google-fonts/instrument-serif` | 0.4.1  | 2025-09-05 | 401 | MIT AND OFL-1.1 | Accent word, 1 italic file                                 | 1            |
| `phosphor-react-native`               | 3.0.6  | 2026-04-23 | 171 | MIT             | Icon vocabulary (JS only, per-icon deep imports)           | 1 (JS rider) |
| `react-native-zoom-toolkit`           | 5.1.1  | 2026-08-30 | 42  | MIT             | Photo viewer zoom and gallery (JS only)                    | 1 (JS rider) |

Already installed and used differently: `@expo-google-fonts/bricolage-grotesque` 0.4.1 (2025-09-12, 394 days),
`expo-blur`, `expo-haptics`, `react-native-svg` 15.15.4, `expo-image`, `expo-image-manipulator`,
`heroui-native` 1.0.10, `uniwind` 1.12.0.

**Batches**:

- **Batch 0 (JS only, no new package, no native rebuild)**: the custom sheet and camera padding, the globe
  style layers and tokens, idle rotation, scrims, `AnimatedNumber`, the haptics map, the pill with solid and
  `BlurView` surfaces, SVG stamps, charts, the dev gallery, `assertScreenshot`.
- **Batch 1 (ONE dev-client rebuild for iOS and Android)**: `expo-glass-effect`, `react-native-view-shot`, the
  two new font packages and the font entries in `app.config.ts` (the `expo-font` plugin embeds them, so it is
  native). `phosphor-react-native` and `react-native-zoom-toolkit` are JS-only riders in the same install. The
  rebuild happens once, before the first-slice review (SC-017). If V2 shows roundel capture does not work,
  `react-native-view-shot` is dropped in the next unrelated rebuild; the cost of carrying it is 2.8 MB
  unpacked.
- **Batch 2 (deferred, each its own decision)**: `number-flow-react-native` 0.5.1 (2026-08-19, 53 days), the
  recap and poster set (`expo-sharing` ~57.0.21, 2026-09-18, 23 days, and a sharing spec), `lottie-react-native`
  ~7.3.8 (2026-05-14, 149 days; the stamp landing needs no library), `@lodev09/react-native-true-sheet`,
  `@shopify/react-native-skia` 2.6.2, `expo-linear-gradient` 57.0.2, `reassure` 1.6.0, the map package patch
  bump (10.3.6 published 2026-10-04 fixes camera updates made while the map is off-window on iOS and a
  nullable-bitmap crash on Android; take it at the next unrelated bump).

**Peers** (`npm view <pkg>@<ver> peerDependencies`, 2026-10-12): `expo-glass-effect`: `expo`, `react`,
`react-native` (no dependencies); `phosphor-react-native`: `react`, `react-native`, `react-native-svg`;
`react-native-zoom-toolkit`: `react`, `react-native`. None declares a Reanimated or Gesture Handler peer.

**Not added**: `@gorhom/bottom-sheet` (D5-03), `lottie-react-native`, `expo-sharing`, Skia, Storybook.

## D5-20 — Amendments to earlier specifications

Recorded in [spec.md](./spec.md#amendments-to-earlier-specifications): 004 D4-01, D4-07, D4-08 superseded;
004 FR-001 to FR-004 and FR-010 superseded; 004 FR-033 amended by the caption scrim; 004 D4-05 amended for
text caps; 004 D4-11 amended for the glass pill; 003 FR-013 to FR-015 and FR-018 amended; 002 FR-024
amended; AGENTS.md updated. The 004 palette invariant "no key is pure `#FFFFFF`" is superseded: `paper`
is `#FFFFFF` in Sunrise and `onInk` is `#FFFFFF` in the increased-contrast light theme.

## D5-21 — Android is designed, not derived

**Decision**: Android gets the Material 3 Expressive navigation bar (D5-05), a rounded-square extended action
button (radius 16, 56 dp), a 32 by 4 dp sheet handle, predictive back that lowers the Home sheet before
popping (and closes the photo viewer before popping), no Apple sign-in, edge-to-edge insets from
`react-native-safe-area-context` for every floating element (`Math.max(insets.bottom, 8)`; never a hard-coded
34 or 24), and the form sheets of 004 (no native header, no nested navigator).

**Rationale**: the audit rates the prototype's Android fit at 2.5 ("iOS-leaning everywhere"); Expo's guidance
is not to dress one platform in the other's uniform (004 D4-01).

## D5-22 — Contrast: measured findings that change the tokens

The prototype's own token table was recomputed with the repository's formula (script kept outside the
repository; the numbers are reproduced by the gate, `contracts/design-tokens.md`). Findings that change what
the gate must say:

| #    | Finding (measured 2026-10-12)                                                                                                                       | Consequence                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| M-1  | The coral fill `#FF6B4A` on white is **2.82:1**; the increased-contrast coral `#FF8466` is **2.40:1**                                               | The primary button carries an edge ring in `coralLine` (4.04:1 on white; 7.11:1 `#A82618` in contrast)  |
| M-2  | `on-coral` (navy) on coral is 5.17:1 (7.57:1 in light contrast); never white on coral (2.82:1)                                                      | `accentInk` is navy, not white; the gate lists it                                                       |
| M-3  | The gradient arc ends `#FF9A45` and `#FFB547` on a white casing are **2.11:1** and **1.76:1**                                                       | Every gradient stop is gated against its casing; the light theme ends at `amberLine` `#B86E00` (3.99:1) |
| M-4  | `sand` as a pressed fill: `ink-3` on it is 4.32:1 (light), 3.93:1 (dark); `ink` on dark-contrast `sand` `#4A6688` is 5.92:1                         | A separate `pressed` token; only `ink` text sits on a pressed fill; the gate finalises values           |
| M-5  | White icon on `scrimBtn` (.46) over a white photo is 3.03:1                                                                                         | The alpha is retuned to at least .50 (3.41:1); the floor is not                                         |
| M-6  | `ink-2` on the sea `#8FD6EC` is 4.31:1; `ink` is 9.02:1                                                                                             | Map labels over water use `ink`                                                                         |
| M-7  | The light accent word `coral-text` on the warmest sky glow is 4.46:1                                                                                | Allowed only at display size (large text, 3:1); never at body size on the sky                           |
| M-8  | `coral-text` on its own tint is 5.27:1 (light), 7.65:1 (light contrast); every soft chip is at least 4.99:1 over paper and cream in all four themes | Soft chips are gated at 15 percent over paper and cream, as 004 gates them                              |
| M-9  | `ink-3` on cream is 5.24:1 (light) and 7.59:1 (light contrast): the lowest text pair                                                                | The 7:1 floor holds in the contrast themes for every text pair listed                                   |
| M-10 | The tab capsule `coral-tint` against the white pill is 1.17:1                                                                                       | Decorative: the selected tab is also carried by a filled icon and a heavier label (FR-022)              |

## Items to verify empirically (device spikes)

These could not be confirmed from documentation. Each is a task whose result is written back here, as 004 did.
**Every one of them needs a phone** (iOS, Android or both); the desk part of each (a failing test, a mock, a
bundle) is in its task.

1. **V1 Fonts (T507)**: the six font files load on both platforms through the `expo-font` plugin with the two
   name spellings; iOS applies `tnum` to the embedded Bricolage (render `1111` and `0000` and assert equal
   widths); the tracking compensation of D5-06 brings headings within 3 percent of the prototype's; Dynamic
   Type and Android 200 percent scale every role.
2. **V2 Globe style (T508)**: `Atmosphere` overrides Standard's fog at globe zoom and `spaceColor` with alpha 0
   is or is not see-through; `MarkerView` on the far side of the globe is visible or culled; a hidden
   `view-shot` roundel captures correctly on iOS (laid out off-screen at `left: -2000`, not `opacity: 0`) and
   Android; `takeSnap` is not needed; the visited fill, keyline and gradient arcs are legible over day and
   night.
3. **V3 Sheet (T509)**: the custom sheet and a FlashList hand off cleanly at 60 fps on a mid Android phone
   while the globe renders, the Android back gesture lowers it, the camera padding and zoom keep the planet
   inside the free band at 640 and 932 dp heights, and the sheet over the Android `TextureView` map needs no
   extra elevation.
4. **V4 Glass and the pill (T510)**: `GlassView` on an iOS 26 phone, the opacity-0 bug avoided, the fallback to
   `BlurView` and to solid under reduced transparency and in the contrast themes, the Android navigation bar's
   insets with gesture and three-button navigation.
5. **V5 Stamps and zoom (T511)**: `<Image>` inside an SVG `<Mask>` draws on iOS and Android (else
   `MaskedView`); `TextPath` uses the embedded Bricolage on both; `react-native-zoom-toolkit` 5.1.1 works with
   Reanimated 4.5.1 and Gesture Handler 2.32 (pinch, double-tap, swipe, pull to close).
6. **V6 Motion and images (T512)**: `Link.AppleZoom` latency on the trip route (drop it above about 400 ms);
   WEBP encoding through `expo-image-manipulator` on iOS (else JPEG 78); flag glyphs at 20 by 14 on both
   platforms; the Android haptic constants of the haptics map.
7. **V7 004's open checks, repeated on the new look (T501)**: native header Back (`tapOn: 'Back'`), the form
   sheet keyboard behaviour, the sheet bottom padding at the home indicator, the focus ring at the edges of a
   sideways chip row, continuous corners, the first frame after the splash in all four themes.

**Result**: _pending; each device spike writes its result here in its task._

### Desk spike T506 (no device; 2026-10-12): pass

Run on `feat/005-fonts-mocks` with the six packages installed (T502), the six font entries (T504), the Jest
stand-ins (T503) and the basemap key list (T505) in place. It settles the desk half of the Batch 1 install
(SC-012); the device halves are V1 to V6 above.

1. **Bundles**: `npx expo export --platform android --no-minify` and `--platform ios --no-minify` both
   succeed (exit 0, "Exported:", no crash at teardown, no rerun needed) and print "React Compiler enabled".
   Android 5150 modules in 143.6 s, iOS 5063 modules in 154.1 s (a new worktree, with Jest runs alongside
   each export); the Hermes bundles are 12.5 MB and 12 MB without minification.
   The **Sentry Debug ID is in both** (`sentry-dbid-<uuid>` in the bytecode of each). No `Uniwind Error` line
   is printed. All six family names are in the Uniwind variable tables of the bundles in BOTH spellings
   (`DMSans_400Regular`, `DMSans_600SemiBold`, `DMSans_700Bold`, `InstrumentSerif_400Regular_Italic`,
   `BricolageGrotesque_700Bold` and the iOS PostScript names `DMSans-Regular`, `DMSans-SemiBold`,
   `DMSans-Bold`, `InstrumentSerif-Italic`, `BricolageGrotesque-Bold`), so Uniwind accepts all six
   variables, `--font-serif` (which replaces Tailwind's default of that name) included. The six font files are NOT Metro assets (the
   `expo-font` plugin copies them into the native projects at prebuild), so they do not appear in the export's
   asset list; their size is measured in SC-011 on a build. Findings: (a) the Android export's 31 assets
   include `MaterialSymbols_400Regular.ttf` (967 KB, `expo-symbols`' Android font), which the Phosphor icon
   vocabulary (D5-07) removes: count it in the SC-011 baseline; (b) the bundle has no `phosphor-react-native`
   barrel import yet (no screen uses an icon), so the tree-shaking claim of D5-07 is still to be measured
   when the first registry lands (T518).
2. **React Compiler**: compiled with `babel-plugin-react-compiler` 1.0.0 and its logger (the 004 method) on
   a throwaway screen made of a custom hook, a tab pill and a screen, using Phosphor deep imports
   (`GlobeIcon`, `SuitcaseIcon` by their `src/icons` path), `GlassView` and `isLiquidGlassAvailable`,
   `captureRef`, `ResumableZoom` and `Gallery`, with state, `useRef`, `useMemo`, `useCallback` and an effect:
   **3 functions compiled (memo caches of 4, 18 and 24 slots), 0 bail-outs, skips or pipeline errors**. The
   compiled output rendered under Jest against the stand-ins and stayed correct: the selected icon swaps its
   weight on press (`phosphor-react-native-suitcase-regular` to `-fill`), the pill is a plain view until
   `isLiquidGlassAvailable()` answers `true` and then a `GlassView`, the zoom and gallery stand-ins draw, and
   `captureRef` resolves a file URI into state. No file needs `"use no memo"`. The same limit as 004 applies:
   Jest does not enable the compiler itself, so ordinary suites test the uncompiled source. The throwaway
   test was deleted.
3. **Jest**: the whole existing suite is green with the stand-ins installed for every suite: 197 suites,
   4,397 tests (`npx jest --ci --maxWorkers=2`, 299 s while Metro was exporting).

Facts learned on the way (they change the wording of D5-07 and D5-13, not their decisions):

- **Phosphor's deep import path** is `phosphor-react-native/src/icons/<Name>`, the only subpath its `exports`
  map serves (`./src/icons/*` to `./src/icons/*.tsx`, TypeScript source: `lib/module/icons/*` is NOT
  exported). The named exports are `<Name>Icon` (and the deprecated `<Name>`). The icon renders a
  `react-native-svg` tree whose `testID` is `phosphor-react-native-<name>-<weight>` under Jest, once
  `phosphor-react-native` is in `transformIgnorePatterns`; the bare package is refused under Jest so the
  1,500-icon barrel is never loaded.
- **`react-native-zoom-toolkit` cannot be imported under Jest** (its provider calls Reanimated's `clamp`,
  which the shared Reanimated stand-in does not have), hence the stand-in for `ResumableZoom` and `Gallery`.
  The real `Gallery` clamps `initialIndex`, draws a window of `windowSize` (5) items and reports the start
  index through a Reanimated reaction on mount; the stand-in does the same.
- **Standard configuration keys**: Mapbox documents 46 properties for Standard
  (`docs.mapbox.com/map-styles/reference/standard/`); the allow-list of T505 is a literal copy. Of the keys the
  package types, exactly `colorBoundaries` and `colorGreenspaces` are not Mapbox's. The bundled native SDK
  (11.23.1) is newer than every compatibility entry for the keys the globe sets (`colorLand` needs 11.17.0).

## Owner answers to the open questions (T501)

The owner chose Sunrise Passport as the base direction (2026-10-12) and asked for continued polishing and for the build to proceed; the ten questions of [plan.md](./plan.md#open-questions-for-the-owner) were not answered individually, so each takes its **default** until the owner says otherwise (each is cheap to reverse):

| #    | Answer taken                                                                                                         | Decision it fixes |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Q-1  | Yes: only tab labels, chip captions and hero numerals are capped at 1.3 times text size; all other text scales fully | T515              |
| Q-2  | Yes: the fixed 195 and 7 denominators stay                                                                           | T536, T556        |
| Q-3  | Platform emoji flags in a clipped chip                                                                               | T520              |
| Q-4  | Yes: Plan a trip is a floating button on iOS too                                                                     | T541              |
| Q-5  | Welcome keeps two buttons; Apple and Google live inside the forms                                                    | T554              |
| Q-6  | Yes: react-native-view-shot is in the native batch, spike-gated (T508)                                               | T502, T508        |
| Q-7  | Agreed: no schema change for photo placeholders in this feature                                                      | T523              |
| Q-8  | Empty frames, not commissioned illustrations                                                                         | T537              |
| Q-9  | No Tier 3 item is specified now                                                                                      | none              |
| Q-10 | Glass for the iOS 26 pill with the blur and solid fallbacks                                                          | T526, T510        |

Feature 004 device checks (research item V7 of 004) stay open and are repeated in T547 and T566.
