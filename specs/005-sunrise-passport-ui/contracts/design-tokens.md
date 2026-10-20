# Contract: Design Tokens & Appearance Resolution (Sunrise Passport)

**Feature**: `specs/005-sunrise-passport-ui` | **Consumers**: every screen and component in
`apps/mobile/src/` | **Supersedes**: `specs/004-app-ui-redesign/contracts/design-tokens.md` C4-3 (the pair
list, extended here) and C4-6 (type, shape, motion). **Inherits unchanged**: C4-2 (`contrastRatio`, `blend`),
C4-4 (`useAppearance`, the one shared accessibility store, `ready`) and C4-5's pipeline (palette data, build
script, generated `theme.css`, sync tests).

This is the contract between the token layer (`apps/mobile/src/theme/`, `apps/mobile/src/constants/theme.ts`)
and everything that renders. Values below are **measured** with the WCAG 2.x formula of
`apps/mobile/src/theme/contrast.ts` (sRGB linearisation threshold `0.04045`) on 2026-10-12, starting from the
prototype's `tokens.css`. They are starting values: the gate finalises them, and **a failing pair retunes the
token, never the floor**.

---

## C5-1. The token layer is the only source of visual values

**Guarantee**: every colour, text style, radius, spacing step, lift, gradient stop and timing used anywhere in
`apps/mobile/src/` originates from an exported token. Colours are authored once, in
`src/theme/palette.data.js` (hex per theme; `#RRGGBBAA` for tints, scrims and alpha lines).

**Obligation on consumers** (FR-009): no literal colour, no ad-hoc radius, no inline shadow, no gradient stop
outside `components/ui/scrim.tsx`.

**Enforcement**: the ESLint rules of 004 C4-1 (literal colours, arbitrary-value colour classes, kit imports)
stay; this feature adds (a) a rule rejecting gradient strings (`linear-gradient(`, `radial-gradient(`) outside
`src/theme/` and `components/ui/scrim.tsx`, and (b) a Jest source search that fails on any Atlas palette value
(the 004 hex literals, listed in `test/theme/atlas-values.ts`) anywhere in `src/` once Phase 10 is done
(SC-001; the test is written first and is red until then).

---

## C5-2. `contrastRatio(a, b)` and `blend(fg, bg, alpha)` — pure, unchanged

Exactly the functions of 004 C4-2 (WCAG 2.x, symmetric, range 1 to 21; `blend` composites a foreground at an alpha
over an opaque background and returns an upper-case `#RRGGBB`). This feature uses `blend` for tints, scrims and
alpha lines over a ground, including a pure white photograph.

---

## C5-3. The four palettes (replaces 004 C4-3's values)

One column per theme; keys are `data-model.md` §1. `onPhoto` is `#FFFFFF` everywhere.

| Key                     | `light` (Sunrise)     | `dark` (Nightfall) | `light-contrast`      | `dark-contrast`       |
| ----------------------- | --------------------- | ------------------ | --------------------- | --------------------- |
| `canvas`                | `#FFFFFF`             | `#0A1626`          | `#FFFFFF`             | `#0A1626`             |
| `surface` (= `overlay`) | `#FFFFFF`             | `#0F2037`          | `#FFFFFF`             | `#0F2037`             |
| `surfaceSecondary`      | `#FFF1E3`             | `#182E4A`          | `#FFF1E3`             | `#182E4A`             |
| `sand`                  | `#EBDCC9`             | `#2B4466`          | `#D9C3A6`             | `#4A6688`             |
| `pressed`               | `#EBDCC9`             | `#2B4466`          | `#D9C3A6`             | `#2B4466`             |
| `hairline`              | `#0E2A471F`           | `#FFFFFF24`        | `#06162980`           | `#FFFFFF66`           |
| `grab`                  | `#0E2A4785`           | `#FFFFFF66`        | `#061629B3`           | `#FFFFFFB3`           |
| `border`                | `#6B7D93`             | `#7A90AB`          | `#3D4F63`             | `#B8C5D6`             |
| `focus`                 | `#D93A2E`             | `#FFB4A0`          | `#061629`             | `#FFFFFF`             |
| `backdrop`              | `#081A3057`           | `#081A3057`        | `#081A3057`           | `#081A3057`           |
| `ink`                   | `#0E2A47`             | `#F4F7FB`          | `#061629`             | `#FFFFFF`             |
| `muted`                 | `#4A5B6E`             | `#A4B3C4`          | `#2B3B4F`             | `#D3DCE8`             |
| `subtle`                | `#566779`             | `#93A5BA`          | `#3D4F63`             | `#B8C5D6`             |
| `onInk`                 | `#FFFFFF`             | `#0A1626`          | `#FFFFFF`             | `#0A1626`             |
| `accent`                | `#FF6B4A`             | `#FF8266`          | `#FF8466`             | `#FF9A82`             |
| `accentInk`             | `#0E2A47`             | `#0A1626`          | `#061629`             | `#0A1626`             |
| `accentPress`           | `#FF8466`             | `#FF9A80`          | `#FF9A80`             | `#FFB09C`             |
| `accentLine`            | `#E04A33`             | `#FF8266`          | `#A82618`             | `#FFA690`             |
| `accentText`            | `#B92A1D`             | `#FFA08C`          | `#821A10`             | `#FFC4B4`             |
| `accentTint`            | `#FFE9E1`             | `#FF826629`        | `#FFE9E1`             | `#FF826629`           |
| `aqua`                  | `#35C9D6`             | `#35C9D6`          | `#35C9D6`             | `#35C9D6`             |
| `aquaLine`              | `#1A8FA0`             | `#46D5E0`          | `#08606B`             | `#5FDCE6`             |
| `aquaInk`               | `#0B6F7C`             | `#5FDCE6`          | `#064F59`             | `#8EE8EF`             |
| `aquaTint`              | `#DDF6F8`             | `#46D5E024`        | `#DDF6F8`             | `#46D5E024`           |
| `amber`                 | `#FFB547`             | `#FFC25E`          | `#FFB547`             | `#FFC25E`             |
| `amberLine`             | `#B86E00`             | `#FFC25E`          | `#7A4800`             | `#FFD27F`             |
| `amberInk`              | `#8A5200`             | `#FFC25E`          | `#6E4200`             | `#FFDC99`             |
| `amberTint`             | `#FFF0D1`             | `#FFC25E29`        | `#FFF0D1`             | `#FFC25E29`           |
| `danger`                | `#9F1239`             | `#FF8FA8`          | `#7F0F2B`             | `#FFC6D3`             |
| `dangerInk`             | `#FFFFFF`             | `#0A1626`          | `#FFFFFF`             | `#0A1626`             |
| `dangerTint`            | `#FDE8EE`             | `#FF8FA824`        | `#FDE8EE`             | `#FF8FA824`           |
| `success`               | `#0D6B4C`             | `#55DDA8`          | `#0A5A3F`             | `#94EDC8`             |
| `successTint`           | `#DDF4E8`             | `#55DDA824`        | `#DDF4E8`             | `#55DDA824`           |
| `scrimButton`           | `#09182B80`           | `#09182B8F`        | `#061222A8`           | `#09182B8F`           |
| `scrimButtonLine`       | `#FFFFFF42`           | `#FFFFFF42`        | `#FFFFFF8C`           | `#FFFFFF42`           |
| `ring`                  | `#FFFFFF`             | `#F4F7FB`          | `#FFFFFF`             | `#F4F7FB`             |
| `skeleton`              | `#F3E8DA`             | `#1F3756`          | `#F3E8DA`             | `#1F3756`             |
| `skeletonHighlight`     | `#FFB54729`           | `#FFC25E1A`        | `#FFB54729`           | `#FFC25E1A`           |
| `toastSurface`          | `#0E2A47`             | `#20395A`          | `#0E2A47`             | `#0A1626`             |
| `toastInk`              | `#FFFFFF`             | `#F4F7FB`          | `#FFFFFF`             | `#FFFFFF`             |
| `stampCoral`            | `#B92A1D`             | `#FF9A86`          | `#B92A1D`             | `#FF9A86`             |
| `stampNavy`             | `#1D3F73`             | `#8FB4E8`          | `#1D3F73`             | `#8FB4E8`             |
| `stampTeal`             | `#0B7280`             | `#5FDCE6`          | `#0B7280`             | `#5FDCE6`             |
| `stampGreen`            | `#2A7250`             | `#7DE8BC`          | `#2A7250`             | `#7DE8BC`             |
| `cover1Start` / `End`   | `#0E2A47` / `#0F4C5C` | same               | same                  | same                  |
| `cover2Start` / `End`   | `#8E2417` / `#C0471F` | same               | `#8E2417` / `#8E2417` | `#8E2417` / `#8E2417` |
| `cover3Start` / `End`   | `#0B6F7C` / `#0E2A47` | same               | `#08606B` / `#0E2A47` | `#08606B` / `#0E2A47` |

