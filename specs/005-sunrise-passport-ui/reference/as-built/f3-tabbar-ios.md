# F3 Tab bar, objective 1: the iOS floating pill

Branch `feat/f3-tabbar-ios` (from `feat/f3-tabbar`). Pictures read: `home`, `home-dark`, `trips-dark` (the pill, cropped and
enlarged), plus the prototype CSS `.tabbar`, `.tab`, `.tab.is-on`, `.tabbar-fade` and its `@supports backdrop-filter` block.
The Android bar is the other objective and is not touched (`android-nav-bar.tsx`).

## Audit list (picture / CSS against the build)

| Item                                                                                   | Before                                                   | Now                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Geometry: 16 from the sides, bottom `max(inset - 10, 12)` (24), 64 min, 6, 4           | right                                                    | unchanged, pinned again by name in `tab-pill-fidelity`                                                                               |
| Three equal tabs Globe / Trips / You; ids `tab-bar`, `tab-<route>`, `tab-mark-<route>` | right                                                    | unchanged                                                                                                                            |
| Scene inset 104 dp (88 reported + 16)                                                  | right                                                    | unchanged (`tab-clearance.test.tsx`)                                                                                                 |
| Glyphs: globe (circle, meridian, equator), rolling suitcase, person                    | `GlobeHemisphereEast`, plain `Suitcase`, `User`          | `Globe` behind `globe`, new key `suitcase-rolling` (`SuitcaseRolling`) for Trips; `suitcase` stays for the Trips empty list          |
| Glyph size 24; filled when selected, outline otherwise                                 | right                                                    | unchanged                                                                                                                            |
| Label 12 / 14, DM Sans 600 in EVERY state (`.tab { font: 600 12/14 }`)                 | `label` role 14 / 20, 600 only when selected             | 12 / 14 (`PillMetrics.labelSize/labelLine`), semibold always; ink when selected, `muted` otherwise                                   |
| Label cap 1.3x, wraps, tab grows by minimum height                                     | right                                                    | unchanged, pinned                                                                                                                    |
| Selected capsule colour, light and light-contrast                                      | `accentTint`                                             | unchanged                                                                                                                            |
| Selected capsule colour, dark and dark-contrast                                        | `accentTint` (coral at 16%)                              | white at 14% (`withAlpha(onPhoto, PillMetrics.darkCapsuleAlpha)`; `onPhoto` is pure white in every theme)                            |
| Capsule spring, reduced motion, no opacity                                             | right                                                    | unchanged                                                                                                                            |
| Blur tint: 84% `surface` (light) / **cream** rgba(24,46,74) (dark)                     | `surface` in both: the dark pill was as dark as ground   | `tabTint()`: `surfaceSecondary` in dark, `surface` elsewhere                                                                         |
| Solid (reduced transparency, contrast): opaque                                         | `surface`                                                | dark with reduced transparency: opaque cream (CSS `.98` fallback); both contrast themes and light: opaque `surface` (`var(--paper)`) |
| Hairline ring and `lift2`                                                              | blur and solid only                                      | also on the glass                                                                                                                    |
| Fade: 48 dp, ground colour, behind the pill, none on Android                           | drawn, canvas / sheet-surface ground (light only pinned) | unchanged; dark and dark-contrast now pinned                                                                                         |
| Selection haptic                                                                       | none (the `tabChange` haptic existed, unused)            | `useHaptics().tabChange()` when a press changes the tab (not on the focused tab, not when a listener vetoes)                         |
| `tabPress` semantics (emit, `preventDefault`, navigate only when not focused)          | right                                                    | unchanged; `tabPressHandlers` takes an optional `onNavigate` callback (additive; the Android bar ignores it)                         |

## What changed

- `tab-metrics.ts`: `labelSize`, `labelLine`, `darkCapsuleAlpha`.
- `tab-pill.tsx`: label 12 / 14 semibold, haptic. `tab-shared.ts`: Trips icon `suitcase-rolling`, `onNavigate`.
- `tab-surface.tsx`: `tabTint()`, ring and lift on every kind. `tab-capsule.tsx`: dark capsule.
- `ui/icon-registry.ts`: `globe` is `Globe`, new `suitcase-rolling`.
- Tests: new `test/components/tab-pill-fidelity.test.tsx` (glyphs, label metrics and weight, capsule per theme, tint per theme, ring
  and lift on all three kinds, solid cases, dark fade, haptic); `tab-surface.test.tsx` and `tab-bar.test.tsx` adjusted; the icon vocabulary
  list gained `suitcase-rolling`.

Assertions changed (each because a picture needs another value): the dark blur tint is `surfaceSecondary` (was `surface`); the unselected
label is semibold (was regular); the glass has a ring and a lift (the test said it had none); the Trips glyph key is `suitcase-rolling`.

## Deviations, and why

- **Selected glyph is the filled Phosphor weight.** The prototype draws the same line glyph with `fill: currentColor` (it reads as a bolder outline
  in the pictures). FR-022 says "a filled icon", UI-SPEC 2.3 says `fill` for a selected tab: the spec wins.
- **No `saturate(1.6)`.** `expo-blur` has no saturation control; the tint carries the colour. Blur intensity 60 is still a starting value.
- **Press feedback is the `Tappable` pressed capsule** (`pressed` fill, instant). The prototype has no pressed state and the 0.97 press scale
  of `Button` is not available to a `Tappable`; the capsule shape is pinned.
- **The pill's glass has no tint of its own**: the system draws it, adapted to the scheme. The cream/paper tint rule applies to the blur and solid.

## DEVICE checks for the owner (iPhone)

1. iOS 26: the glass pill over the globe and over a list: legible labels over a bright sky, and no doubled rim now that the glass also has the
   hairline and `lift2` (if it doubles, take `ring` off the `GlassView`, one line in `tab-surface.tsx`).
2. iOS 18 or earlier (or Settings > Accessibility > Display > Reduce Transparency off, with an older phone): the blur pill, dark theme: lighter
   navy than the ground, as `home-dark.png`.
3. Reduce Transparency on, and Increase Contrast on, light and dark: opaque pill with a visible ring.
4. The three glyphs against `home.png` (globe with meridians, rolling suitcase, person); label size and weight; selected capsule coral (light),
   grey-white (dark).
5. Tap each tab: the capsule springs, one light selection tick; tapping the current tab ticks nothing.
6. Text size at maximum: labels stop growing at 1.3x and wrap; the pill grows.
7. Fade above the pill on Trips with a long list, in light and dark (the picture's fade is faint).
