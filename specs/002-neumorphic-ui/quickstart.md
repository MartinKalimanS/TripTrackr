# Quickstart: Validating the Neumorphic Visual Identity

**Feature**: `specs/002-neumorphic-ui` | **Date**: 2026-08-29

How to prove this feature works. Every success criterion in the spec maps to something runnable
here, except the three that require human eyes or a physical device — those are called out
explicitly rather than quietly dropped.

---

## Prerequisites

```bash
npm install                       # no new dependency is added by this feature
npm run typecheck                 # tsc --noEmit
```

> **Monorepo note (2026-09-23).** The app now lives in the `apps/mobile` workspace (001 research
> D-13). `npm install`, `npm run lint`, `npm run typecheck`, and `npm test` still work from the
> repository root and fan out to every workspace; the app-only scripts below (`npm run test:cov`,
> `npm run ios` / `npm run android`, `npm run e2e`) run from `apps/mobile/`, or from the root with
> `-w apps/mobile`.

No dev-client rebuild is required. `boxShadow` is a core React Native style prop, so nothing native
changes (research R-001).

**Devices needed for full validation**

| Target                      | Why                                              |
| --------------------------- | ------------------------------------------------ |
| iOS device or simulator     | `full` profile; iOS-only accessibility signals   |
| Android 10+ (API 29+)       | `full` profile; inset shadows                    |
| Android 9 (API 28)          | `reduced` profile — outset only. Easy to forget. |
| A physical device, outdoors | SC-003. Not simulatable.                         |

---

## 1. Automated gates

```bash
npm run lint                      # includes the no-colour-literal rule (contract C1)
npm test                          # unit + component; 80% coverage floor enforced
npm run test:cov                  # coverage report
```

### What the suite proves

| Test file                                          | Proves                                                      | Criterion  |
| -------------------------------------------------- | ----------------------------------------------------------- | ---------- |
| `apps/mobile/test/theme/contrast.test.ts`          | Every token pair meets its floor, both themes, all profiles | **SC-002** |
| `apps/mobile/test/theme/elevation-profile.test.ts` | Correct tier per platform and API level                     | R-005      |
| `apps/mobile/test/theme/appearance.test.ts`        | Per-platform accessibility signal mapping                   | R-003      |
| `apps/mobile/src/components/ui/*.test.tsx`         | Press/busy/disabled states and their announcements          | FR-018–020 |

**Expected outcome**: all green. A failing `contrast.test.ts` means a token was changed or added
without classification — fix the token or classify the pair, never relax the assertion.

### Try breaking it on purpose

Confidence in the gate is worth more than a passing run:

```bash
# Temporarily lighten a border token in apps/mobile/src/constants/theme.ts, e.g. #79838F -> #A8B2BE
npm test -- contrast
```

**Expected**: the suite fails and names the offending pair with its measured ratio. If it passes,
the gate is not exhaustive over the token set and must be fixed before anything else proceeds.

---

## 2. Manual device sweep

```bash
npm run ios          # or: npm run android
```

For **each** target device in the prerequisites table, walk every screen and confirm:

### 2.1 Coherence — SC-001, User Story 1

- [ ] No surface, control, or field falls back to unstyled platform defaults.
- [ ] Every raised element is lit from the **same** direction (FR-005).
- [ ] Inputs read as recessed before being touched.
- [ ] Empty, loading, and error states are styled, not left bare (FR-027).

### 2.2 Light source sanity — research R-008.1

- [ ] Raised surfaces look raised, not pressed in.

> This is the single cheapest, highest-value check in the whole feature. The `BoxShadowValue`
> documentation states positive `offsetY` means _up_, contradicting the CSS convention. If it is
> wrong, **every** surface is inverted and the entire token set needs its signs flipped. Do this
> before tuning any other value.

### 2.3 Theme — SC-010, User Story 3

- [ ] Switch the device to dark **while the app is open**: the whole interface updates together.
- [ ] No screen or component is left in the previous theme.

### 2.4 Accessibility adaptations — SC-010, User Story 5

Enable each in turn, then re-walk the screens:

| Setting             | iOS path                                    | Android path                       | Expected                          |
| ------------------- | ------------------------------------------- | ---------------------------------- | --------------------------------- |
| Increase contrast   | Accessibility → Display → Increase Contrast | Accessibility → High contrast text | Borders appear; `reduced` profile |
| Reduce motion       | Accessibility → Motion                      | Accessibility → Remove animations  | States still change, instantly    |
| Reduce transparency | Accessibility → Display                     | _(no such setting — expected)_     | Opaque surfaces                   |
| Largest text        | Accessibility → Display → Text Size         | Display → Font size (max)          | Nothing clipped (**SC-008**)      |