Aliases (no separate value): `link` = `ink`; `placeholder` = `subtle`; `overlay` = `surface`; `statusActive` =
`accentLine`; `statusPlanning` = `amberLine`; `statusPlanningInk` = `amberInk`; `statusPast` = `muted`;
`pending` = `amberInk`. The alpha values are the prototype's rounded to a byte (for example .12 to `1F`,
.52 to `85`); the prototype's `scrim-btn` is .46 and is **raised to .50** (`80`) by finding M-5.
`#0A1626` in `dark-contrast` toast and the two contrast cover changes are the only values that differ from
`tokens.css`: they exist because white on `#C0471F` is 5.05:1 and on `#0B6F7C` is 5.87:1, below the 7:1 floor of
the contrast themes (white on `#8E2417` is 8.70:1, on `#08606B` is 7.25:1).

As built, five more values differ from the table you read here and are recorded with their measured ratios under
"As built (T513, T514)" after C5-4: `dark-contrast` `danger`, `success` and `amberInk`, `light-contrast`
`accentText`, and the dark globe `active` start. The cells above already carry the retuned values.

### Measured contrast (representative; the gate measures all of C5-4)

All figures are ratios. "Floor" is 4.5 (text), 3.0 (graphic), and 7.0 for text in the contrast themes.

| Pair                                                | `light`           | `dark`            | `light-contrast` | `dark-contrast` |
| --------------------------------------------------- | ----------------- | ----------------- | ---------------- | --------------- |
| `ink` on `surface`                                  | 14.57             | 15.24             | 18.19            | 16.38           |
| `ink` on `surfaceSecondary`                         | 13.15             | 12.79             | 16.41            | 13.74           |
| `muted` on `surface`                                | 6.97              | 7.66              | 11.41            | 11.83           |
| `muted` on `surfaceSecondary`                       | 6.29              | 6.43              | 10.29            | 9.93            |
| `subtle` on `surface`                               | 5.81              | 6.50              | 8.41             | 9.36            |
| `subtle` on `surfaceSecondary` (lowest text)        | 5.24              | 5.45              | 7.59             | 7.85            |
| `accentText` on `surface`                           | 6.16              | 8.31              | 9.98             | 10.77           |
| `accentText` on `accentTint`                        | 5.27              | 6.48              | 8.55             | 8.39            |
| `aquaInk` on `aquaTint`                             | 5.20              | 7.42              | 8.20             | 8.61            |
| `danger` on `dangerTint`                            | 6.85              | 5.93              | 8.95             | 8.68            |
| `success` on `successTint`                          | 5.64              | 7.08              | 7.14             | 8.65            |
| `amberInk` on `amberTint`                           | 5.67              | 7.20              | 7.63             | 8.72            |
| `accentInk` on `accent` (primary label)             | 5.17              | 7.47              | 7.57             | 8.82            |
| `accentInk` on `accentPress` (pressed label)        | 6.07              | 8.81              | 8.82             | 10.33           |
| `onInk` on `ink`                                    | 14.57             | 16.91             | 18.19            | 18.17           |
| `ink` on `pressed`                                  | 10.84             | 9.21              | 10.66            | 9.90            |
| `accentLine` on `surface` (edge ring, nodes)        | 4.04              | 6.74              | 7.11             | 8.66            |
| `aquaLine` on `surface`                             | 3.83              | 9.25              | 7.25             | 10.04           |
| `amberLine` on `surface`                            | 3.99              | 10.24             | 7.62             | 11.53           |
| `border` on `surface`                               | 4.22              | 5.00              | 8.41             | 9.36            |
| `border` on `surfaceSecondary`                      | 3.80              | 4.19              | 7.59             | 7.85            |
| `focus` on `surface`                                | 4.57              | 9.58              | 18.19            | 16.38           |
| `focus` on `surfaceSecondary`                       | 4.12              | 8.04              | 16.41            | 13.74           |
| `grab` on `surface`                                 | 3.26              | 3.71              | 6.81             | 8.58            |
| `hairline` on `surface` (explicit only in contrast) | 1.26 (decorative) | 1.53 (decorative) | 3.45             | 3.71            |
| `accent` (fill) on `surface`                        | **2.82**          | 6.74              | **2.40**         | 7.95            |

