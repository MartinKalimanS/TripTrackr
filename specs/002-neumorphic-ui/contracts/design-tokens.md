# Contract: Design Tokens & Appearance Resolution

**Feature**: `specs/002-neumorphic-ui` | **Consumers**: every screen and component in `src/`

This is the contract between the token layer (`src/theme/`, `src/constants/theme.ts`) and everything
that renders. It is the interface this feature exposes to the rest of the product, including to the
screens feature 001 has yet to build.

---

## C1. The token layer is the only source of visual values

**Guarantee**: every colour, corner radius, shadow, border width, and spacing step used anywhere in
`src/` originates from an exported token.

**Obligation on consumers** (FR-028): no literal colour, no inline shadow, no ad-hoc radius. A
genuinely new need is added to the token set, not applied locally.

**Enforcement**: lint rule rejecting colour literals in `src/app/` and `src/components/`, plus code
review. A one-off value is a contract breach, not a style preference.

---

## C2. `contrast(a, b)` — pure WCAG ratio

```ts
export function relativeLuminance(hex: string): number;
export function contrastRatio(a: string, b: string): number;
```

**Guarantees**

- Implements the WCAG 2.x relative-luminance formula exactly, including the sRGB linearisation
  threshold at `0.04045`.
- Pure: same inputs, same output; no device, no platform, no I/O.
- Symmetric — `contrastRatio(a, b) === contrastRatio(b, a)`.
- Range `[1, 21]`.

**Why it is in the shipped source rather than a test helper**: it is what makes SC-002 a standing
build gate instead of a manual audit, and it is the mechanism by which Principle IV ("verify before
you render") applies to the palette itself.

---

## C3. The contrast gate

**Guarantee**: the test suite fails if any token pair falls below its floor, in either theme, in
every elevation profile.

| Pair class                                     | Floor    | Requirement |
| ---------------------------------------------- | -------- | ----------- |
| body text on its surface                       | **4.5**  | FR-008      |
| large text on its surface                      | **3.0**  | FR-008      |
| interactive border vs adjacent surface         | **3.0**  | FR-009      |
| focus indicator vs adjacent surface            | **3.0**  | FR-012      |
| accent and danger vs their surface             | **4.5**  | FR-008      |
| any text pair when `prefersMoreContrast`       | **7.0**  | FR-013      |

**Explicitly exempt**: `shadowLight` and `shadowDark`. They are decorative and carry no state or
affordance, so WCAG 1.4.11 does not apply. The exemption is enumerated in code as a named allowlist
— never as a skipped assertion — so that adding a token silently is impossible.

**Obligation**: a new token pair must be added to the gate in the same change that introduces it.
The gate is exhaustive over the token set, so an unclassified pair fails rather than passing
unnoticed.

---

## C4. `useAppearance(): AppearanceContext`

```ts
type ElevationProfile = 'full' | 'reduced' | 'flat';

interface AppearanceContext {
  theme: 'light' | 'dark';
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean;   // structurally false on Android
  fontScale: number;
  elevationProfile: ElevationProfile;
  tokens: ResolvedTokens;
}
```

**Guarantees**

- Single source. No component subscribes to `AccessibilityInfo` or `useColorScheme` directly.
- Live. Every field re-resolves on its platform change event; consumers re-render (FR-023).
- Per-platform mapping is handled here and nowhere else: `prefersMoreContrast` reads
  `isDarkerSystemColorsEnabled` on iOS and `isHighTextContrastEnabled` on Android.
- Never throws. If a platform query is unavailable, the field falls back to the value that produces
  the **more** accessible rendering, never the less.

**Obligation**: consumers treat every field as capable of changing at any time. Reading once at
mount is a breach.

---

## C5. `resolveElevationProfile(platform, apiLevel, prefersMoreContrast)`

**Guarantees**

- Pure and total — defined for every input, including unknown platforms (which resolve to `flat`).
- Deterministic, so it is fully unit-testable without a device.
- Monotonic in capability: a lower Android API level never yields a richer profile.

**Contract with the surface layer**: the profile changes *how* a treatment renders, never *which*
treatment a component asked for. A component requests `recessed`; the profile decides whether that
is an inset shadow pair or a `surfaceSunk` fill. Call sites never branch on profile.

---

## C6. `surfaceStyle(treatment, state, ctx): ViewStyle`

**Guarantees**

- Returns a plain style object. No side effects, no mutation of the token set.
- Every returned style satisfies C3 for the tokens it references.
- Interactive treatments always include a compliant border; static treatments never do
  (research R-002).
- The light source is fixed `top-left` in every returned style (FR-005). A style with inconsistent
  lighting is a defect, not a variant.
- Depth is one of exactly three levels (FR-006).

---

## C7. Stability guarantees for downstream features

Feature 001's screens will be built against this contract. The following are load-bearing and will
not change without a corresponding spec amendment:

1. Token **names** are stable; token **values** may be retuned provided the C3 gate still passes.
2. `SurfaceTreatment` is a closed union. Adding a member is a minor change; removing or repurposing
   one is breaking.
3. `pending` composes with other treatments rather than replacing them (FR-007).
4. Applying a treatment never alters accessibility semantics — role, label, state, or reading order
   (FR-017). A primitive that changes what a screen reader announces has broken this contract.
