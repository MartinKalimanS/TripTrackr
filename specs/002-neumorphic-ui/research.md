# Phase 0 Research: Neumorphic Visual Identity

**Feature**: `specs/002-neumorphic-ui` | **Date**: 2026-08-29

All `NEEDS CLARIFICATION` items raised in the Technical Context of `plan.md` are resolved here.
Findings marked **verified** were confirmed against versioned documentation or measured in this
repository; findings marked **to verify in implementation** are cheap empirical checks that are
scheduled as tasks rather than assumed.

---

## R-001: How is a two-shadow neumorphic surface rendered in this stack?

**Decision**: Use the core React Native `boxShadow` style prop with two composed shadow values —
one light, one dark — and the `inset` flag for recessed treatments. No third-party shadow library,
no nested wrapper views, no SVG.

**Rationale** (verified against React Native documentation for `boxShadow` and `BoxShadowValue`):

- `boxShadow` accepts an **array of `BoxShadowValue` objects**, and multiple shadows compose into a
  single prop. Neumorphism needs exactly two, so one prop expresses a complete treatment.
- `BoxShadowValue` exposes `offsetX`, `offsetY`, `blurRadius`, `spreadDistance`, `color`, and
  `inset` — every parameter the style requires.
- `inset: true` renders the shadow inside the border box, which is precisely the recessed treatment
  required by FR-002 for inputs and progress tracks.
- It is a **core** style prop. It adds no dependency, no native module, and therefore requires no
  new dev-client build — a meaningful saving given this project's dev-client workflow.

**Platform constraints (verified)**:

| Capability         | Requirement               |
| ------------------ | ------------------------- |
| `boxShadow` at all | **New Architecture only** |
| Outset shadows     | Android **9+** (API 28)   |
| Inset shadows      | Android **10+** (API 29)  |
| iOS                | Supported                 |

Expo SDK 57 / React Native 0.86 runs the New Architecture by default, so the primary precondition is
already met by this repository.

**Consequence**: Android 9 loses recessed surfaces and pre-Android-9 loses shadows entirely. This is
not a defect to work around at each call site — it is a capability tier, handled once by the
intensity resolver in R-005.

**Alternatives considered**:

- _`react-native-shadow-2` / `react-native-neomorph-shadows`_ — rejected. Both predate `boxShadow`,
  add a dependency and (for the SVG-based options) a per-surface rendering cost, to reproduce
  something the platform now does natively.
- _Two nested `View`s, each with a legacy single shadow_ — rejected. It doubles the view count on
  every card and list row, which is the direct enemy of SC-006, and it cannot express `inset`.
- _Pre-rendered nine-patch images per treatment_ — rejected. It cannot adapt to theme, contrast
  setting, or corner radius, and it multiplies with every token change.

---

## R-002: Can the neumorphic look meet the contrast floors in FR-008 and FR-009?

**Decision**: **Not with shadows alone — and the resolution is architectural, not cosmetic.**
Shadows carry the aesthetic; a hairline border carries the compliance, and it is applied to
**interactive elements only**.

**Rationale**: Candidate tones were measured in this repository using the WCAG relative-luminance
formula. The results are unambiguous:

| Pair (light theme, canvas `#E3E8EF`) | Ratio     | Verdict          |
| ------------------------------------ | --------- | ---------------- |
| canvas vs light shadow `#FFFFFF`     | **1.23**  | cannot ever pass |
| canvas vs dark shadow `#B4BECD`      | **1.52**  | cannot ever pass |
| canvas vs primary text `#151A21`     | **14.19** | AAA              |
| canvas vs secondary text `#4C5666`   | **6.03**  | AA               |
| canvas vs accent `#2456C7`           | **5.28**  | AA               |

The shadow tones sit at 1.2–1.5:1. FR-009 requires 3:1 for anything that identifies a control. No
amount of tuning closes that gap, because a shadow that reached 3:1 against its own background
would no longer read as a soft shadow — it would read as a dark outline, which is the thing
neumorphism exists to avoid.

Solving for the minimum compliant border tone on each canvas gives:

| Canvas          | Minimum compliant border  | Measured ratio |
| --------------- | ------------------------- | -------------- |
| light `#E3E8EF` | `#79838F`                 | **3.13**       |
| light `#E3E8EF` | `#6F7885` (safety margin) | **3.63**       |
| dark `#23272F`  | `#6B7482`                 | **3.17**       |
| dark `#23272F`  | `#727B89` (safety margin) | **3.50**       |