**The two bold cells are the measured findings (D5-22, M-1).** A coral button on white is 2.82:1 (light) and
2.40:1 (light contrast), below 3:1 for a filled control's edge (FR-069). The control is identified by its label
(5.17:1 and 7.57:1 on the fill) and its pill shape, and it carries an **edge ring** in `accentLine` (4.04:1 and
7.11:1 on `surface`), drawn inside the fill's edge (1.5 dp; 2 dp in the contrast themes). The dark themes
need no ring (6.74 and 7.95).

---

## C5-4. The contrast gate (extends 004 C4-3; every pair listed)

**Guarantee**: the suite fails if any listed pair falls below its floor, in each of the four themes. The
exemption list is an **enumerated allowlist in code**, never a skipped assertion; the gate is exhaustive over the
palette (a key that is neither classified nor allowlisted fails).

| #   | Pair class                                                                                                                                                                         | Floor                                          | Requirement    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------- |
| P1  | `ink`, `muted`, `subtle` on `canvas`, `surface`, `surfaceSecondary`                                                                                                                | 4.5 (7.0 in contrast)                          | FR-068, FR-072 |
| P2  | `placeholder` on `surfaceSecondary` (the field fill)                                                                                                                               | 4.5 (7.0)                                      | FR-068         |
| P3  | `accentText`, `aquaInk`, `danger`, `success`, `amberInk`, `pending` on `surface` and `surfaceSecondary`                                                                            | 4.5 (7.0)                                      | FR-068         |
| P4  | each of those on its own tint (`accentTint`, `aquaTint`, `dangerTint`, `successTint`, `amberTint`) blended over `surface` AND over `surfaceSecondary`                              | 4.5 (7.0)                                      | FR-068         |
| P5  | `accentInk` on `accent` and on `accentPress`; `dangerInk` on `danger`; `onInk` on `ink`                                                                                            | 4.5 (7.0)                                      | FR-068         |
| P6  | `ink` on `pressed` (the only text allowed on a pressed fill)                                                                                                                       | 4.5 (7.0)                                      | FR-063, FR-068 |
| P7  | `toastInk` on `toastSurface`; `accentPress` (the toast action) on `toastSurface`                                                                                                   | 4.5 (7.0)                                      | FR-067, FR-068 |
| P8  | `onPhoto` on the caption scrim blended over a **pure white photograph** at every alpha stop that sits under text (`.66` and `.88`; ramp alpha under a text line is at least `.64`) | 4.5 (7.0 with the contrast scrim `.78`, `.94`) | FR-007, FR-068 |
| P9  | `onPhoto` on each `cover*Start` and `cover*End` stop                                                                                                                               | 4.5 (7.0)                                      | FR-008, FR-068 |
| P10 | `onPhoto` on the passport card's gradient stops (`#0E2A47`, `#0F4C5C`); its secondary white at alpha .78 base, 1.0 in contrast                                                     | 4.5 (7.0)                                      | FR-068         |
| P11 | `onPhoto` icon on `scrimButton` blended over a white photograph (graphic)                                                                                                          | 3.0                                            | FR-007, FR-069 |
| P12 | `border` on `canvas`, `surface`, `surfaceSecondary`                                                                                                                                | 3.0                                            | FR-069         |
| P13 | `focus` on `canvas`, `surface`, `surfaceSecondary`, drawn 2.5 dp wide with a 2 dp offset gap                                                                                       | 3.0                                            | FR-069, FR-071 |
| P14 | `accentLine`, `aquaLine`, `amberLine` on `surface` and `surfaceSecondary` (edge ring, nodes, bars, dashes, dots)                                                                   | 3.0                                            | FR-069         |
| P15 | **the primary control's edge**: `accentLine` on `surface`; and the accent fill listed in `FILL_BELOW_FLOOR` (below)                                                                | 3.0                                            | FR-069         |
| P16 | `grab` on `surface`                                                                                                                                                                | 3.0                                            | FR-069         |
| P17 | tappable-row cue (`muted`) on `surface`                                                                                                                                            | 3.0                                            | FR-069         |
| P18 | `ink` (a selected fill: chip, segment, day) on `surface`                                                                                                                           | 3.0                                            | FR-069         |
| P19 | `hairline` on `surface` and `surfaceSecondary` **in the two contrast themes only** (an explicit boundary)                                                                          | 3.0                                            | FR-072         |
| P20 | `stampCoral`, `stampNavy`, `stampTeal`, `stampGreen` on `surfaceSecondary` (graphic, decorative)                                                                                   | 3.0                                            | FR-069         |
| P21 | Alias equalities: `statusActive` = `accentLine`, `statusPlanning` = `amberLine`, `statusPast` = `muted` (asserted), so a status reads the same on a card and on the globe          | equality                                       | FR-002         |
| P22 | globe pairs of C5-11 (arc stops against casing, keylines against land)                                                                                                             | 3.0                                            | FR-010, FR-068 |
| P23 | text over the sky: `ink`, `muted` on every sky stop; `accentText` on the sky only at display size                                                                                  | 4.5 / 3.0 large                                | FR-068         |

**Allowlist (decorative; no state or affordance)**: `hairline` in `light` and `dark`, `sand`, `backdrop`,
`skeleton`, `skeletonHighlight`, `aqua` and `amber` as fills, `ring`, the lifts, the sky gradient, the
ghost glyph of a generated cover.

