# F3 Tab bar, Android navigation bar: as built

Branch `feat/f3-tabbar-android` (from `feat/f3-tabbar`). Pictures: `screens/core/home-android.png`,
`trips-android.png`. CSS: `prototype/styles.css`, `:root[data-platform='android'] .tabbar`, `.tab`,
`.tab .ind`, `.tab.is-on .ind`. Files: `components/navigation/android-nav-bar.tsx`,
`tab-metrics.ts` (`AndroidBarMetrics`), `test/components/android-nav-bar.test.tsx`.

## Audit (picture and CSS against the code before this change)

| Rule                                              | Before                                          | Now                                                              |
| ------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Bar = 64 dp above the system inset, edge to edge  | content min 64 per tab, inset as padding: right | `minHeight` 64 + `insets.bottom` on the bar (hairline inside)    |
| Padding 12 8 (24 = inset)                         | 4 dp above the indicator, 0 on the sides: WRONG | `paddingTop` 12, `paddingX` 8 + side insets; indicator at y = 12 |
| Hairline on top, 1 dp                             | `hairlineWidth` (0.33 dp on a 3x phone)         | 1 dp (`AndroidBarMetrics.hairline`)                              |
| Cream ground, opaque in every theme               | `surfaceSecondary`: right                       | unchanged, now pinned for all four themes                        |
| Indicator 56 x 32, full radius                    | right                                           | unchanged                                                        |
| Indicator tint 26% coral (dark 28% of dark coral) | `accentTint` = 16%: WRONG                       | `accent` token at 26% / 28% (`withAlpha`), light and dark        |
| Filled icon selected, outline otherwise, 24 dp    | right                                           | unchanged                                                        |
| Label 12 / 14, weight 600, gap 4, capped 1.3      | 14 / 20 and regular when unselected: WRONG      | 12 / 14, semibold on every tab, capped 1.3, gap 4                |
| Label colours                                     | `ink` selected, `ink-2` (muted) otherwise       | unchanged                                                        |
| Press feedback                                    | whole square tab flashed the `pressed` fill     | the INDICATOR takes the held fill (Material state layer)         |
| Ids, roles, names, selected, `tabPress` semantics | right                                           | unchanged                                                        |
| Scene inset and FAB offset                        | reported height (incl. inset) + 16              | unchanged: FAB bottom edge lands 16 dp above the bar's top edge  |
| Large text                                        | bar grows by content                            | unchanged (bar minimum + content grows; tab minimum is 48 dp)    |
| Hide on keyboard                                  | not hidden                                      | unchanged: neither the picture nor FR-022 to FR-028 ask for it   |

The real bottom inset is `insets.bottom` from `SafeAreaInsetsContext` (what React Navigation hands
`tabBar`): about 24 dp with gesture navigation (the picture), 48 dp with three buttons. The bar is
never given 88 dp.

## Deviations (and why)

- **Labels wrap instead of ellipsis.** The prototype CSS truncates (`.tab .lb`), FR-023 (Tier 1) says
  "labels MUST wrap rather than clip", and the order of authority puts the spec first. With
  "Globe", "Trips", "You" nothing differs in the pictures.
- **Unselected labels are semibold too** (picture and CSS: `.tab` is `font: 600`), so the old "heavier
  label when selected" (FR-022) is gone on Android. The selection still survives greyscale: a
  tinted capsule, a filled icon, and `ink` against `ink-2`. The iOS pill keeps its own rule.
- **1 dp hairline** where the old code used the device's thinnest line (the brief and the picture).
- No Android `ripple`: `Pressable`'s ripple is bounded to the whole tab, not the 56 x 32 indicator.
  The held state fills the indicator with the `pressed` token (no transition, inside 100 ms).
- Existing assertion changed on purpose: the tab's `minHeight` was 64 (pinned equal to the bar);
  the picture's bar has 12 dp of padding above the tabs, so the 64 dp minimum moved to the bar and
  the tab keeps the 48 dp touch target.

## Device checks for the owner (Android phone)

1. Gesture navigation: the bar is about 88 dp, the indicator starts 12 dp below the hairline,
   the gesture pill sits under the label, nothing overlaps.
2. Switch to three-button navigation: the bar grows to 64 dp + the buttons' height, edge to edge,
   and the cream ground runs behind the buttons.
3. Selected tab: coral wash behind a FILLED icon, about 26% light and 28% dark, `ink` label; the
   others outline, grey-blue label, same weight.
4. Hold a tab without releasing: the capsule behind its icon greys, not the whole tab.
5. Large text (Settings, Font size at maximum): the bar grows, nothing clips, labels wrap.
6. Home: the "New trip" button floats 16 dp above the bar's hairline; Trips list ends clear of it.
7. Dark theme and a contrast theme: cream becomes navy, hairline stays one line.