**The scoping decision that preserves the aesthetic**: WCAG 1.4.11 (Non-text Contrast) governs
visual information required to _identify user interface components and their states_. It does not
govern decorative surfaces that carry no affordance. Therefore:

- **Interactive** surfaces — buttons, inputs, toggles, tabs, pressable rows — carry the compliant
  hairline border in addition to their shadows. They are what a traveller must be able to find.
- **Static** surfaces — content cards, section panels, headers — carry shadows alone and remain
  fully borderless. They are the majority of the visible area, so the soft look survives.

This is why FR-009 was written as "by outline, tint, or shadow" rather than "by shadow": the
specification already anticipated that shadow alone would not carry it.

**Alternatives considered**:

- _Darken the shadow until it passes_ — rejected. Measured above; it destroys the style before it
  reaches 3:1.
- _Lower the floor to "neumorphism is inherently low contrast"_ — rejected. The specification states
  legibility outranks the aesthetic, and the constitution's quality gates do not admit a decorative
  exemption.
- _Border on every surface_ — rejected as unnecessary. It would satisfy the rule by over-applying it
  and would flatten the whole product for no accessibility gain.

---

## R-003: How do the four accessibility adaptations map onto actual platform signals?

**Decision**: Resolve a single `AppearanceContext` from `useColorScheme()`, `AccessibilityInfo`, and
`useWindowDimensions().fontScale`, mapping each requirement to the correct per-platform signal.

**Rationale** (verified against React Native `AccessibilityInfo` documentation):

| Requirement                 | iOS signal                    | Android signal              | Cross-platform? |
| --------------------------- | ----------------------------- | --------------------------- | --------------- |
| FR-015 reduced motion       | `isReduceMotionEnabled`       | `isReduceMotionEnabled`     | **Yes**         |
| FR-014 reduced transparency | `isReduceTransparencyEnabled` | — none —                    | No (iOS only)   |
| FR-013 increased contrast   | `isDarkerSystemColorsEnabled` | `isHighTextContrastEnabled` | No (differs)    |
| FR-016 enlarged text        | `fontScale`                   | `fontScale`                 | **Yes**         |

Two findings matter and are easy to get wrong:

1. **"Increased contrast" has no single cross-platform accessor.** iOS exposes it as
   `isDarkerSystemColorsEnabled`; Android's nearest equivalent is `isHighTextContrastEnabled`. They
   must be read separately and normalised into one internal flag, or FR-013 will silently work on
   one platform only.
2. **Android has no "reduce transparency" setting at all.** FR-014 is therefore satisfied on Android
   by construction — the design uses opaque surfaces as its default, so there is nothing to disable.
   This is recorded so that a future reviewer does not read the Android gap as a missing feature.

Each signal has a corresponding `*Changed` event, so the context updates live rather than only at
launch — which is what Acceptance Scenario 3.2 (switching appearance while the app is open)
requires.

**Alternatives considered**:

- _Read the flags at each component_ — rejected. It multiplies subscriptions across the tree and
  makes the per-platform mapping a thing every contributor must remember. One resolver, one
  contract.
- _An in-app appearance toggle_ — rejected as out of scope. FR-023 says follow the device.

---

## R-004: How is the press response implemented so that it satisfies both SC-005 and FR-015?

**Decision**: Swap **discrete token sets** on press. Do not interpolate or animate the shadow.

**Rationale**: This is the decision that makes several requirements collapse into one simple
mechanism.

- `boxShadow` is a layout-adjacent paint property; driving it through an animation loop means
  producing new style objects every frame, which is exactly the cost SC-006 forbids on list-heavy
  screens.
- SC-005 allows 100 ms to first visual response. A discrete swap is effectively instantaneous, so it
  passes with the entire budget unspent — an interpolated animation spends the budget to arrive at
  the same perceived result.
- FR-015 (reduced motion must resolve instantly while still showing the destination state) becomes
  **free**: there is no transition to suppress, because the destination state is all there ever was.

Reanimated 4.5.1 is present in the project and remains the right tool for gesture-driven and
layout animation elsewhere. It is simply not required here, and using it here would create work in
order to create a requirement to undo that work under reduced motion.

**Alternatives considered**:

- _Reanimated shared value interpolating shadow offsets_ — rejected on the reasoning above.
- _Animating `transform: scale` as a proxy for depth_ — rejected. It reads as a UI convention rather
  than as a physical surface, contradicting the metaphor the whole feature exists to establish, and
  it is motion that reduced-motion users would then need excluded.