**`FILL_BELOW_FLOOR`** (the one pinned exception, mirrored on 004's `PINNED_SOFT_CHIP_EXCEPTIONS`): the accent
fill against `surface` in `light` (2.82) and `light-contrast` (2.40). The gate verifies the exception: it fails
if either starts to pass (then the entry is deleted and the ring may go), or if the accent is not the pinned
value, or if the ring token (P15) is absent. Adapters never place the primary button on a ground other than
`canvas`, `surface`, `surfaceSecondary` or a photograph under a scrim.

**Pressed fills.** Only `ink` text sits on `pressed` (finding M-4: `subtle` on `sand` is 4.32:1 in `light` and
3.93:1 in `dark`, and `ink` on `sand` in `dark-contrast` is 5.92:1, which is why `pressed` is its own token with a
darker `dark-contrast` value, on which `onInk`-white is 9.90:1). An adapter MUST NOT put `muted` or `subtle`
text on a pressed fill.

**Soft chips** are gated at the prototype's fixed tints (a light tint is an opaque colour; a dark tint is the
16 or 14 percent alpha over the ground, measured over `surface` and over `surfaceSecondary`). There is no
derived hover state on touch devices, so the 004 rule against a 20 percent soft fill under text stands
(`contracts/components.md`, review rule 5).

**Obligation**: a new token pair is added to the gate in the same change that introduces it (004 C4-3).

**Not covered here**: `test/theme/globe-contrast-gate.test.ts` keeps its own gate and is extended by C5-11.

### As built (T513, T514)

The gate is `apps/mobile/test/theme/contrast-gate.test.ts`, with the pair builders in
`test/theme/palette-gate-support.ts` and the allowlists in `test/theme/gate-exemptions.ts`. It replaces
004's `palette-gate.test.ts`. Every class below is measured in each theme with its pair count pinned, so a class
cannot shrink silently; text classes are held to 4.5 (7.0 in the contrast themes) and graphic classes to 3.0.
P8 to P11 are measured over `WHITE_PHOTO` (a pure white photograph), P22 (the globe) in
`globe-contrast-gate.test.ts` as well, P21 (the eight aliases) as equalities. The scrim, sky and passport values
are data in `src/theme/scrim.ts`, the single source the gate and the `Scrim` adapter share.

**Where the gate is stricter than, or adds to, the table above**

- **P4** blends the dark alpha tints over `surface` and `surfaceSecondary` in sRGB with no tolerance (they are
  authored values, not kit mixes); the contract's "at least 4.99:1" held in the base themes but not at 7:1 in
  `dark-contrast`, which is the first retune below.
- **P5** also measures the kit's own foregrounds: `onInk` on `success` and on `amberInk` (the kit's
  `--success-foreground`, `--warning` and `--warning-foreground` read them, C5-6).
- **P8** measures every alpha that sits under text: the top scrim (.68, .80), the bottom stops from 55 percent
  (.66 and .88, .78 and .94) and the caption ramp (.64, .66, .88; contrast .78, .94).
- **P10** measures white on both passport stops, on their mid colour and on the amber glow at its peak over the mid
  colour (8.19:1; the glow does not reach the end stop, where it would be 6.86:1), and the secondary white (.78,
  opaque in contrast) on all four. Worst case 5.75:1 in the base themes, 8.19:1 in the contrast themes.
- **P11** measures the icon button disc against a white photograph; `scrimButtonLine` is allowlisted (the disc is
  the affordance and clears 3:1 on its own, 3.44:1 at worst).
- **P15** names three grounds for the pinned fill (`canvas`, `surface`, `surfaceSecondary`: 2.82, 2.82 and 2.54:1
  in `light`), and fails if any other accent-fill pair is under 3:1.
- **P23** holds the accent word on the sky at the large-text floor, which is 7:1 in the contrast themes (as 004
  held large text): that retuned `light-contrast` `accentText`. `DISPLAY_SIZE_ONLY` pins the one ground where it is
  under the text floor, the warmest glow of the light sky (4.46:1), and fails if it starts to pass or a second
  ground joins it.
- **Allowlist** (per theme, exact): `sand`, `backdrop`, `aqua`, `amber`, `ring`, `skeleton`, `skeletonHighlight`,
  `scrimButtonLine`, and `hairline` in `light` and `dark` only. The lifts, the sky gradient and the ghost glyph are
  not palette keys.

**Retuned by the gate** (a failing pair retunes the token, never the floor)

| Token                         | Contract start | As built  | Pair that failed                                                           | Measured, start to now    |
| ----------------------------- | -------------- | --------- | -------------------------------------------------------------------------- | ------------------------- |
| `dark-contrast` `danger`      | `#FFB3C4`      | `#FFC6D3` | P4: `danger` on `dangerTint` over `surfaceSecondary`                       | 6.38 to 7.29 (floor 7.0)  |
| `dark-contrast` `success`     | `#7DE8BC`      | `#94EDC8` | P4: `success` on `successTint` over `surfaceSecondary`                     | 6.72 to 7.23              |
| `dark-contrast` `amberInk`    | `#FFD27F`      | `#FFDC99` | P4: `amberInk` on `amberTint` over `surfaceSecondary` (`pending` is alias) | 6.77 to 7.31              |
| `light-contrast` `accentText` | `#8F1D12`      | `#821A10` | P23: `accentText` at display size on the warmest sky glow, floor 7:1       | 6.47 to 7.24              |
| `GlobeColors.dark.active`     | `#FFA08C`      | `#FF8266` | data-model invariant: `statusActive` equals the globe's active arc         | start stop = `accentLine` |

Worst case per pair class (ratio over its floor), all four themes: `light`, `dark`, `light-contrast`,
`dark-contrast`.

