# F11 Offline maps: as built

Branch `feat/f11-offline-maps` (from `feat/f7-photos`). Task T552 (OfflineCityCard, StorageBar). Pictures:
`screens/more/offline-maps.png`, `offline-maps-dark.png`; prototype `extra/screens.css` (`.stor`, `.sthead`, `.stbar`,
`.legend`, `.mrow`, `.mthumb`, `.mact`), `extra/src/frames/offline-maps.html`.

## Fidelity audit (picture vs code)

| Item in the picture                                                | State                 | How                                                                                                                                                   |
| ------------------------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back, title "Offline maps", subtitle                               | Done                  | shared `AreaHeader`; the native header of the route is hidden (`trip/[id]/_layout.tsx`)                                                               |
| Cream storage card, "412 MB used by maps", free space at the right | Done, wording differs | `StorageBar`; "used by this trip's maps" (the sum is this trip's finished maps, not the whole device); free space from `freeDiskBytes()` or not drawn |
| 12 dp segmented bar, legend                                        | Partly                | Maps and Free only; no "Photos waiting" segment (the store has no byte size for pending photos); no free reading means no bar and no legend           |
| "For your trips" with a row per trip                               | Adapted               | the screen is one trip's: "For <trip name>" with a row per city (a city visited twice once)                                                           |
| 72 dp map tile (coral box dashed, solid and filled when saved)     | Done, no geography    | `OfflineMapTile`: sea tint, graticule, the box; invented coastlines are not drawn                                                                     |
| Name, places, size                                                 | Done                  | city, country, status chip with the real size (`offline-status-<id>`); a map not saved shows no size                                                  |
| "Map >" link                                                       | Coming soon (Q-11)    | `useComingSoon`, one toast                                                                                                                            |
| Amber date chip of a planned trip                                  | Not drawn             | rows are cities and have no date                                                                                                                      |
| "Downloaded" pill / outlined "Download 240 MB"                     | Done                  | state chip, real Download / Try again / Stop; no size on Download (never invented)                                                                    |
| Unplaced-stops note                                                | Kept                  | `offline-unplaced`                                                                                                                                    |
| "Downloaded" list with the trash icon                              | Done, real            | finished maps move there; the trash is the real Remove, after the confirmation; no "updated <date>" (no date is stored)                               |
| FAB "New area"                                                     | Coming soon (Q-11)    | shared `AreaFab`, one toast                                                                                                                           |

Kept ids and names: `offline-maps-screen`, `offline-maps-title`, `offline-storage`, `offline-unplaced`,
`offline-status-<id>`, `offline-download-<id>`, `offline-stop-<id>`, `offline-remove-<id>`, `offline-city-<id>`,
`offline-actions-<id>`; Back is named "Back" (`e2e/04-zoom.yaml` flow unchanged and still resolves). New ids:
`offline-maps-header/subtitle/scroll/trip/note`, `offline-all-saved`, `offline-tile-<id>`, `offline-storage-*`,
`coming-soon-offline-map-<id>`, `coming-soon-offline-new-area`.

## Changes

- `features/trips/offline-packs.ts`: `splitByPack` (additive). `offline-storage.ts`: `storageFigures` (additive).
  `lib/disk-space.ts`: `freeDiskBytes`. No download behaviour changed.
- `components/trip/storage-bar.tsx`, `offline-map-tile.tsx`, `offline-maps-skeleton.tsx` (new);
  `offline-city-card.tsx` (a row, not a card); `app/trip/[id]/offline-maps.tsx`.
- Byte text uses the existing `formatPackSize` (no Intl feature Hermes lacks).
- Resume: the interrupted session's work was coherent; I fixed two failing tests (palette assertion, `screen.root`
  API), removed three unresolved testID forwards (baseline check green, count unchanged) and replaced a setState in
  an effect with a render-time re-read (`useFreeDisk`).

## Deviations

"Photos waiting" segment, trip date chip, "updated <date>" and "Download <size>" are not drawn (no data). Wording
"used by this trip's maps". Tile without land outlines.

## DEVICE checks for the owner

1. Compare light, dark and both contrast themes with the pictures; text scale 1.5 and 2 (rows and the head wrap).
2. Android: FAB clearance over the gesture bar; free-space figure shown (Paths.availableDiskSpace).
3. Download a city, watch it move to "Downloaded" and the bar grow; remove it with the trash icon.
4. Airplane mode: the screen and saved maps still work.

## Steps finished

- 787689e helpers `splitByPack`, `storageFigures`, `freeDiskBytes`; tests in `test/features/offline-*.test.ts`, `test/lib/disk-space.test.ts`.
- c6c1afa row, tile, `StorageBar`, skeleton; tests `src/components/trip/storage-bar.test.tsx`, `offline-maps-skeleton.test.tsx`.
- 0cfcb03 the screen and the hidden native header; tests `test/app/offline-maps*.test.tsx`, `trip-layout.test.tsx`, `test/ui-kit/offline-maps-real-render.test.tsx`.

Gates on the final tree: jest 350 suites, 8690 passed, 3 skipped; tsc, eslint (0 warnings), testid baseline, theme check, prettier green.
