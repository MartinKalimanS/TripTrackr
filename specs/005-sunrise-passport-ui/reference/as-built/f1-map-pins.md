# F1 Map, objective 2: the pins and the callout (as built)

Branch `feat/f1-map-pins`. Pictures: `screens/core/home-peek.png`, `home.png`, `home-dark.png`. CSS: `prototype/styles.css`
(`.roundel`, `.rpulse`, `.tag`), `app.js` (`MARKS`, `draw`). Untouched: the globe and arc geometry, the camera rules,
`tripIdFromPress`, the hit source `globe-arcs`, every `globe-callout*` id, the pin layer ids (`globe-pins`, `globe-pin-dot`,
`globe-roundels`, `globe-roundel`).

## Fidelity audit (picture and CSS against the code as it was)

| Item             | Picture / CSS                                                                                        | Before                                                                                | Now                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Roundel size     | 56 live, 44 planned, 40 past, cluster 40                                                             | same                                                                                  | same (`GlobeLayers.pins.roundelSize`, `clusterSize`)                                                                                 |
| White ring, lift | 2 dp `--ring`, `shadow-2`                                                                            | ring yes, NO lift in the bitmap                                                       | `lift2` under the disc, transparent margin (`shadowPad` 24) so the capture keeps it                                                  |
| Live ring        | 2.5 dp coral-line, CSS `inset: -8px` from the padding box = 6 dp outside the roundel edge            | 5.5 dp outside                                                                        | 6 dp (`statusRingOutset.active`)                                                                                                     |
| Planned ring     | 2.5 dp dashed amber-line, `inset: -7px` = 5 dp outside                                               | 5.5 dp, same as live                                                                  | 5 dp (`statusRingOutset.planning`); solid on Android (see below)                                                                     |
| Pulse            | 68 dp ring, scale 1 to 1.7, opacity .6 to 0, 2.4 s                                                   | callout drew a 72 dp solid ring AND a 72 dp pulse on top of the baked ring: two rings | over a roundel the callout draws only the pulse (68 dp = 56 + 2 x 6, the outer edge of the baked ring); over a dot it keeps its ring |
| Gap to the card  | card edge at pin middle + s/2 + 14                                                                   | ring 72: 50 dp for the live roundel                                                   | `ringSize.roundel` 56: 42 dp, as the prototype                                                                                       |
| Callout card     | white, radius 16, padding 8 12, `lift2`, max 220, title `callout` 17/22 navy, detail `caption` 13/18 | same                                                                                  | same (pinned by tests)                                                                                                               |
| Live dot         | 7 dp coral with a 2 dp `rgba(224,74,51,.22)` ring                                                    | no ring                                                                               | `boxShadow` spread 2 at alpha .22 (`callout.dotHalo`)                                                                                |
| Arrow            | 12 dp, 45 deg, on the facing side, `-5`                                                              | same                                                                                  | same (tested for all four sides)                                                                                                     |
| Flip order       | left, right, above, below; 12 dp sides, 6 dp top and bottom                                          | same                                                                                  | same (pinned)                                                                                                                        |
| Dark             | card `#F4F7FB`, ring `#F4F7FB`, cluster a light disc with a dark count                               | card yes; ring yes; no cluster                                                        | `GlobeStyle[scheme].pin` (`ring`, `clusterFill`, `clusterLabel`); contrast of the count gated                                        |
| Cluster          | ink disc, bold count "+3"                                                                            | none                                                                                  | dots cluster in `globe-pins` (Mapbox `cluster`, radius 44, to zoom 5): disc layer + count layer                                      |
| Hit area         | >= 44                                                                                                | hitbox 44 on both sources                                                             | same                                                                                                                                 |
| Ordering         | live on top                                                                                          | `symbolSortKey` / `circleSortKey` rank                                                | same; roundels above dots and clusters                                                                                               |

## What changed

- `GlobeLayers.pins.roundelsEnabled` is `true`.
- A trip with no photograph is its GENERATED cover as a roundel: palette `fnv1a32(trip id) % 3`, the country code (the stop the pin
  rests at, `pinCountries`), the cover's gradient (`Scrim kind="cover"`) and the code in opaque white centred (a 120 px ghost glyph
  does not fit a 40 dp circle). No country: the gradient alone. The key names palette and code, so a photograph arriving replaces it.
- `roundel-badge.tsx` (new) holds the badge; `roundel-stage.tsx` keeps the batching (12 at a time, off screen at `left: -2000`).
- `use-roundels.tsx`: only the bitmaps the current requests name are kept; a file nobody names any more (a changed cover, the other
  theme) is deleted (`releaseCapturedFile`, in `components/ui/view-capture.ts`, the only `react-native-view-shot` import); every file
  is deleted on unmount; a capture that finishes after unmount is deleted. The prune is keyed on request NAMES so inputs rebuilt on
  every render cannot loop.
- `restingStop` (new, `features/globe/globe-data.ts`); `restingCoordinate` is built on it.

## Fallbacks

- A capture that rejects OR answers with an empty URI, or a photograph that fails to load: that pin stays a dot, is not asked for
  again, and the other pins keep their roundels (tested). Nothing throws into the globe.
- At most 60 roundels (`roundelLimit`); the rest are dots, and dots cluster. At most 12 badges are laid out at once.
- Android: the planned ring is SOLID amber (a dashed border on a circle is unreliable there); iOS is dashed.
- One-line switch back to dots: `GlobeLayers.pins.roundelsEnabled: false` in `apps/mobile/src/constants/theme.ts`.

## Deviations and limits

- The cluster is for dots (pins with no roundel yet, a failed capture, beyond sixty), not a grouping of nearby roundels; the
  prototype's "+3" next to the Portugal pin is therefore not reproduced for roundels. A tap on a cluster opens nothing (it has no
  trip id); zooming in splits it.
- The roundel is one bitmap scaled by `iconSize` (0.8 at the whole planet to 1 at zoom 5): the pictures' 48 dp peek variant is
  approximated by that scale, not by a second size.
- A card with no room on any side is narrowed (kept from T533), where the prototype clamps it.
- Tests changed because the picture needs another value: "a trip with no cover is a dot" is now "gets its generated cover"; the
  `roundelsEnabled` assertion is `true`; the badge ring test reads the ring child (the badge is now the transparent margin); the
  pin-layer "one source, one circle layer" test lists the cluster layers; the callout ring size of a roundel is 56, not 72.

## DEVICE checks for the owner (V2, T508)

1. Do the photo roundels appear on both platforms, with the right colours (no washed-out or dark PNG), a white ring, a soft lift?
2. A trip without a photograph: a coral, amber or blue gradient with its country code in white. Palette stable between launches.
3. The live trip: coral ring with the pulse growing out of it; ONE ring, not two; the card 42 dp from the pin.
4. Planned trip: dashed amber ring on iOS, solid on Android.
5. Dark theme: white-ish ring, light callout card, light cluster disc.
6. Many trips: dots cluster with "+N"; the count font renders (`DIN Pro Bold` glyphs from the style); first paint is not janky while
   badges are captured in batches of 12.
7. Roundels do not flash back to dots when the sheet moves or the theme flips (the keys include the scheme).
8. If anything misbehaves, set `roundelsEnabled` to `false`.