---

## R-005: How is SC-006 (no scroll regression on the oldest supported device) protected?

**Decision**: A single `elevationProfile` resolver returning `full`, `reduced`, or `flat`, consulted
once per appearance change rather than per surface.

**Rationale**: Two soft shadows per row across a long list is the realistic performance risk in this
feature, and it coincides exactly with the Android capability tiers from R-001. One resolver
therefore covers both concerns:

| Profile   | Selected when                                                         | Rendering                                        |
| --------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `full`    | iOS, or Android 10+                                                   | Two composed shadows, outset and inset available |
| `reduced` | Android 9 (outset only), or increased-contrast requested              | One outset shadow plus compliant border          |
| `flat`    | Android 8 and below, or measured frame-rate shortfall in list context | Borders and tonal fill only, no shadows          |

Because every treatment is resolved from tokens rather than hard-coded per component, dropping a
tier changes no call site. The same mechanism satisfies FR-013's border requirement, since
increased-contrast simply selects `reduced`.

**Alternatives considered**:

- _Shadows everywhere, optimise later if it stutters_ — rejected. SC-006 is measured against the
  oldest supported device, and retrofitting a capability tier after every screen has hard-coded a
  shadow is the expensive order to do this in.
- _Rasterising shadowed rows to bitmaps_ — rejected as premature. It trades memory and theme
  responsiveness for a problem not yet measured.

---

## R-006: Does the existing theme layer get extended or replaced?

**Decision**: Extend. `apps/mobile/src/constants/theme.ts` keeps its role as the token source; `Colors` gains the
neumorphic surface ramps and `Spacing` is retained unchanged. `ThemedView` and `ThemedText` remain
the typed entry points and gain a `treatment` capability rather than being superseded.

**Rationale** (verified by reading the repository):

- `apps/mobile/src/constants/theme.ts` already exports `Colors` (light/dark), `Fonts`, `Spacing`, and layout
  constants, and `ThemeColor` is already a union derived from the palette — so adding surface tones
  extends the existing type safety instead of competing with it.
- `apps/mobile/src/hooks/use-theme.ts` already resolves the scheme and returns the active palette. It is the
  natural place to widen into the fuller `AppearanceContext` of R-003.
- `ThemedView` already accepts a `type?: ThemeColor` and applies a background. A `treatment` prop is
  the same idea one level up.
- The `Spacing` scale (2/4/8/16/24/32/64) is sound and is reused as-is; FR-001's "spacing steps" is
  already satisfied by existing code.

**Consequence for scope**: the product is currently at its scaffold state — `apps/mobile/src/app/` contains
`index.tsx` and `explore.tsx`. The MVP screens described in `specs/001-triptrackr-mvp` are not yet
built. So "every screen" (FR-003) is small today, and the substance of this feature is the **token
system, the treatment primitives, and the automated verification harness** that feature 001's
screens will then be built on top of. This is the favourable ordering: the design system lands
before the screens that must comply with it, rather than as a retrofit across a finished app.

_Annotation 2026-09-23_: the two template screens were deleted with the create-expo-app scaffold
(001 research D-14, task R008), which makes the paragraph above more true rather than less — the
token layer, primitives, and harness are exactly what survived, and the first real consumer is the
custom tab bar (tasks.md T076; 001 research D-17). `use-theme.ts`, named above as the widening
point, went with the last template consumer; `useAppearance()` (R-003, contract C4) is the single
entry point that remains. `ThemedView` and `ThemedText` are retained as described.

**Alternatives considered**:

- _A styling library (Unistyles, Tamagui, NativeWind)_ — rejected. The token surface needed here is
  small, the existing theme module already does the job, and each option adds a build-level
  dependency plus a migration for code that is already written and tested.
- _A parallel `apps/mobile/src/design/` system alongside the existing theme_ — rejected. Two sources of truth
  for colour is the exact failure FR-028 forbids.

---

## R-007: What happens to `expo-glass-effect`?

**Decision**: Do not adopt it. Leave the dependency installed but unused, and record that
translucent-glass treatments are outside this feature's visual language.

**Rationale**: `expo-glass-effect@~57.0.1` is present in `package.json`, and a repository-wide search
confirms **no source file imports it** — it arrived with the scaffold, not from a design decision.
Glass and neumorphism are opposed metaphors: glass says "a translucent pane floating above content",
neumorphism says "a surface moulded out of the background". Mixing them on one screen produces
exactly the borrowed-from-another-app incoherence User Story 1 exists to eliminate. Glass would also
work against FR-014, since a reduced-transparency request would require an opaque fallback for every
glass surface.

