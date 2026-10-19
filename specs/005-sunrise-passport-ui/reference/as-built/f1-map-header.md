# F1 Map, objective 3: the Home header and the coming-soon control

Branch `feat/f1-map-header` (from `feat/f1-map`). Pictures read: `home`, `home-peek`, `home-offline`, `home-scale2`, `home-long`
(and the prototype CSS `.home-head`, `.greet`, `.h-tools`, `.recentre`, `.icon-btn.on-sky`, `.sync-chip`).

## Audit list (picture / CSS against the build)

| Item                                                                | Before                                       | Now                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Top of the zone                                                     | inset + 8                                    | inset (54); the greeting column adds its own 4 (`.greet { padding-top: 4px }`)                                                                                                                         |
| Date to greeting gap                                                | 4                                            | 2 (`h1 { margin-top: 2px }`)                                                                                                                                                                           |
| Eyebrow 12/16 caps +.06em, `muted`; display 40/44, 2-line clamp     | already right                                | pinned by tests                                                                                                                                                                                        |
| Name: serif italic in `accentText` (`.serif { color: coral-text }`) | **default ink (wrong)**                      | `tone="accent"` on the accent word, in the header and in the Home loading skeleton                                                                                                                     |
| Search button (round, 44 dp, `onSky`, `lift1`) right of the chip    | **missing**                                  | `ComingSoonButton name="search"` (`coming-soon-search`) in `HomeTools`                                                                                                                                 |
| Tools: gap 8, centred on each other, chip 36 / disc 44              | chip alone                                   | row, `alignItems: center`, gap 8                                                                                                                                                                       |
| Text scale >= 1.15: tools stack, right-aligned (`data-bigtext`)     | not done                                     | column, `flex-end`, gap 8 (`isLargeText`)                                                                                                                                                              |
| Recentre: 44 dp `onSky` at left 20, appears after the camera moved  | 8 dp under the edge                          | 20 dp under the edge (the prototype puts it at 150 with the header ending at 120-128)                                                                                                                  |
| Hidden at the full detent                                           | already right (parent leaves the header out) | unchanged                                                                                                                                                                                              |
| Offline / error banner                                              | under the greeting, over the globe           | unchanged on purpose (T537 deviation 2): the picture draws it at the top of the half sheet, but an empty state has no sheet. Visually the banner now has the same 12 dp gap to the greeting as before. |

Not reproduced (UI-SPEC section 11): `home-long.png` shows the accent name on four lines; the build keeps the two-line clamp.

## What changed

- `components/ui/coming-soon-button.tsx` (+ test): `ComingSoonButton`, `useComingSoon`.
- `components/home/home-tools.tsx` (new): chip + search, row or column.
- `home-header.tsx`: top padding, tools, recentre offset. `greeting-header.tsx`: paddings, accent ink.
- `ui/screen-skeletons.tsx`: the loading greeting's accent word takes the same ink.
- Tests: `coming-soon-button`, `home-header`, `greeting-header` extended.

## The coming-soon API (for every later feature)

```tsx
import { ComingSoonButton, useComingSoon } from '@/components/ui/coming-soon-button';

<ComingSoonButton name="share" label="Share" icon="share" />                       // onSky disc by default
<ComingSoonButton name="more" label="More" thing="Trip actions" icon="ellipsis" variant="glass" />
const onPress = useComingSoon('Settings');                                           // any other control's onPress
```

- Real button: role button, accessible name = `label` (what the picture says), hint "Not available yet", 44 dp disc with the
  platform touch floor (IconButton), id `coming-soon-<name>`, never disabled (it can be focused and pressed).
- Only effect: ONE toast "<thing ?? label> is coming soon" through `useToast`. Every coming-soon toast uses the id
  `coming-soon`, which the kit shows once, so a second tap while it is up (on any such control) never stacks.
- Imports no router, store, repository or network client (a test reads the source to pin it). Variants: any `IconButton` variant.
- For a control that is not a round icon (a row, a text button), use `useComingSoon(thing)` as its `onPress` and give it the
  same role/hint/id by hand.

## Device checks for the owner

1. Home light, 100% text: the search disc sits at the right of the sync chip, both vertically centred; with nothing to sync
   only the disc shows. Compare the date/greeting position with `home.png`.
2. The name ("Marta") is coral (`accentText`) and serif italic.
3. Tap search: one toast "Search is coming soon" above the tab bar (is it clear of the sheet at peek, half?); tap twice
   quickly: still one toast. TalkBack/VoiceOver read "Search, button, Not available yet".
4. Move the globe: the recentre disc appears at the left margin about 20 dp under the header; it does not move the planet.
5. Text size 1.15 and larger: chip above search, right-aligned, 8 dp apart; the greeting wraps to two lines at most.
6. Offline: chip with the wifi-off glyph, the banner under the greeting. Dark theme and increased contrast: search disc and chip
   are legible over the sky.
