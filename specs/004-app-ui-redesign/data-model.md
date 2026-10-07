# Data Model: App UI Redesign ("Atlas")

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This feature adds **no table, column, migration, endpoint, wire field or synchronised record**. The
only data it touches is read-only and derived on the device. Everything below is in-memory
presentation state or a build-time constant.

## 1. Palette and Theme

The authoritative colour source (`apps/mobile/src/theme/palette.ts`). Hex strings, one set per theme.

```ts
type ThemeName = 'light' | 'dark' | 'light-contrast' | 'dark-contrast';

interface Palette {
  // Neutral ramp
  canvas: string; // app background (grouped-list ground)
  surface: string; // cards, rows
  surfaceSecondary: string; // field fill, segments
  surfaceTertiary: string; // pressed fill, skeleton base
  overlay: string; // sheets, menus
  separator: string; // decorative hairline (gate-exempt)
  backdrop: string; // scrim behind sheets (gate-exempt)
  // Ink
  ink: string; // primary text
  muted: string; // secondary text
  placeholder: string; // field placeholder
  // Accent and states
  accent: string;
  accentInk: string; // label on an accent fill
  link: string;
  border: string; // 3:1 boundary for fields and outlined controls
  focus: string; // focus ring
  danger: string;
  dangerInk: string;
  success: string;
  successInk: string;
  warning: string;
  warningInk: string;
  // Trip status (shared with the globe's connection hues)
  statusPlanning: string;
  statusPlanningInk: string; // chip label, darker in light themes
  statusActive: string;
  statusPast: string;
  // Sync
  pending: string; // pending-synchronisation marker
}
```

**Invariants**

- All four themes define every key (the generated CSS fails to build, and a unit test fails, if one is
  missing).
- `statusActive` equals `GlobeColors[theme].active` in `light` and `dark`; `statusPlanning` equals
  `GlobeColors[theme].planning`; the increased-contrast themes reuse the base hue at a higher ratio.
- No key is pure `#000000` or `#FFFFFF` in the base themes (tinted neutrals); the increased-contrast
  themes may approach them but are tinted by a hair.
- The existing `Colors` constant is re-pointed at this source with its keys preserved until phase 7.

## 2. Type scale

```ts
interface TextStyleToken {
  family: 'system' | 'display' | 'displayBold';
  size: 12 | 14 | 16 | 22 | 32; // plus iOS headline 17
  lineHeight: number;
  weight: 400 | 500 | 600 | 700;
  tabularNumbers: boolean;
}
type TextRole =
  'largeTitle' | 'title' | 'headline' | 'body' | 'callout' | 'caption' | 'numeric';
```

`ThemedText`'s existing `type` values (`title`, `subtitle`, `default`, `small`, `smallBold`, `link`,
`linkPrimary`, `code`) map onto these roles in the shim; no call site changes in phase 2.

## 3. Shape, spacing, motion

```ts
const Radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const; // continuous curve except pill
const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const; // kept
const Motion = { pressMs: 100, transitionMs: 200, listEntranceMs: 150 } as const;
```

Depth is two levels (canvas; raised card) plus overlays; there is no `Depth` table.

## 4. TripCover (derived view model)

Computed per trip in `useTrips()` from local rows; never stored, never sent.

```ts
type TripCover =
  | { kind: 'photo'; photoId: string; thumbnailUri: string } // cover_photo_id, else earliest photo
  | { kind: 'typographic'; initial: string; status: TripStatus }; // no usable photo
```

**Resolution** (first match wins):

1. `trips.cover_photo_id` names a photo row that is not deleted and whose `thumbnailUri(local_file_uri)`
   is non-null.
2. The trip's non-deleted photo with the earliest `taken_at` (falling back to `created_at`) that has a
   thumbnail.
3. Typographic: the first letter of the title and the trip's derived status.

**Failure handling**: a thumbnail that fails to draw falls back to `typographic` for that card without
changing the list's layout (same `onError` pattern as `PhotoTile`).

**Visibility posture**: private. Source rows are the signed-in traveller's own local `trips` and `photos`
rows; only a local thumbnail path is read; nothing is added to any sync payload.

## 5. TripSummary (extended)

```ts
interface TripSummary {
  trip: TripRow;
  stopCount: number;
  status: TripStatus;
  cover: TripCover; // new
  dateRange: { start: string; end: string } | null; // new, YYYY-MM-DD from placed stops, local calendar day
}
```

`dateRange` is the minimum arrival and maximum departure over the trip's active stops, or `null` with no
stops. It is formatted for display by the existing `formatIsoDate` helper (local calendar day, never UTC;
AGENTS.md "Date arithmetic").

## 6. Adapter state (no persistence)

| State           | Where it lives                            | Notes                                                                                         |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Active theme    | `useAppearance()` then `Uniwind.setTheme` | Single resolver (002 C4); never read twice                                                    |
| Press state     | Per control                               | Discrete, no interpolation required for the 100 ms budget                                     |
| Busy, disabled  | Per control props                         | Mutually exclusive; throws in development when both are set, as `PressableSurface` does today |
| Haptics enabled | Derived                                   | `!prefersLessMotion`                                                                          |

## 7. What does not change

`packages/contracts`, `apps/api`, `apps/mobile/src/db/schema.ts` and migrations, the sync engine, the
repositories' write paths, and every privacy rule. The only repository change is one read query for the
earliest photo per trip (T419).
