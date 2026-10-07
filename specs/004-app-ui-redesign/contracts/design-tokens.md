# Contract: Design Tokens & Appearance Resolution (Atlas)

**Feature**: `specs/004-app-ui-redesign` | **Consumers**: every screen and component in
`apps/mobile/src/` | **Supersedes**: `specs/002-neumorphic-ui/contracts/design-tokens.md` C1, C3, C4,
C5 and C6 (C2, the pure contrast function, is kept and extended).

This is the contract between the token layer (`apps/mobile/src/theme/`,
`apps/mobile/src/constants/theme.ts`) and everything that renders.

---

## C4-1. The token layer is the only source of visual values

**Guarantee**: every colour, text style, corner radius, spacing step and motion timing used anywhere in
`apps/mobile/src/` originates from an exported token. Colours are authored once, in
`src/theme/palette.ts` (hex, per theme).

**Obligation on consumers** (FR-036): no literal colour, no ad-hoc radius, no inline shadow. A genuinely
new need is added to the palette (or to the type, radius or motion tables), not applied locally.

**Enforcement**:

- ESLint rejects hex, `rgb(a)` and `hsl(a)` string literals in `src/app/**` and `src/components/**`
  (the existing rule, tests exempt).
- ESLint rejects arbitrary-value colour classes (`bg-[#…]`, `text-[rgb(…)]`, `border-[hsl(…)]`, and the
  same inside template literals) in the same folders.
- ESLint rejects `import … from 'heroui-native'` outside `src/components/ui/**` and tests
  (`contracts/components.md` C4-6).
- Code review. A one-off value is a contract breach, not a style preference.

---

## C4-2. `contrastRatio(a, b)` and `blend(fg, bg, alpha)` — pure

```ts
export function relativeLuminance(hex: string): number; // unchanged
export function contrastRatio(a: string, b: string): number; // unchanged
export function blend(foreground: string, background: string, alpha: number): string; // new
```

**Guarantees**

- `relativeLuminance` and `contrastRatio` keep the exact WCAG 2.x formula (sRGB linearisation threshold
  `0.04045`), symmetry and the range `[1, 21]`.
- `blend` composites `foreground` at `alpha` (0 to 1) over an opaque `background` in sRGB and returns an
  uppercase `#RRGGBB`. It is what lets the gate measure the soft chips and hover states the kit derives
  with `color-mix(in oklab, …)`; rounding differences from the kit's OKLAB mix are bounded by a 0.1
  tolerance stated in the gate and verified once against measured screenshots (T405).
- Pure: same inputs, same output; no device, platform or I/O.

**Why it ships in `src/` rather than a test helper**: it is what makes SC-002 a standing build gate rather
than a manual audit (Constitution IV applied to the palette itself).

---

## C4-3. The contrast gate

**Guarantee**: the test suite fails if any listed pair falls below its floor, in each of the four themes
(`light`, `dark`, `light-contrast`, `dark-contrast`).

| Pair class                                                                                                    | Floor   | Requirement |
| ------------------------------------------------------------------------------------------------------------- | ------- | ----------- |
| ink and muted text on canvas, surface, surface-secondary                                                      | **4.5** | FR-023      |
| placeholder text on field fill                                                                                | **4.5** | FR-023      |
| accent, danger, success, warning, past, planning ink text on canvas and surface                               | **4.5** | FR-023      |
| the same text on its **15% soft blend** over canvas and over surface                                          | **4.5** | FR-023      |
| accent ink on accent (filled button label); danger ink on danger                                              | **4.5** | FR-023      |
| text on the kit's derived hover and pressed fills (`blend` of ink or ink-on-accent at 4% or 10%)              | **4.5** | FR-023      |
| large text (largest title, display numerals) on its surface                                                   | **3.0** | FR-023      |
| field border on canvas, surface and field fill                                                                | **3.0** | FR-024      |
| filled control (accent) on canvas and surface                                                                 | **3.0** | FR-024      |
| tappable-row cue (chevron, `muted`) on surface                                                                | **3.0** | FR-024      |
| focus ring on canvas, surface and field fill; drawn with a 2 dp offset gap so it never touches an accent fill | **3.0** | FR-024      |
| every text pair above, in `light-contrast` and `dark-contrast`                                                | **7.0** | FR-027      |

**Explicitly exempt** (decorative, carry no state or affordance, so WCAG 1.4.11 does not apply):
`separator`, `backdrop`, and the shadow tones. The exemption is an **enumerated allowlist in code**, never
a skipped assertion, so a token cannot be added silently.

**The focus ring is gated on neutrals only.** The ring is drawn `FocusRing.offset` (2 dp) outside the
control, with the surrounding neutral showing in the gap, like the kit's ring offset. It therefore only
touches canvas, surface or field fill, and the gate measures it against those. It is not measured against
an accent fill, because a ring cannot clear 3:1 on a pale canvas and a mid-tone accent at once (it would
need the accent 9:1 or more from the canvas). The offset is a named constant (`FocusRing = { width: 2,
offset: 2 }` in `src/theme/shape.ts`), and the gate asserts that it stays at 2 dp or more, so the exemption
cannot become a hole. An adapter MUST draw the ring with the offset.

