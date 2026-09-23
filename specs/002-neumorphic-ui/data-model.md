# Phase 1 Data Model: Neumorphic Visual Identity

**Feature**: `specs/002-neumorphic-ui` | **Date**: 2026-08-29

This feature persists nothing. Its "data model" is the in-memory model that turns device conditions
into a concrete surface style: a token set, a resolved appearance, and a small state machine per
interactive surface. Everything here is derived at render time and discarded.

---

## 1. Token set

The values every screen draws from (FR-001). Frozen constants — never mutated, only read.

### 1.1 Surface ramp

One ramp per theme. In neumorphism the canvas and the surface share a tone; depth comes entirely
from the two shadows, so `canvas` and `surface` are intentionally equal in the `full` profile.

| Token         | Light     | Dark      | Purpose                                           |
| ------------- | --------- | --------- | ------------------------------------------------- |
| `canvas`      | `#E3E8EF` | `#23272F` | Screen background                                 |
| `surface`     | `#E3E8EF` | `#23272F` | Raised and recessed element fill                  |
| `surfaceSunk` | `#DCE2EA` | `#1E222A` | Recessed fill where inset shadows are unavailable |
| `shadowLight` | `#FFFFFF` | `#2E343E` | The lit edge — measured 1.23:1 / 1.20:1 vs canvas |
| `shadowDark`  | `#B4BECD` | `#171A20` | The cast shadow — measured 1.52:1 / 1.16:1        |

The shadow tones are **decorative by definition** and are exempt from FR-009, which is why the
border tokens below exist. See research R-002.

### 1.2 Ink and border

| Token           | Light     | Dark      | Measured vs canvas | Floor           |
| --------------- | --------- | --------- | ------------------ | --------------- |
| `textPrimary`   | `#151A21` | `#EDF0F5` | 14.19 / 13.11      | 4.5 (FR-008)    |
| `textSecondary` | `#4C5666` | `#A3ADBC` | 6.03 / 6.60        | 4.5 (FR-008)    |
| `border`        | `#79838F` | `#6B7482` | 3.13 / 3.17        | 3.0 (FR-009)    |
| `borderStrong`  | `#6F7885` | `#727B89` | 3.63 / 3.50        | 3.0, AAA margin |
| `accent`        | `#2456C7` | `#7FA8FF` | 5.28 / 6.38        | 4.5             |
| `danger`        | `#B3261E` | `#FF897D` | 5.31 / 6.51        | 4.5             |

All ratios above were measured, not estimated. `border` is the minimum passing tone; `borderStrong`
carries margin and is what the `reduced` profile and increased-contrast mode use.

### 1.3 Geometry

| Token            | Value                                | Note                                      |
| ---------------- | ------------------------------------ | ----------------------------------------- |
| `radius`         | `sm 8`, `md 16`, `lg 24`, `pill 999` | Uniform corner softness (FR-001)          |
| `depth`          | `1`, `2`, `3`                        | Exactly three levels (FR-006)             |
| `lightSource`    | `top-left`, fixed                    | One direction product-wide (FR-005)       |
| `borderHairline` | `StyleSheet.hairlineWidth`           | Compliance border on interactive surfaces |
| `spacing`        | reused from existing `Spacing`       | Unchanged — 2/4/8/16/24/32/64             |

### 1.4 Shadow geometry per depth

Offsets follow the fixed light source. Both shadows share a magnitude; only sign and colour differ.

| Depth | offset | blur | Raised                        | Recessed                      |
| ----- | ------ | ---- | ----------------------------- | ----------------------------- |
| 1     | 2      | 4    | light at −x/−y, dark at +x/+y | same pair, both `inset: true` |
| 2     | 4      | 8    | "                             | "                             |
| 3     | 6      | 12   | "                             | "                             |

> **Unverified**: the documented sign convention for `offsetY` contradicts the CSS convention
> (research R-008.1). The signs above assume CSS behaviour and **must be confirmed on device before
> the tokens are frozen** — an inverted sign turns every raised surface into a recessed one.

---

## 2. AppearanceContext

Resolved once per appearance change and shared down the tree. All fields are derived; none are
stored.