| Class | light                                      | dark                               | light-contrast                          | dark-contrast           |
| ----- | ------------------------------------------ | ---------------------------------- | --------------------------------------- | ----------------------- |
| P1    | 5.24 / 4.5 (`subtle` on cream)             | 5.45 / 4.5                         | 7.59 / 7                                | 7.85 / 7                |
| P2    | 5.24 / 4.5                                 | 5.45 / 4.5                         | 7.59 / 7                                | 7.85 / 7                |
| P3    | 5.29 / 4.5 (`aquaInk` on cream)            | 6.38 / 4.5 (`danger` on cream)     | 7.44 / 7 (`success` on cream)           | 9.03 / 7                |
| P4    | 5.20 / 4.5 (`aquaInk` on its tint)         | 4.98 / 4.5 (`danger` on its tint)  | 7.14 / 7 (`success`)                    | 7.05 / 7 (`accentText`) |
| P5    | 5.17 / 4.5 (`accentInk` on `accent`)       | 7.47 / 4.5                         | 7.57 / 7                                | 8.82 / 7                |
| P6    | 10.84 / 4.5                                | 9.21 / 4.5                         | 10.66 / 7                               | 9.90 / 7                |
| P7    | 6.07 / 4.5 (`accentPress` on toast)        | 5.68 / 4.5                         | 7.07 / 7                                | 10.33 / 7               |
| P8    | 5.33 / 4.5 (white at .64 over white)       | 5.33 / 4.5                         | 9.55 / 7 (.78)                          | 9.55 / 7                |
| P9    | 5.05 / 4.5 (`cover2End`)                   | 5.05 / 4.5                         | 7.25 / 7 (`cover3Start`)                | 7.25 / 7                |
| P10   | 5.75 / 4.5 (secondary at the glow peak)    | 5.75 / 4.5                         | 8.19 / 7                                | 8.19 / 7                |
| P11   | 3.44 / 3 (icon on the disc)                | 4.16 / 3                           | 6.09 / 3                                | 4.16 / 3                |
| P12   | 3.80 / 3 (`border` on cream)               | 4.19 / 3                           | 7.59 / 3                                | 7.85 / 3                |
| P13   | 4.12 / 3 (`focus` on cream)                | 8.04 / 3                           | 16.41 / 3                               | 13.74 / 3               |
| P14   | 3.46 / 3 (`aquaLine` on cream)             | 5.65 / 3                           | 6.41 / 3                                | 7.27 / 3                |
| P15   | 4.04 / 3 (ring; the fill is the exception) | 5.65 / 3                           | 7.11 / 3 (ring)                         | 6.67 / 3                |
| P16   | 3.27 / 3 (`grab`)                          | 3.71 / 3                           | 6.90 / 3                                | 8.64 / 3                |
| P17   | 6.97 / 3                                   | 7.66 / 3                           | 11.41 / 3                               | 11.83 / 3               |
| P18   | 14.57 / 3                                  | 15.24 / 3                          | 18.19 / 3                               | 16.38 / 3               |
| P19   | not measured (decorative)                  | not measured                       | 3.42 / 3 (hairline on cream)            | 3.50 / 3                |
| P20   | 5.07 / 3 (`stampTeal`)                     | 6.45 / 3 (`stampNavy`)             | 5.07 / 3                                | 6.45 / 3                |
| P22   | 3.32 / 3 (planned keyline on shaded land)  | 3.56 / 3 (visited keyline on land) | same as light                           | same as dark            |
| P23   | 5.06 / 4.5 (`muted` on the glow)           | 6.25 / 4.5                         | 7.24 / 7 (`accentText` at display size) | 8.78 / 7                |

---

## C5-5. `useAppearance(): AppearanceContext`