**Soft chips are gated at 15%, not 20%.** The kit mixes a soft chip at 15% and its hover at **20%**. Hover
is not reachable on touch devices, so the gate measures the 15% blend only. A 20% soft fill is NOT
guaranteed to carry readable text (light-theme danger text on a 20% chip over canvas is about 4.2:1), so an
adapter MUST NOT use a 20% soft fill for text that has to be read (`contracts/components.md`, review rule
5).

**Obligation**: a new token pair is added to the gate in the same change that introduces it. The gate is
exhaustive over the palette: a key that is neither classified nor allowlisted fails the suite.

**Not covered here**: map connections over imagery keep their own gate
(`test/theme/globe-contrast-gate.test.ts`, measured against the casing), unchanged.

---

## C4-4. `useAppearance(): AppearanceContext` and theme resolution

```ts
type PaletteName = 'light' | 'dark' | 'light-contrast' | 'dark-contrast';

interface AppearanceContext {
  theme: 'light' | 'dark'; // the device scheme
  themeName: PaletteName; // theme + increased contrast
  prefersMoreContrast: boolean;
  prefersLessMotion: boolean;
  prefersLessTransparency: boolean; // structurally false on Android
  fontScale: number;
  tokens: Palette; // the resolved palette for themeName
}
```

The four-theme type is `PaletteName`. `surfaces.ts` still exports an older two-value `ThemeName`
(`'light' | 'dark'`) for the neumorphic primitives; it goes away in phase 7 (research D4-12).

**Guarantees** (inherited from 002 C4)

- Single source: no component subscribes to `AccessibilityInfo` or `useColorScheme` directly.
- Live: every field re-resolves on its platform change event, and consumers re-render (FR-031).
- Per-platform mapping stays in `src/theme/accessibility.ts` and nowhere else.
- Never throws; an unavailable query falls back to the **more** accessible value.

**New in this contract**

- `themeName` is `light-contrast` or `dark-contrast` when `prefersMoreContrast` is true, otherwise equal
  to `theme`. The root layout calls `Uniwind.setTheme(themeName)` from an effect; nothing else sets the
  kit's theme.
- `elevationProfile` is **removed** (it existed only for neumorphic shadows). Until phase 7 it is forced
  to `flat` so the old primitives render without shadows.
- `prefersLessMotion` drives the kit provider's `animation` (`'disable-all'`) and `useHaptics()`.

**Obligation**: consumers treat every field as able to change at any time; reading once at mount is a
breach.

---

## C4-5. Generated theme stylesheet stays in sync

**Guarantee**: `src/theme/generated/theme.css` is a pure function of `palette.ts` and the variable map in
`scripts/build-theme-css.mjs`. It contains every kit variable for all four themes plus the app's own
`--status-*` and `--pending` variables, and nothing hand-written.

**Enforcement**

- `npm run theme:build -w apps/mobile` regenerates it.
- A Jest test regenerates the CSS in memory and fails when the committed file differs (a stale file is a
  failing build, not a silent drift).
- A second test fails when any theme lacks a variable another theme defines (the kit and Uniwind require
  identical variable sets).

---

## C4-6. Type, shape, motion (reference values)

| Role       | Face                       | Size / line | Weight | Notes                                  |
| ---------- | -------------------------- | ----------- | ------ | -------------------------------------- |
| largeTitle | display, bold              | 32 / 38     | 700    | trip title, screen hero, stats figures |
| title      | display, semibold          | 22 / 28     | 600    | header titles, sheet titles            |
| headline   | system                     | 17 / 24     | 600    | row titles, section headers            |
| body       | system                     | 16 / 24     | 400    | default text                           |
| callout    | system                     | 14 / 20     | 500    | secondary lines, chips                 |
| caption    | system                     | 12 / 16     | 500    | footnotes, captions                    |
| numeric    | display or system, tabular | per context | 600    | money, distance, counts, dates         |

- Radii: sm 8, md 12, lg 16, xl 24, pill; `borderCurve: 'continuous'` except capsules.
- Spacing: the existing 2 / 4 / 8 / 16 / 24 / 32 / 64 steps, plus 12 and 48 added to the table.
- Focus ring: `FocusRing = { width: 2, offset: 2 }` (dp), drawn outside the control (C4-3).
- Motion: press 100 ms or less; in-place transitions 200 ms or less; list entrance about 150 ms; transform
  and opacity only; no bounce or overshoot (FR-022).

---

## C4-7. Stability guarantees for downstream features

Later features (social, sharing, discovery) compose from these tokens and from the adapters in
`contracts/components.md`; a screen added later never introduces a new colour, radius or shadow. The
token names above are the stable public surface; the kit's variable names are an implementation detail
behind `theme.css` and may change with a kit upgrade without touching screens.

## Rationale for the palette (OKLCH, for the record)

Neutrals are tinted toward the product's warm paper (OKLCH hue about 85) and ink-navy (hue about 255) with
chroma 0.003 to 0.03; the accent is a cobalt at hue about 262 equal to the globe's active arc. Values are
stored as hex so `contrastRatio` and every existing test stay valid. Measured values and the planning-ink
correction are in [research.md D4-01](../research.md#d4-01--direction-atlas-a-content-first-travel-journal).