| Field                     | Type                            | Source                                                                 |
| ------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| `theme`                   | `'light' \| 'dark'`             | `useColorScheme()`; `unspecified` → `light`                            |
| `prefersMoreContrast`     | `boolean`                       | iOS `isDarkerSystemColorsEnabled`, Android `isHighTextContrastEnabled` |
| `prefersLessMotion`       | `boolean`                       | `isReduceMotionEnabled` (both platforms)                               |
| `prefersLessTransparency` | `boolean`                       | iOS `isReduceTransparencyEnabled`; Android always `false`              |
| `fontScale`               | `number`                        | `useWindowDimensions().fontScale`                                      |
| `elevationProfile`        | `'full' \| 'reduced' \| 'flat'` | Derived — see §3                                                       |
| `tokens`                  | resolved token set              | Derived from `theme` + `prefersMoreContrast`                           |

**Invariants**

- Every field updates live. Each source exposes a change event, so Acceptance Scenario 3.2
  (switching appearance with the app open) is satisfied by subscription, not by relaunch.
- `prefersLessTransparency` is structurally `false` on Android because the platform has no such
  setting. This is a recorded platform fact, not an unimplemented feature (research R-003).
- Exactly one resolver produces this object. No component reads `AccessibilityInfo` directly.

---

## 3. ElevationProfile derivation

A pure function of platform, OS version, and contrast preference. Deterministic and unit-testable
without a device.

```
if (prefersMoreContrast)                  -> 'reduced'
else if (iOS)                             -> 'full'
else if (Android API >= 29)               -> 'full'      // inset available
else if (Android API === 28)              -> 'reduced'   // outset only
else                                      -> 'flat'      // no boxShadow
```

| Profile   | Raised               | Recessed                     | Border on interactive |
| --------- | -------------------- | ---------------------------- | --------------------- |
| `full`    | two composed shadows | two composed `inset` shadows | hairline `border`     |
| `reduced` | one outset shadow    | `surfaceSunk` fill, no inset | `borderStrong`        |
| `flat`    | none                 | `surfaceSunk` fill           | `borderStrong`        |

Web resolves to `flat` until R-008.2 confirms otherwise.

---

## 4. SurfaceTreatment

The named presentations any element may be assigned (FR-002, FR-007).

| Treatment  | Depth | Shadow          | Interactive | Notes                                           |
| ---------- | ----- | --------------- | ----------- | ----------------------------------------------- |
| `raised`   | 1–3   | outset pair     | optional    | Cards, buttons, headers                         |
| `recessed` | 1–2   | inset pair      | optional    | Inputs, progress tracks, wells                  |
| `flat`     | 0     | none            | optional    | Dense list rows, backgrounds                    |
| `pressed`  | 1     | inset pair      | yes         | Transient — held touch only                     |
| `busy`     | 1     | outset, dimmed  | no          | Operation in flight; ignores input              |
| `disabled` | 0     | none            | no          | Flat and inert; announced unavailable           |
| `pending`  | 1     | outset + accent | inherits    | FR-007 — recorded locally, not yet synchronised |

**Invariants**

- `pending` is orthogonal to the others: it composes with `raised` or `flat` rather than replacing
  them, because a record can be both a normal card and unsynchronised.
- `busy` and `disabled` both suppress input, but only `disabled` is announced as unavailable;
  `busy` is announced as in-progress (FR-019, FR-020).
- No treatment conveys its state by colour alone (FR-010): `pressed` changes depth direction,
  `disabled` removes depth, `busy` adds a progress indicator, `pending` adds an icon.

---

## 5. Interactive surface state machine

```
        ┌──────────────────────────────── release ─────────────────────────────┐
        ▼                                                                      │
     resting ──── touch down ───▶ pressed ──── release ───▶ resting            │
        │                            │                                         │
        │                            └── action starts ──▶ busy ── resolves ───┘
        │
        ├── becomes unavailable ──▶ disabled ── becomes available ──▶ resting
```

**Transition rules**

| Rule                                                                                  | Requirement |
| ------------------------------------------------------------------------------------- | ----------- |
| `resting → pressed` renders within 100 ms of touch down                               | SC-005      |
| `pressed` persists for the entire duration the touch is held                          | FR-018      |
| Transitions are **discrete token swaps**, never interpolated                          | R-004       |
| `busy` and `disabled` reject touch input entirely                                     | FR-019/020  |
| `disabled` and `busy` are unreachable from each other without passing through resting | —           |

Because transitions are discrete, reduced motion (FR-015) requires no branch: there is no animation
to suppress.

---

## 6. Relationship to persisted data

None. Explicitly recorded so a future reviewer does not go looking:

- No table, column, migration, or query is added or altered.
- No visibility flag is introduced, and none is read (Principle I).
- The `pending` treatment **reflects** synchronisation state owned by the existing offline layer; it
  does not compute, store, or influence it (Principle II).