Unchanged from 004 C4-4: the four `PaletteName`s, `tokens: Palette`, the one shared subscription, the
`ready` first-read rule. `Colors[themeName]` keeps its keys; the new palette keys are read through
`useAppearance().tokens` and through the generated classes. The root layout's `Uniwind.setTheme('system' |
themeName)` rule (004 D4-05, "T412 decisions") is unchanged.

---

## C5-6. Generated theme stylesheet

`src/theme/generated/theme.css` stays a pure function of `palette.data.js` and the variable map in
`scripts/build-theme-css.mjs` (004 C4-5). Changes: (1) the map fills the kit's `--surface-tertiary` from
`pressed`, `--accent` from `accent`, `--accent-foreground` from `accentInk`, `--link` from `ink`,
`--field-border` from `border`, `--separator` from `hairline`, `--muted` from `muted`; (2) the app's own
variables are added for every new key (`--accent-line`, `--accent-text`, `--accent-tint`, `--aqua-*`,
`--amber-*`, `--sand`, `--grab`, `--on-photo`, `--scrim-button`, `--ring`, `--skeleton*`, `--toast-*`,
`--stamp-*`, `--cover-*`) in the `@theme inline static` block; (3) `--field-border-width: 1px` stays. The same
three tests (regenerate in memory, identical variable sets across themes, no unclassified variable) apply. A
variable that is a colour mapped from a palette key the gate does not measure or allowlist fails the suite.

---

## C5-7. Type roles

Faces: Bricolage Grotesque (display), DM Sans (body), Instrument Serif Italic (accent). Sizes 40, 36, 28, 22,
17, 16, 14, 13, 12; weights 400, 600, 700 only. Line heights exceed sizes at every scale. Tracking is
compensated for the `opsz` 14 statics (research D5-06; starting values, finalised in V1).

| Role       | Family and weight     | Size / line | Tracking (prototype, then starting) | Numerals     | Capped at 1.3             | Used for                                                       |
| ---------- | --------------------- | ----------- | ----------------------------------- | ------------ | ------------------------- | -------------------------------------------------------------- |
| `display`  | display 700           | 40 / 44     | −0.025 em, then −0.035 em           | proportional | no                        | Greeting, Welcome headline, iOS large titles (Android 28 / 32) |
| `numeral`  | display 700           | 36 / 40     | −0.030 em, then −0.040 em           | **tabular**  | **yes**                   | Home figures, passport figures, spending total                 |
| `title`    | display 700           | 28 / 32     | −0.020 em, then −0.030 em           | proportional | no                        | Trip hero title, You name, Android header titles               |
| `headline` | display 700           | 22 / 28     | −0.010 em, then −0.020 em           | proportional | no                        | Section titles, sheet titles, year headers                     |
| `callout`  | display 600           | 17 / 22     | 0                                   | proportional | FAB label, day chips only | Row titles, buttons, tag title                                 |
| `body`     | body 400 (600 strong) | 16 / 24     | 0                                   | proportional | no                        | Running text, field text                                       |
| `label`    | body 400 (600 bold)   | 14 / 20     | 0                                   | proportional | chips, pills only         | Secondary lines, links, chip text                              |
| `caption`  | body 600              | 13 / 18     | 0                                   | proportional | pills, stat labels only   | Meta, pills, chip counts                                       |
| `eyebrow`  | body 700, upper case  | 12 / 16     | +0.06 em                            | proportional | **yes**                   | Date above the greeting, country over a title, tab labels      |
| `accent`   | serif italic 400      | inherits    | 0                                   | n/a          | no                        | One word per screen (greeting name, one headline word)         |

**Caps (FR-074)**: `maxFontSizeMultiplier` 1.3 is set only on tab labels (12 / 14), pills and chips (13 and
14), `eyebrow`, `numeral`, the FAB label and the day chips. Everything else scales without a cap. Fixed heights
are minimums. At a font scale of 1.15 and above the reflow rules of `screens.md` apply (the prototype's
`data-bigtext` rules). A role added later is composed from this table. The `ThemedText` shim maps the 004 roles
until Phase 10. A test asserts every `tabularNumbers` role resolves to a Bricolage family.

**As built (T504): the family variables.** `src/global.css` holds six variables in `@theme static`, one per
embedded file, each also declared under `@variant ios` with the PostScript name (Android answers to the file
name). A text style picks its family from this table, never by a literal name:

| Variable               | Class                | Face and file               | Android family                      | iOS family                    |
| ---------------------- | -------------------- | --------------------------- | ----------------------------------- | ----------------------------- |
| `--font-display`       | `font-display`       | Bricolage Grotesque 600     | `BricolageGrotesque_600SemiBold`    | `BricolageGrotesque-SemiBold` |
| `--font-display-bold`  | `font-display-bold`  | Bricolage Grotesque 700     | `BricolageGrotesque_700Bold`        | `BricolageGrotesque-Bold`     |
| `--font-body`          | `font-body`          | DM Sans 400                 | `DMSans_400Regular`                 | `DMSans-Regular`              |
| `--font-body-semibold` | `font-body-semibold` | DM Sans 600                 | `DMSans_600SemiBold`                | `DMSans-SemiBold`             |
| `--font-body-bold`     | `font-body-bold`     | DM Sans 700                 | `DMSans_700Bold`                    | `DMSans-Bold`                 |
| `--font-serif`         | `font-serif`         | Instrument Serif Italic 400 | `InstrumentSerif_400Regular_Italic` | `InstrumentSerif-Italic`      |

`FontFamilyRole` (`'display' | 'body' | 'serif'`, data-model) resolves a role and weight to one of these
variables. Each weight is its own family: a text style sets `fontWeight: 'normal'` beside it, and the italic
accent sets no `fontStyle`. There is no third Bricolage weight. `test/theme/global-css.test.ts` reads every
name from the font files.

---

## C5-8. Space, radius, lift, icon

- **Space** (dp): 4, 8, 12, 16, 20, 24, 32, 40. The screen margin is 20 (16 on Android lists). Between sections
  24 (32 above a major heading), between cards 16, inside groups 8 and 12. The 004 `Spacing` names remain as
  aliases until Phase 10.
- **Radius** (dp): 8, 12 (inputs), 16 (thumbnails, tiles), 24 (cards, hero, ticket, passport), 28 (sheets),
  full. `borderCurve: 'continuous'` except full. Inner radius = outer radius minus padding, never below 8.
- **Lifts** (`boxShadow`): `lift1` (card, tile) and `lift2` (action button, pill, tag, sheet, toast).
  `light` and `light-contrast`: `lift1` = `0 1 2 rgba(14,42,71,.06), 0 8 24 -8 rgba(14,42,71,.14)`; `lift2` =
  `0 2 6 rgba(14,42,71,.10), 0 16 32 -8 rgba(14,42,71,.28)`. `dark` and `dark-contrast`: `lift1` = `0 0 0 1