**Alternatives considered**:

- _Glass for floating controls over the globe, neumorphism elsewhere_ — genuinely tempting, since
  US6 needs legible controls over map imagery, and rejected anyway: FR-025 is satisfied by an opaque
  neumorphic control with a compliant border, which is both simpler and already required.
- _Removing the dependency in this feature_ — deferred, not rejected. It is unused dead weight, but
  removing it is a dependency change unrelated to this feature's user-visible outcome, so it belongs
  in a housekeeping change rather than here.

---

## R-008: Items to verify empirically during implementation

These are cheap checks, deliberately scheduled rather than assumed. Each becomes a task.

1. ~~**`offsetY` sign convention.**~~ **RESOLVED 2026-08-29 — from source, no device required.**
   The documentation page claims positive `offsetY` means _up_. That is **wrong**. Both native
   implementations offset in a y-down coordinate space:
   - iOS `React/Fabric/Utils/RCTBoxShadow.mm:82` — `CGRectOffset(shadowRect, shadow.offsetX, shadow.offsetY)`;
     Core Graphics view coordinates have y increasing downward.
   - Android `.../drawable/OutsetBoxShadowDrawable.kt:100` — `offset(offsetX.dpToPx(), offsetY.dpToPx())`
     on a canvas whose y also increases downward.

   **Positive `offsetY` moves the shadow down, matching CSS.** The CSS-convention assumption in
   `data-model.md` §1.4 therefore holds and no sign flip is required.

   A second documentation error surfaced alongside it: `Libraries/StyleSheet/StyleSheetTypes.d.ts:344`
   defines only `offsetX` and `offsetY` as required on `BoxShadowValue`; `blurRadius`,
   `spreadDistance`, `color`, and `inset` are all optional. The documentation table stated the
   opposite. The type definition is authoritative.

2. ~~**`react-native-web` behaviour.**~~ **RESOLVED 2026-08-29 — from source, no browser required.**
   `react-native-web@0.21` supports **both** composed and inset shadows:
   - `dist/exports/StyleSheet/preprocess.js:167-172` — an array `boxShadow` is passed through
     `createBoxShadowArrayValue`, which maps each entry and joins them with `', '`, producing a
     multi-shadow CSS `box-shadow`.
   - `dist/exports/StyleSheet/preprocess.js:67` — `var position = boxShadow.inset ? 'inset ' : ''`,
     so the `inset` keyword is emitted.

   Web therefore resolves to the **`full`** profile rather than degrading to `flat`.
   `apps/mobile/src/theme/elevation-profile.ts` and `apps/mobile/test/theme/elevation-profile.test.ts` were updated
   accordingly; only genuinely unrecognised platforms now fall back to `flat`.

   _Annotation 2026-09-23 — **moot, retained as history**._ The web target was removed by the
   architecture audit (001 research D-14): `react-native-web`, `react-dom`, every `*.web.tsx`
   variant, and `global.css` are gone, and the app ships to iOS and Android only. Nothing above is
   wrong — it is simply no longer exercised. The resolver's rule that unrecognised platforms fall
   back to `flat` is unaffected; a `web` branch, if one remains, is dead code to be removed when
   `elevation-profile.ts` is next touched, not a supported path.

3. **Frame-rate baseline.** SC-006 is a _regression_ criterion, so a pre-change baseline must be
   captured on the oldest supported device before the treatments are applied. A criterion measured
   only after the change cannot detect a regression.

---

## Summary of decisions

| ID    | Decision                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------- |
| R-001 | Core `boxShadow` with two composed values and `inset`; no dependency added                           |
| R-002 | Shadows for aesthetics, compliant hairline border on interactive elements only                       |
| R-003 | One `AppearanceContext` resolver; per-platform mapping for contrast/transparency                     |
| R-004 | Discrete token swap on press — no interpolation, so reduced motion is free                           |
| R-005 | `full` / `reduced` / `flat` elevation profiles from one resolver                                     |
| R-006 | Extend `apps/mobile/src/constants/theme.ts`; no styling library, no parallel system                  |
| R-007 | `expo-glass-effect` not adopted; removal deferred to housekeeping                                    |
| R-008 | Three empirical checks scheduled: offsetY sign, web behaviour (moot since 2026-09-23), perf baseline |