**Driving these from adb** — the exact keys matter, and two of them are easy to get wrong. These
were read out of React Native's own `AccessibilityInfoModule.kt`, not guessed:

```bash
# increase contrast — Settings.Secure "high_text_contrast_enabled" (AccessibilityInfoModule.kt:317)
adb shell settings put secure high_text_contrast_enabled 1

# reduce motion — RN reads Global.TRANSITION_ANIMATION_SCALE, *not* animator_duration_scale
# (AccessibilityInfoModule.kt:101-107). Setting the animator scale alone does nothing.
adb shell settings put global transition_animation_scale 0

# largest text
adb shell settings put system font_scale 1.8

# theme, with the app already running
adb shell "cmd uimode night yes"
```

Restore afterwards — these are the traveller's own device settings:

```bash
adb shell settings put secure high_text_contrast_enabled 0
adb shell settings put global transition_animation_scale 1.0
adb shell settings put system font_scale 1.0
adb shell "cmd uimode night no"
```

> **Known caveat when running under Expo Go.** RN's Android accessibility module reads these values
> natively and registers a `ContentObserver` on them. Toggling a setting and doing a JS-only Reload
> was observed NOT to change the rendered profile — a full process restart of the host app may be
> required. Verify increased contrast in a standalone dev-client build before concluding FR-013 is
> broken.

- [ ] Every action available by default is still available under each setting.

### 2.5 Press feedback — SC-005, User Story 4

- [ ] Press and hold: sinks immediately, stays sunk while held, rises on release.
- [ ] Disabled controls are flat, inert, announced unavailable.
- [ ] Busy controls reject further presses.

### 2.6 Media surfaces — User Story 6

- [ ] No shadow, tint, or overlay drawn across map, globe, or photo content.
- [ ] Controls over media are legible against both light and dark areas beneath.
- [ ] A near-white photo on a light surface still shows its boundary.

### 2.7 Android 9 specifically

- [ ] Recessed elements fall back to `surfaceSunk` plus border — not to an undifferentiated flat
      rectangle.

---

## 3. End-to-end

```bash
npm run e2e                       # maestro test apps/mobile/e2e/
```

`apps/mobile/e2e/01-appearance.yaml` sweeps theme switching and the largest text size across the main screens,
asserting no clipped or missing content (**SC-008**, **SC-010**).

---

## 4. Screen-reader parity — SC-009

Capture the announced output for each screen **before and after** the change, using VoiceOver (iOS)
and TalkBack (Android).

- [ ] Reading order identical.
- [ ] Names, roles, and states identical.

**Expected**: no diff. This is a visual change; any difference in announced output is a regression,
regardless of whether it looks like an improvement.

> **One intentional exception, recorded so it is not mistaken for a regression during T070.**
> `<Collapsible>`'s header was a bare `Pressable` carrying no role and no state, so a screen reader
> announced it as plain text — a VoiceOver/TalkBack user got no indication the section could be
> opened, because the chevron was the only other affordance and it is exactly the cue they cannot
> see. It now sets `accessibilityRole="button"`, `accessibilityLabel={title}`, and
> `accessibilityState={{ expanded }}`. This is a pre-existing defect surfaced by this feature's
> work, not caused by it. Expect the five Explore sections to gain "button" plus an
> expanded/collapsed state in the after-capture; every other announcement should be unchanged.

---

## 5. Performance — SC-006

**Capture the baseline before applying any treatment.** A regression criterion measured only after
the change cannot detect a regression (research R-008.3).

```bash
# 1. Before: record scroll frame rate on the oldest supported device
# 2. After:  repeat on the identical device, same list, same content
```

- [ ] No visible stutter.
- [ ] No measurable frame-rate regression.

**If it regresses**: drop that context to the `flat` profile via the resolver. Do not hand-optimise
individual components — that is what the profile mechanism exists to prevent (research R-005).

---

## 6. What cannot be automated

Stated plainly so these do not quietly disappear into a green test run:

| Criterion  | Why it needs people                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **SC-003** | Outdoor daylight legibility, 10 participants. No emulator reproduces sunlight — and this is the criterion the whole style most risks failing. |
| **SC-004** | Whether 95% of first-time viewers can tell what is tappable from a still image.                                                               |
| **SC-007** | Task-completion timings compared against the pre-change build.                                                                                |

Coverage percentage is not a substitute for any of these. The token layer is pure and trivially
coverable, so it is entirely possible to reach 80% while the actual question — how this looks in a
traveller's hand on a bright street — remains untested.

---

## Definition of done

