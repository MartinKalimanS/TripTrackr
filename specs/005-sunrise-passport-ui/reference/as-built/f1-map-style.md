# F1 "Map", objective 1: the look of the Home globe (as built)

Branch `feat/f1-map-style`. Scope: layers and colours of the globe only. Globe geometry, arc geometry, great-circle maths,
camera rules and hit sources are untouched (FR-082). Pictures: `screens/core/home*.png`; source of truth for numbers:
`prototype/globe.js`, `prototype/tokens.css`. Colours were also sampled from the PNGs (`home-peek.png`,
`home-peek-dark.png`).

## Audit: picture against the code before this change

| Element                    | Picture (light / dark / contrast)                                                     | Code before                                                                   | Verdict                    |
| -------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Sky backdrop               | `--sky`: peach glow top right over a peach to aqua ramp; dark navy ramp and two glows | `Sky` data equals `--sky` (now pinned by a test); BUT `spaceColor` was opaque | **the map hid the sky**    |
| Halo outside the rim       | light blue (night: teal), about a third of the radius wide                            | `color`/`highColor` cream and pale aqua, `horizonBlend` .1                    | **wrong colour, narrow**   |
| Sea                        | light `#86D1E9` to `#3B98BE`; night `#164E85` to `#082145`; ONE flat colour in Mapbox | `#8FD6EC` (the 30% stop) / `#0E3465` (the 72% stop)                           | retuned to the mid-tone    |
| Sea inner highlight, limb  | radial highlight top left, darker limb                                                | none                                                                          | Mapbox cannot              |
| Land                       | cream `#F9EFDE` (night `#305D87`) with a soft painted shadow                          | `#FFFCF5` (too white); night `#3C6E99`                                        | light retuned              |
| Land shadow / soft edge    | `landShadow` drawn offset 1.2, 2.2 under the land                                     | none                                                                          | Mapbox cannot              |
| Country borders            | thin warm tan `rgba(205,176,130,.55)`; night faint light blue                         | `#EBDCC9` (too faint); night `#2B4466` (darker than the land)                 | retuned                    |
| Graticule                  | `d3.geoGraticule10`: a line every 10 degrees, white .34 (night `#AAD7FF` .11)         | every 30 degrees                                                              | **step 30 to 10**          |
| Rim                        | 1.2 px white (night cyan) edge and an inner rim gradient                              | none                                                                          | Mapbox cannot              |
| Visited countries          | coral keyline on a white edge, faint tint                                             | keyline and tint, no edge                                                     | **edge added**             |
| Planned countries          | amber dashed keyline on a white edge (and an amber tint in the prototype)             | dashed keyline, no edge, no tint                                              | edge added; tint not built |
| Active (live) country tint | stronger coral tint, thicker `#B92A1D` line                                           | not a separate class (`countryCodes` has visited and planned)                 | not built                  |
| Trip arcs                  | coral to amber gradient, white casing, planned dashed, fade at the ends               | gradient, casing and dashes already; light end stop `#B86E00`                 | kept (gate M-3)            |
| Journey legs               | past style                                                                            | past style                                                                    | same                       |
| Labels at world scale      | no text on the planet                                                                 | POI, transit and road labels off; place labels (country names) ON             | **place labels off**       |
| Contrast variant           | same sky and globe, wider arcs                                                        | same                                                                          | same                       |

## What changed

- `GlobeStyle` (`src/constants/theme.ts`): `water`, `adminBoundaries`, `atmosphere` (colours, `horizonBlend` .24 light and
  .2 night, space transparent), new `visitedCasing` and `visitedCasingOpacity`. `GlobeColors`: light `land` `#FBF2E3` (the
  middle of the prototype gradient) and `visitedFill` `#FFC0AD` (the middle of its two stops). `GlobeLayers`: graticule
  `step` 10, `countries.casingExtra` 1.6 (the prototype's extra stroke width).
- `basemap-config.ts`: `showAdminBoundaries: true` is sent explicitly; `showPlaceLabels` joins the world-scale toggles (off
  at world scale, on closer in). Both keys were already in the allowlist of `test/globe/basemap-config-keys.test.ts` (a
  copy of the Standard configuration table); the allowlist was NOT extended.
- `visited-countries-layer.tsx`: a solid casing `LineLayer` under each keyline (`globe-visited-casing`,
  `globe-planned-casing`), same filter and worldview clause, never dashed.
- `atmosphere-layer.tsx`: comment only. `Scrim kind="sky"`: no change; `test/theme/sky-matches-prototype.test.ts` reads the
  prototype `tokens.css` and pins the stops and glows of `Sky` (light and dark) to `--sky`.
- Gate (`globe-contrast-gate.test.ts`): `spaceColor` is transparent, so it leaves the greeting-contrast list (the text is
  over the sky there, already gated by `scrim.test.tsx`); `color` and `highColor` still clear ink and muted in all four
  palettes (this is what caps the NIGHT halo's brightness: the picture's is brighter); the `horizonBlend` range .08 to .14
  became .2 to .3 (the picture's halo is wider; the old range was a first guess); new tests for the casing and for the
  border and land tokens. No contrast floor was lowered.
- No token feeds the generated CSS, so `build-theme-css.mjs --check` is unaffected.

## What Mapbox cannot do (closest option chosen)

- The sphere's radial sea highlight and limb darkening, the rim gradient and the thin white rim ring: `colorWater` is ONE
  colour. Chosen: the mid-tone of the ramp; the Atmosphere horizon gives a soft bright edge.
- The painted land shadow: a layer cannot be put beneath Standard's land, and a blurred line over the land would darken it
  and load the whole countries tileset all the time. Not built.
- Two-stop gradient fills (visited and planned tints) and the arcs' faded ends: a flat token fill; ends not faded.
- The prototype's "ground track" (dotted shadow of a lifted arc): arcs are on the surface (geometry rule).
- Light arc ends stay `#B86E00` (the bright prototype ends fail 3:1, finding M-3), so light arcs are darker than the
  picture's orange ends.
- The planned amber tint and a separate "active country" class are not built (the pictures show neither beyond the pin).

## DEVICE checks for the owner (iOS and Android)

1. Sky: does the peach to aqua gradient with the top right glow show BEHIND the planet? If the background is black or flat,
   `spaceColor` alpha 0 is not see-through on that platform: set `GlobeStyle.*.atmosphere.spaceColor` to the opaque sky
   colour (`#FFE6D0`, `#0A1626`); the gate's transparency test is then the one to change.
2. Halo: width and brightness against `home-peek.png` (tune `horizonBlend` .2 to .3, then `color` and `highColor` within the
   gate); the night halo should read teal, as bright as the gate allows.
3. Sea and land tone in day and night (the Standard lighting may shade `colorLand` and `colorWater`): compare with the
   pictures and retune `water`, `land`, `adminBoundaries`.
4. The 10 degree graticule: fine on the planet, gone by zoom 4; not busy on a small phone.
5. Visited and planned outlines: coral, and dashed amber, each on a white (night: navy) edge, no seams where countries meet.
6. No country, ocean or city names on the whole planet; they come back at zoom 5.
7. Arc gradients, planned dashes and journey legs still as before.
