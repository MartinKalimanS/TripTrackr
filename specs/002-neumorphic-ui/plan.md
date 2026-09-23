# Implementation Plan: Neumorphic Visual Identity

**Branch**: `002-neumorphic-ui` | **Date**: 2026-08-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-neumorphic-ui/spec.md`

## Summary

Give TripTrackr one deliberate, tactile visual identity — surfaces that read as raised out of or
pressed into the background — without letting the style's inherently low contrast make the product
unusable outdoors, at night, or for travellers relying on accessibility settings.

The technical approach is deliberately small. React Native's core `boxShadow` prop accepts two
composed shadows plus an `inset` flag, which expresses a complete neumorphic treatment in a single
style value with **no new dependency and no dev-client rebuild**. Contrast measurement (see
[research.md](./research.md), R-002) proves shadow tones can never reach the 3:1 floor that FR-009
demands, so the design splits the job: **shadows carry the aesthetic, a compliant hairline border
carries the legibility guarantee, and the border is applied to interactive elements only** — which
is precisely the scope WCAG 1.4.11 governs, and which leaves the majority of the visible surface
area fully borderless.

Everything else follows from three consolidations: one `AppearanceContext` resolves theme and all
four accessibility signals (including the two that have no cross-platform accessor); one
`elevationProfile` resolver collapses Android capability tiers and performance headroom into
`full`/`reduced`/`flat`; and press feedback swaps **discrete** token sets rather than animating,
which satisfies the 100 ms response budget and makes reduced-motion support free.

Because the product is still at scaffold state, the deliverable is the token system, the treatment
primitives, and an automated contrast harness — landing the design system *before* the MVP screens
that must comply with it, rather than retrofitting it afterwards.

## Technical Context

**Language/Version**: TypeScript ~6.0.3, React 19.2.3, React Native 0.86.3 (New Architecture)

**Primary Dependencies**: Expo SDK ~57.0.18, `expo-router` ~57.0.17. **No new runtime dependency is
added by this feature** — `boxShadow` is a core React Native style prop. `react-native-reanimated`
4.5.1 is present and deliberately not used here (research R-004).

**Storage**: N/A. This feature reads no persisted state and writes none. The device appearance
preference and accessibility settings are read live from the OS.

**Testing**: Jest with the `jest-expo` preset and `@testing-library/react-native`; Maestro for E2E
(`e2e/`). Coverage floor 80% globally, already enforced in `jest.config.js`.

**Target Platform**: iOS and Android via Expo dev-client; web (`react-native-web` ~0.21.0) as a
best-effort secondary target. Android capability tiers are load-bearing: outset shadows require
API 28+, inset shadows API 29+.

**Project Type**: Mobile application, single codebase under `src/`.

**Performance Goals**: Visual press response within 100 ms; depth transitions within 200 ms
(SC-005). No measurable frame-rate regression when scrolling lists on the oldest supported device
(SC-006), measured against a baseline captured before the change.

**Constraints**: WCAG AA as the floor — 4.5:1 normal text, 3:1 non-text and controls (FR-008,
FR-009); AAA (7:1) when increased contrast is requested (FR-013). Complete rendering at the
platform's largest text size (FR-016). Assistive-technology output must be byte-identical before and
after (FR-017). No change to any capability, stored record, permission, or privacy behaviour
(FR-029).

**Scale/Scope**: 2 existing screens (`src/app/index.tsx`, `src/app/explore.tsx`) plus the shared
component layer; the token system and primitives are sized for the ~15 screens that feature 001 will
add. 29 functional requirements, 10 success criteria.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design._

### Pre-Phase-0 evaluation

| Principle                                     | Status  | Assessment                                                                                                                                                                                                                                       |
| --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I. Privacy is structural**                  | ✅ PASS | The feature touches no data-access path, no query, no visibility flag. FR-029 states this explicitly. No new table, endpoint, or screen is introduced, so there is no new visibility posture to declare — the posture is "reads no traveller data". |
| **II. Offline is the default assumption**     | ✅ PASS | Actively supports it. FR-007 requires a distinct treatment for locally-recorded-but-unsynchronised content, which is the visual half of the principle's rule that a record must not be presented as saved before its bytes have landed.              |
| **III. Test-first, adversarial privacy tests** | ✅ PASS | Contrast compliance is a pure function over token pairs, so SC-002 is enforceable as a unit test written before the tokens exist. Adversarial privacy tests are not applicable — no data-access surface is added, and none is removed either.        |
| **IV. Verify before you render**              | ✅ PASS | Applied to this plan's own output: the palette was not asserted, it was measured (research R-002), and the three things that could not be confirmed from documentation are scheduled as empirical checks rather than assumed (research R-008).       |
| **V. Nothing held hostage**                   | ✅ PASS | No commercial gating, no retention behaviour, no deletion path is involved.                                                                                                                                                                        |

### Technology & platform constraints

| Constraint                                  | Status  | Assessment                                                                                                                                                             |
| ------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo version discipline (v57.0.0 docs)      | ✅ PASS | `boxShadow`, `BoxShadowValue`, and `AccessibilityInfo` were read from versioned documentation rather than recalled; the per-platform accessibility mapping in R-003 is a direct consequence and would have been got wrong from memory. |
| Dev-client workflow, native modules         | ✅ PASS | No native module added. `boxShadow` is core, so no rebuild is required.                                                                                                |
| Secrets, migrations, rate limiting, backups | ✅ N/A  | No server, database, secret, or metered service is touched.                                                                                                            |

### Development workflow & quality gates

| Gate                                    | Status  | Assessment                                                                                                                                                                                    |
| --------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Specification precedes code             | ✅ PASS | `/speckit-specify` completed; this plan holds the technology decisions the spec deliberately excluded.                                                                                            |
| Security review required?               | ✅ N/A  | No authentication, input handling, query, file handling, external call, cryptography, or payment code is touched.                                                                                  |
| **The offline-sync gate**               | ✅ PASS | This is not a social or sharing feature, so the gate does not apply to it. Worth stating plainly: shipping a visual identity does **not** advance the product past that gate, and must not be read as doing so. |
| Quality bar (<50-line functions, <800-line files, <4 nesting) | ✅ PASS | The token modules are data; the primitives are thin. Files are split by concern (see Structure) specifically to keep each well inside the limits. |
| Immutability                            | ✅ PASS | Tokens are frozen constant objects; resolvers return new style objects and mutate nothing.                                                                                                        |

**Result: PASS. No violations, so the Complexity Tracking table below stays empty.**

### Post-Phase-1 re-evaluation

Re-checked after `data-model.md`, `contracts/`, and `quickstart.md` were written. **Still PASS**, with
two observations that arose from the design and are recorded rather than waived:

1. **Principle IV strengthened during design.** The contrast harness in the token contract does not
   merely test the palette that ships — it fails the build on any token pair that falls below its
   floor, including pairs added later. That converts SC-002 from a release-time audit into a
   standing gate, which is the stronger reading of "verify before you render".
2. **Principle III's 80% coverage floor is comfortably reachable and is not the real risk here.**
   The token and resolver layer is pure and trivially coverable, which could produce a high
   percentage while the actual risk — how surfaces look on a physical device in daylight — goes
   untested. SC-003 and R-008's empirical checks are therefore *not* substitutable by unit tests, and
   the task breakdown must keep them as first-class items rather than letting coverage stand in for
   them.

## Project Structure

### Documentation (this feature)

```text
specs/002-neumorphic-ui/
├── spec.md                       # /speckit-specify output
├── plan.md                       # This file
├── research.md                   # Phase 0 — 8 resolved decisions
├── data-model.md                 # Phase 1 — token and state model
├── quickstart.md                 # Phase 1 — validation guide
├── contracts/
│   ├── design-tokens.md          # Phase 1 — token contract and invariants
│   └── surface-components.md     # Phase 1 — component API contract
├── checklists/
│   └── requirements.md           # Spec quality checklist (16/16 pass)
└── tasks.md                      # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
src/
├── constants/
│   └── theme.ts                  # EXTENDED — surface ramps, shadow tones, radii, borders
├── theme/                        # NEW — the token and resolution layer
│   ├── surfaces.ts               #   raised/recessed/flat/pressed boxShadow recipes
│   ├── elevation-profile.ts      #   full | reduced | flat resolver (research R-005)
│   ├── contrast.ts               #   pure WCAG relative-luminance + ratio functions
│   └── index.ts                  #   public surface of the token layer
├── hooks/
│   ├── use-color-scheme.ts       # EXISTING — unchanged
│   ├── use-theme.ts              # EXTENDED — returns the full AppearanceContext
│   ├── use-appearance.ts         # NEW — theme + 4 accessibility signals, live-updating
│   └── use-surface.ts            # NEW — treatment + state -> concrete style
├── components/
│   ├── themed-view.tsx           # EXTENDED — accepts `treatment`
│   ├── themed-text.tsx           # EXISTING — unchanged (colour already tokenised)
│   └── ui/
│       ├── surface.tsx           # NEW — static raised/recessed/flat surface
│       ├── pressable-surface.tsx # NEW — press, busy, disabled states
│       ├── text-field.tsx        # NEW — recessed input with focus indicator
│       ├── sync-badge.tsx        # NEW — FR-007 pending-synchronisation treatment
│       └── collapsible.tsx       # EXISTING — restyled onto the primitives
└── app/
    ├── _layout.tsx               # EXTENDED — canvas background, status bar per theme
    ├── index.tsx                 # RESTYLED onto the primitives
    └── explore.tsx               # RESTYLED onto the primitives

test/
└── theme/
    ├── contrast.test.ts          # SC-002 — every token pair against its floor
    ├── elevation-profile.test.ts # research R-005 — tier selection per platform/OS version
    └── appearance.test.ts        # research R-003 — per-platform signal mapping

e2e/
└── 01-appearance.yaml            # NEW — theme switch and largest-text-size sweep
```

**Structure Decision**: Single mobile codebase, extending the existing layout rather than
introducing a parallel design system (research R-006). The one new directory is `src/theme/`, which
holds pure, dependency-free token and resolution logic; keeping it separate from
`src/constants/theme.ts` splits *values* from *derivation* and keeps both files far below the
800-line limit. Components stay where the project already puts them (`src/components/ui/`), so the
new primitives are discovered the same way `collapsible.tsx` already is. Test files mirror the
source tree under the existing `test/` root, matching the `testMatch` globs already configured in
`jest.config.js`.

## Complexity Tracking

> No constitutional violations were identified, so no justifications are required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| _(none)_  | —          | —                                    |