- [x] `npm run lint`, `npm run typecheck`, `npm test` all pass; coverage ≥ 80%.
      **Re-verified 2026-08-30**: lint exit 0; `npx tsc --noEmit` exit 0 for both the mobile project
      and `server/`; 198 tests across 29 suites; coverage statements 87.10% / branches 83.18% /
      functions 80.72% / lines 86.36%.
      Two defects were fixed to get here. (1) `npm run typecheck` was compiling the NestJS `server/`
      tree under the mobile tsconfig — no `exclude`, so `@/*` resolved to `src/` and every decorator
      was rejected; the root `tsconfig.json` now excludes `server`, matching the boundary
      `jest.config.js` already drew, and the two projects typecheck independently. (2) Prettier
      reported 38 files as misformatted, which was almost entirely line endings: `core.autocrlf` is
      `true` so the working tree is CRLF, while `.prettierrc` set no `endOfLine` and Prettier
      defaults to `lf`. Setting `endOfLine: "auto"` and `bracketSameLine: true` (the latter matching
      how the codebase already writes JSX) resolved it; the residual genuine deviations were
      reformatted in one pass and `npx prettier --check` is now clean across `src/` and `test/`.
      _Layout note (2026-09-23): the paragraph above describes the pre-monorepo tree. `server/` is
      now `apps/api/`, the mobile project is `apps/mobile/`, and the `exclude` / `testPathIgnorePatterns`
      seams it mentions no longer exist — each workspace has its own `tsconfig.json` and
      `jest.config.js` (001 research D-13). Kept as written because it records what was verified
      on that date._
- [x] Contrast gate verified to actually fail when a token is broken (§1).
      **Verified**: lightening `border` to `#A8B2BE` drops it to 1.74:1 and fails the suite by name.
- [x] `offsetY` sign confirmed on both platforms (§2.2).
      **Resolved from source** rather than on device — `RCTBoxShadow.mm:82` and
      `OutsetBoxShadowDrawable.kt:100` both offset in a y-down space, so positive `offsetY` is DOWN,
      matching CSS. The documentation page states the opposite and is wrong (research R-008.1).
- [ ] Manual sweep complete on iOS, Android 10+, **and Android 9**. — **DEFERRED, needs hardware**
- [ ] All four accessibility adaptations verified on device. — **DEFERRED, needs hardware**
- [x] Action parity under every setting (T059). — **DONE**, automated in
      `apps/mobile/test/app/action-parity.test.tsx` against the registry in `apps/mobile/test/app/action-registry.ts`.
      _Superseded 2026-09-23: both files rendered the two template screens and were deleted with them
      (001 R008; tasks.md status note). The parity property is re-verified per real screen as feature
      001 lands, reusing the registry pattern described in the deferral record below._
- [ ] Screen-reader output diffed before/after — no change. — **DEFERRED, needs VoiceOver/TalkBack**
- [ ] Performance baseline captured before, compared after. — **DEFERRED, needs the oldest supported
      device; note the baseline had to be captured BEFORE the change and was not, so a true
      regression comparison is no longer possible on this build — see the note below.**
- [ ] SC-003, SC-004, SC-007 scheduled with real participants, or explicitly deferred with the
      deferral recorded. — **DEFERRED, recorded here and in tasks.md**

### Deferral record (T075)

Everything automatable is done and green, with one correction to an earlier version of this record:
T059 (Acceptance Scenario 5.4 — every default action remains available under each setting) was
previously listed here as deferred, but it is a _parity_ property rather than a look-and-feel one,
and parity is a set comparison a test can make. It is now automated in
`apps/mobile/test/app/action-parity.test.tsx`, which renders both screens across five settings — each of the
three signals alone, the largest text size, and all of them at once — and diffs the action set
against the default. "An action" is defined by the explicit per-screen registry in
`apps/mobile/test/app/action-registry.ts`; that file records why a registry was chosen over reading the
accessibility tree or harvesting press handlers, and states the cost it carries.

Verified by mutation rather than by the suite being green: hiding the home screen's primary action
above a font scale of 2 failed exactly the two rows involving the largest text size and no others.

The remaining items are deferred because each requires a physical device, an assistive technology,
or human participants — none of which are available in this environment. They are not optional: SC-003 (outdoor daylight legibility) is the criterion this
style most risks failing, and no amount of green unit tests substitutes for it.

**One deferral has degraded, and it is worth stating plainly.** T002 asked for a scroll frame-rate
baseline to be captured _before_ the styling landed. That never happened, and the styling has now
landed. SC-006 is a _regression_ criterion, so on this build it can no longer be measured as
specified. The options are to measure against a `git stash` of the pre-change tree, or to restate
SC-006 as an absolute frame-rate floor rather than a relative one. That is a judgement call for the
person who owns the criterion, not something to quietly redefine here.