rgba(255,255,255,.10), 0 8 24 -8 rgba(0,0,0,.50)`; `lift2` = `0 0 0 1 rgba(255,255,255,.10), 0 2 6
rgba(0,0,0,.35), 0 16 32 -8 rgba(0,0,0,.60)`. A hairline edge is always drawn with the card (the contrast
  themes make it explicit, P19). `boxShadow` is New Architecture only and Android 9 and later for outset; the
  adapters fall back to `elevation` below that. No other shadow exists.
- **Icons**: sizes 24, 20, 16; weights `regular` (rest), `fill` (selected, status), `duotone` (stat tiles); hit
  area always at least the platform minimum.

---

## C5-9. Motion

| Motion                   | Value                                                                                    | Reduced motion          |
| ------------------------ | ---------------------------------------------------------------------------------------- | ----------------------- |
| Press                    | scale .97 and the pressed fill, 100 ms                                                   | fill only, no scale     |
| Sheet and pill selection | spring, stiffness 700, damping 47.6 (ratio .9), settles within 300 ms                    | jump to the destination |
| Camera follow            | `easeTo`, 280 ms, once per settle                                                        | jump                    |
| Pin pop                  | spring, stiffness 800, damping 33.9, stagger 40 ms                                       | none                    |
| Count-up                 | 700 ms, ease out, stagger 80 ms, once per appearance                                     | final value             |
| Stamp landing            | scale 1.6 to 1, rotate −14 to the stamp's tilt, 180 to 220 ms, 2 dp settle, heavy haptic | appears, no haptic      |
| Live pulse               | scale 1 to 1.7, opacity .6 to 0, 2.4 s, repeating                                        | still ring              |
| Skeleton shimmer         | 1.4 s linear                                                                             | static                  |
| Idle rotation            | `linearTo`, 5 s per 20 degrees, 45 s cap, resume after 7 s idle                          | none                    |
| In-place change          | at most 200 ms, movement and fade only                                                   | immediate               |

---

## C5-10. Scrims, sky and covers

- **`scrim.top`** (status-bar zone, 120 dp box): `rgba(8,26,48,.68)` held to 44 percent, then to 0
  (contrast: `rgba(6,18,34,.80)`). **`scrim.bottom`**: 0 at 0 percent, .38 at 25, .66 at 55, .88 at 100 (contrast:
  0, .50, .78, .94 on `rgba(6,18,34)`). **Caption scrim** (deterministic): a 48 dp ramp from 0 to .66 plus a solid block
  that wraps the text from .66 to .88 (contrast .78 to .94), so alpha under any text line is at least .64
  (contrast .78) at every text scale.
- **Measured** over a pure white photograph: white text at alpha .64 is 5.33:1, .66 is 5.68:1, .88 is 12.44:1; the
  contrast scrim at .78 is 9.55:1 and .94 is 16.41:1; a white icon on `scrimButton` at .46 is 3.03:1, at .50
  3.41:1, at .55 4.00:1 (contrast .66: 6.09:1).
- **Sky** (Home, Welcome backdrop): light = `radial(120% 70% at 92% -8%, rgba(255,181,71,.46), 0 @62%)` over
  `linear(180deg, #FFF1DF 0, #FFE6D0 20%, #D7F0F6 56%, #EEF9FC 100%)`; dark = two soft radial glows over
  `linear(180deg, #0A1626 0, #0B1D36 40%, #0C2442 72%, #0F2037 100%)`. Text over the sky is `ink` or `muted`:
  `muted` is 6.27, 5.80, 5.87, 6.50 on the four light stops and 5.06 on the warmest glow; `ink` is at least
  10.57. `accentText` is 4.46:1 on the warmest glow, so it appears on the sky only at display size (the accent
  word), never at body size.
- **Passport card**: `radial(70% 90% at 100% 0%, rgba(255,181,71,.20), 0 @62%)` over `linear(135deg, #0E2A47,
#0F4C5C)`; white text 14.57 and 9.51 on the stops; its secondary text is white at .78 (6.50:1) in the base
  themes and fully opaque in the contrast themes.
- **Generated covers**: `cover1` (navy to teal), `cover2` (rust), `cover3` (teal to navy), white text at least
  5.05:1 on every stop (7.25:1 or more in the contrast themes); the country code is a ghost glyph at 16 percent
  white (decorative); `fnv1a32(tripId) % 3` picks the palette.
- The `Scrim` component is the only consumer of gradient strings (C5-1).

---

## C5-11. Globe style tokens and gate (extends `GlobeColors`)

`GlobeColors` keeps its keys (`casing`, `active`, `planning`, `past`) and gains stops and a style group. Arcs
are drawn over a `casing` line; the existing gate measures each colour against the casing at 3:1.

| Token (light)                   | Value                                                                                         | Dark                                                       | Measured                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `casing`                        | `#FFFFFF`                                                                                     | `#101318`                                                  |                                                                                     |
| `active` to `activeEnd`         | `#E04A33` to `#B86E00`                                                                        | `#FF8266` to `#FFE0A0`                                     | 4.04 and 3.99 on white; both far above on the dark casing                           |
| `past` to `pastEnd`             | `#E04A33` to `#B86E00`                                                                        | `#FF8266` to `#FFC25E`                                     | 4.04 and 3.99; dark 7.65 and 11.64 on the casing                                    |
| `planning` (dashed)             | `#B86E00`                                                                                     | `#FFC25E`                                                  | 3.99; dark 11.64                                                                    |
| `visitedFill`                   | `#FFCFBF`                                                                                     | `#FFA48E`                                                  | fill only; **1.37:1 on land, so the keyline carries the meaning**                   |
| `visitedKeyline`                | `#E04A33`                                                                                     | `#FFC4B4`                                                  | 3.94 on `#FFFCF5`, 3.37 on `#F6E9D2`; dark 3.56 on `#3C6E99`                        |
| `plannedKeyline` (dashed)       | `#B86E00`                                                                                     | `#FFE3A8`                                                  | 3.89 on `#FFFCF5`; dark 4.86 on `#2A557E`                                           |
| `land`                          | `#FFFCF5` and `#F6E9D2`                                                                       | `#3C6E99` and `#2A557E`                                    | the gate measures every keyline against both                                        |
| `water`                         | `#8FD6EC` (start)                                                                             | `#0E3465` (start)                                          | tuned in V2; `ink` is 9.02:1 on the light sea, `ink-2` 4.31:1 (so labels use `ink`) |
| `atmosphere`                    | color `#FFF1DF`, highColor `#D7F0F6`, spaceColor `#FFE6D0`, horizonBlend .08 to .14, no stars | color `#0B1D36`, highColor `#0C2442`, spaceColor `#0A1626` | opaque, per research D5-04                                                          |
| `greenspace`, `adminBoundaries` | start at `land` and `sand`                                                                    | start at dark `land` and `sand`                            | tuned in V2                                                                         |

**The prototype's bright arc ends fail**: `#FF9A45` on white is 2.11:1 and `#FFB547` is 1.76:1 (finding M-3),
so the light gradient ends at `#B86E00`; dark keeps the bright warm ends (they are on a dark casing). Past and
active share a hue in light; they differ by width (1.5 and 3.5 dp, `GlobeGeometry`), by the pulse and by the
live pin, never by colour alone. In the contrast themes the arc widths gain 1.5 dp (the prototype's rule).
Every custom layer sets `*EmissiveStrength: 1`. The Standard configuration keys are checked against a literal
allow-list (T505): the typed names `colorBoundaries` and `colorGreenspaces` are wrong and are rejected.

---

## C5-12. Stability guarantees for downstream features

Later features compose from these tokens and the adapters of `contracts/components.md`; a screen added later
never introduces a colour, radius, shadow or gradient. The token names above are the stable public surface; the
kit's variable names are an implementation detail behind `theme.css`.

## As built: tokens, type, shape, motion (T514 to T517)

**C5-1 enforcement.** (a) `eslint.config.js` rejects `linear-gradient(`, `radial-gradient(`, `conic-gradient(` and
their `repeating-` forms, in a string or a template literal, in every folder of `src/` except `src/theme/` and
`components/ui/scrim.tsx` (tests are exempt; `scrim.tsx` stays under the colour rule). (b)
`test/theme/atlas-values.test.ts` searches `src/` for the 64 Atlas hex literals of
`test/theme/atlas-values.ts` (`#7A4800`, which Sunrise also uses, is not listed). It is **green from T514**, not red
until T564, because T514 re-pointed the palette, `GlobeColors` and the comments in one change; it stands as a
regression test. The Atlas-only treatments (the 004 `AtlasRadius` and `AtlasSpacing`, the flat tab strip's
`markWidth` and `markHeight`, the 004 text roles `largeTitle` and `numeric`) are guarded in
`test/no-neumorphism.test.ts` as a ratchet (no new use) and, with `ATLAS_RETIREMENT=1`, as a strict zero that is
red until T564.

**C5-3.** The palette has 59 keys (data-model section 1). `palette.data.js` authors 51 and resolves the eight
aliases from the key they equal, so they cannot drift. Alpha (`#RRGGBBAA`) is allowed on `hairline`, `grab`,
`backdrop`, the five tints, `scrimButton`, `scrimButtonLine` and `skeletonHighlight` only. `Colors` keeps its eight
keys on the new palette (`accent` is the coral FILL and is gated as the `FILL_BELOW_FLOOR` exception).

**C5-6.** The generated sheet has 32 kit variables and 41 app variables per theme. Kit mapping: `--surface-tertiary`
from `pressed`, `--separator` from `hairline`, `--link` from `ink`, `--accent` and `--accent-foreground` from
`accent` and `accentInk`; the kit variables the palette has no key for read the closest measured key:
`--success-foreground` and `--warning-foreground` from `onInk`, `--warning` from `amberInk` (P5). The app variables
are `--status-*` and `--pending` (kept), `--subtle`, `--on-ink`, `--sand`, `--accent-press|line|text|tint`,
`--aqua`, `--aqua-line|ink|tint`, `--amber`, `--amber-line|ink|tint`, `--danger-tint`, `--success-tint`, `--grab`,
`--on-photo`, `--scrim-button`, `--scrim-button-line`, **`--photo-ring`** (the roundel ring; a bare `--ring` is a
name the kit may claim), `--skeleton`, `--skeleton-highlight`, `--toast-surface|ink`, `--stamp-coral|navy|teal|green`
and `--cover1-start` to `--cover3-end`, each also exposed as `--color-<name>`. The shadows are still derived from
`ink` in `light` only. Until the adapters (T519 to T521) are rebuilt, the 004 `Button`, `Chip`, row and card keep
deriving pressed fills from `--accent`, which is now the coral fill: five pairs fall short and are enumerated, and
verified in both directions, in `test/theme/adapter-pressed-fills.test.ts` and
`test/ui-kit/pressed-fills-chip-row-card.test.ts` (delete the lists with the 004 adapters). `Icon tone="accent"`
and `text-status-active` chip labels likewise still read the coral fill and `accentLine` (2.82:1 and 4.04:1 on
white) until T518 and T520.

**C5-7 type.** Two tables, because five role names collide with 004 roles of another size and the 004 call sites and
tests pin the old values. `TypeRoles` (`src/theme/typography.ts`) is the table of this contract, `TextRoles` the 004
one (kept until Phase 10, when `TypeRoles` is renamed `TextRoles`; `LegacyRoleMap` is the mapping). `Text` selects a
Sunrise role with **`variant`** (`display`, `numeral`, `title`, `headline`, `callout`, `body`, `label`, `caption`,
`eyebrow`, `accent`) and keeps `type` for the 004 roles; `variant` wins. `strong` turns `body` and `label` to the
semibold face. `numeral` and `eyebrow` always carry `maxFontSizeMultiplier` 1.3 (the token holds it); `callout`,
`label` and `caption` carry it only with `capped` (tab labels, pills, chips, stat labels, the FAB label, the day
chips); no other role is ever capped. The faces are `font-display` (600), `font-display-bold` (700), `font-body`
(400), `font-body-semibold`, `font-body-bold` (eyebrow) and `font-serif-italic`; tracking, upper case and tabular
figures are style in dp (`typeExtras`: display -1.4, numeral -1.44, title -0.84, headline -0.44, eyebrow +0.72). The
accent word is the platform text, so it inherits its size (the kit's body preset would set one). Coral as text is
`accentText`: `Text tone="accent"` is `text-accent-text`; the tones `subtle`, `aqua`, `amber`, `onInk` and `onPhoto`
are added. The 004 `ThemedText` was retired by T452; the shim of this contract is the 004 `type` path of `Text`.

**C5-8 shape.** `Space` (4 to 40 under the data-model keys), `ScreenMargin` (20, 16 on an Android list), `Radii`
(8, 12, 16, 24, 28 sheet, full; not `Radius`, which `constants/theme.ts` owns), `cornerOf`, `innerRadius` (never
below 8), `Lift` per theme (two lifts, `liftOf` for a `boxShadow` copy), `LiftElevation` (2 and 6 dp: starting
values for Android below 9, a device check), `IconSize` and `IconWeights`. `FocusRing` is 2.5 dp wide with the 2 dp
gap, and `PrimaryEdgeRing` (1.5 dp, 2 dp in the contrast themes, drawn in `accentLine`) is the token P15 checks.

**C5-9 motion.** `Motion` keeps the 004 keys and adds every row of the table (springs, `cameraFollowMs`,
`pinStaggerMs`, the count-up, the stamp, the pulse, the shimmer, the idle rotation incl. `spinResumeMs` 7000). The
sheet spring's damping ratio is .9 and it settles in 168 ms (limit 300); the pin pop's is .6. Reduced motion:
`motionDuration(name, true)` is 0, `pressScaleOf(true)` is 1, `springOf(name, true)` is `null` (jump).

**C5-10 scrims, sky, passport.** The values are data in `src/theme/scrim.ts` (`Scrim`, `scrimSpec`, `withAlpha`,
`Sky`, `Passport`, `colourAt`); the `Scrim` adapter (T523) draws them and nothing else writes a gradient.

**C5-11 globe.** `GlobeColors` gains `activeEnd`, `pastEnd`, `visitedFill`, `visitedKeyline`, `plannedKeyline`,
`land` and `landShade` (P22 and `globe-contrast-gate.test.ts`); water, atmosphere and the style group are T532.
Dark `active` starts at `#FF8266` (the contract's `#FFA08C`), the dark `accentLine`, so `statusActive` and
`statusPlanning` equal the globe's `active` and `planning` in both themes (`statusPast` is `muted`, a text colour,
and a past arc shares the active hue in light, told apart by width: C5-11).

## Rationale for the palette (for the record)

The prototype's palette is a sunrise: white and warm cream for paper, a deep navy ink (hue about 255), coral
(about 35 to 40) for the single call to action, aqua for water, amber for planned. Coral is 0.1 to 6.4 percent
of the pixels of any frame (audit, section 5), which is why it can mean "do" and "now". Values are stored as hex
so `contrastRatio` and every existing test stay valid. The measured values above replace the prototype's
rounded claims where they differ (for example `ink-3` on cream is 5.24:1, not "5.2").
