# Data Model: Sunrise Passport UI

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This feature adds **no table, column, migration, endpoint, wire field, synchronised record or stored
preference**. Everything below is a build-time constant, in-memory presentation state, or a **derived view
model**: a pure function of rows already in the encrypted local store (`trips`, `trip_stops`, `photos`,
`expenses`, `documents`, `countries`, `cities`) and of the session profile. Each derived model states its
**visibility posture**: _private, local, never transmitted, nothing new stored_.

## 1. Palette and Theme (build-time)

The authoritative colour source stays `apps/mobile/src/theme/palette.data.js`, typed by `palette.ts`
(feature 004 D4-04). Hex strings, one set per theme. The Sunrise values replace the Atlas values; the exact
values and their measured contrast are in [contracts/design-tokens.md](./contracts/design-tokens.md) C5-3.

```ts
type PaletteName = 'light' | 'dark' | 'light-contrast' | 'dark-contrast'; // unchanged names

interface Palette {
  // Surfaces
  canvas: string; // behind sheets
  surface: string; // "paper": screens, sheets, cards
  surfaceSecondary: string; // "cream": tiles, fields, raised rows (needs a hairline)
  sand: string; // decorative only: dashes, perforation, tracks (gate-exempt as a boundary)
  overlay: string; // sheets and menus (= surface)
  pressed: string; // pressed fill; only `ink` text sits on it
  // Lines
  hairline: string; // decorative divider and card edge (explicit boundary in contrast themes)
  grab: string; // sheet handle, graphic at 3:1
  border: string; // field boundary, 3:1
  focus: string; // focus ring, 3:1
  backdrop: string; // scrim behind form sheets (gate-exempt)
  // Ink
  ink: string;
  muted: string; // secondary text ("ink-2")
  subtle: string; // tertiary text, placeholder ("ink-3")
  onInk: string; // label on an ink fill (selected chip, segment)
  // Coral: the one thing to do, and "now"
  accent: string; // primary fill
  accentInk: string; // label on the accent fill (navy, never white)
  accentPress: string;
  accentLine: string; // graphic at 3:1: edge ring, active node, bars, arcs
  accentText: string; // coral as text or icon
  accentTint: string; // soft chip fill
  // Aqua: water and "only you"
  aqua: string; // fills only
  aquaLine: string;
  aquaInk: string;
  aquaTint: string;
  // Amber: planned
  amber: string; // fill or ring on photographs
  amberLine: string; // planned graphic on paper
  amberInk: string; // planned text on its tint
  amberTint: string;
  // States
  danger: string; // text, icon, or fill under `dangerInk`
  dangerInk: string;
  dangerTint: string;
  success: string; // text and icon ("success ink")
  successTint: string;
  // Trip status and sync (kept keys, new values)
  statusActive: string; // = accentLine
  statusPlanning: string; // = amberLine
  statusPlanningInk: string; // = amberInk
  statusPast: string; // = muted
  pending: string; // pending-sync marker ink (= amberInk)
  link: string; // = ink (underlined); coral is never a link
  placeholder: string; // = subtle
  // Over photographs (theme-aware where the prototype is)
  onPhoto: string; // always #FFFFFF, opaque
  scrimButton: string; // floating icon button disc
  scrimButtonLine: string;
  ring: string; // roundel and avatar ring
  // Skeleton and toast
  skeleton: string;
  skeletonHighlight: string;
  toastSurface: string; // dark in every theme; its action is `accentPress`
  toastInk: string;
  // Stamp inks and generated-cover stops (theme-aware, see C5-3)
  stampCoral: string;
  stampNavy: string;
  stampTeal: string;
  stampGreen: string;
  cover1Start: string;
  cover1End: string;
  cover2Start: string;
  cover2End: string;
  cover3Start: string;
  cover3End: string;
}
```

**Key mapping from feature 004** (so the generated kit variables and `Colors` keep working until Phase 10):

| 004 key                                                                        | 005                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `canvas`, `surface`, `surfaceSecondary`, `overlay`                             | kept, new values                                            |
| `surfaceTertiary` (pressed fill, skeleton base)                                | **removed**; the kit's `--surface-tertiary` reads `pressed` |
| `separator`                                                                    | renamed `hairline`                                          |
| `backdrop`, `ink`, `muted`, `placeholder`, `border`, `focus`                   | kept, new values                                            |
| `accent`, `accentInk`, `link`                                                  | kept; `accentInk` is navy; `link` is `ink`                  |
| `danger`, `dangerInk`, `success`                                               | kept; `successInk`, `warning`, `warningInk` **removed**     |
| `statusPlanning`, `statusPlanningInk`, `statusActive`, `statusPast`, `pending` | kept, new values                                            |
| everything else in the interface above                                         | **new**                                                     |

**Invariants**

- All four themes define every key (the generated CSS fails to build and a unit test fails otherwise).
- `paper` (`surface`) is `#FFFFFF` in `light` and `light-contrast`, and `onInk` is `#FFFFFF` in the light
  contrast variant and `ink` is `#FFFFFF` in `dark-contrast`. The 004 invariant "no pure white in the base
  themes" is superseded (spec, Amendments); no base theme uses pure `#000000`.
- Tints in the dark themes are `#RRGGBBAA` (alpha 16 percent for coral and amber, 14 percent for aqua, danger
  and success); the gate blends them over `surface` and `surfaceSecondary`. Light tints are opaque hex.
- `statusActive`, `statusPlanning` and `statusPast` equal the arc colours of `GlobeColors` where both exist
  (the gate asserts it), so a status reads the same on a card and on the globe.
- The Atlas values (accent `#2456C7`, canvas `#F5F2EB`, and the other palette literals of feature 004) occur
  nowhere after Phase 10 (SC-001).

## 2. Type roles (build-time)

```ts
type FontFamilyRole = 'display' | 'body' | 'serif'; // Bricolage, DM Sans, Instrument Serif Italic
type TextWeight = 400 | 600 | 700;
type TextSize = 12 | 13 | 14 | 16 | 17 | 22 | 28 | 36 | 40;
type TextRole =
  | 'display'
  | 'numeral'
  | 'title'
  | 'headline'
  | 'callout'
  | 'body'
  | 'label'
  | 'caption'
  | 'eyebrow'
  | 'accent';

interface TextStyleToken {
  family: FontFamilyRole;
  size: TextSize;
  lineHeight: number;
  weight: TextWeight;
  letterSpacingEm: number; // already compensated for the opsz 14 statics (C5-7)
  tabularNumbers: boolean; // only `numeral` and any `*`-tabular context, always in `display`
  uppercase?: boolean; // `eyebrow`
  maxFontSizeMultiplier?: 1.3; // set only on the capped roles (FR-074)
}
```

The 004 roles `largeTitle`, `headline`, `body`, `callout`, `caption` and `numeric` map as: `largeTitle` to
`display` or `title` by context, `numeric` to `numeral`, the rest by name. `ThemedText`'s old `type` values
keep resolving until Phase 10. A test asserts every `tabularNumbers: true` role resolves to a Bricolage
family (DM Sans has no tabular figures).

## 3. Shape, spacing, lifts, motion, icons (build-time)

```ts
const Space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 /* screen margin */, 6: 24, 8: 32, 10: 40 } as const;
const Radius = { sm: 8, md: 12, lg: 16, xl: 24, sheet: 28, full: 999 } as const; // continuous except full
const Lift = { lift1: BoxShadow[], lift2: BoxShadow[] }; // per theme, C5-8
const IconSize = { sm: 16, md: 20, lg: 24 } as const;
const Motion = {
  pressMs: 100, pressScale: 0.97, transitionMs: 200, sheetSpring: { stiffness: 700, damping: 47.6 },
  pinSpring: { stiffness: 800, damping: 33.9 }, countUpMs: 700, countUpStaggerMs: 80,
  stampLandMs: 200, pulseMs: 2400, shimmerMs: 1400, spinStepMs: 5000, spinStepDeg: 20, spinCapMs: 45000,
} as const;
```

The existing `Spacing` table (2, 4, 8, 16, 24, 32, 64) stays as aliases until Phase 10. Depth is two lifts and a
hairline; there is no `Depth` table (004 data-model §3).

## 4. StampSpec (derived)

```ts
type StampShape = 'circle' | 'rect' | 'hex' | 'oct' | 'scallop' | 'oval';
type StampInk = 'coral' | 'navy' | 'teal' | 'green';

interface StampSpec {
  iso2: string; // upper case, from countries.iso_code
  shape: StampShape;
  ink: StampInk;
  rotationDeg: number; // integer, -8 to +8
  wear: 0 | 1 | 2 | 3; // which baked wear mask
  perforated: boolean; // dashed outer ring
  top: string; // city name or country name, upper case, at most 16 characters
  date: string; // YYYY-MM-DD, the first visit (local calendar day); formatted for display only
}
function deriveStamp(iso2: string, firstVisit: string, topText: string): StampSpec;
```

**Determinism (SC-016)**: `h = fnv1a32(iso2.toUpperCase() + '|' + firstVisit)` (integer arithmetic only, no
locale, no random); `shape = SHAPES[h % 6]`, `ink = INKS[(h >>> 3) % 4]`, `rotationDeg = ((h >>> 7) % 17) − 8`,
`wear = (h >>> 12) % 4`, `perforated = ((h >>> 15) & 1) === 1`. The display text of the date uses the device
locale and is not part of the hash. The same country and first-visit date give the same stamp on every device
and launch.

**Source**: the earliest arrival date over the traveller's non-deleted stops in that country, and the city of
that stop. **Visibility posture**: private, local, never transmitted, nothing new stored. The same country
visited again never creates a second stamp.

## 5. CountrySummary and WorldTotals (derived)

```ts
type Continent =
  | 'Africa'
  | 'Antarctica'
  | 'Asia'
  | 'Europe'
  | 'North America'
  | 'Oceania'
  | 'South America';

interface CountrySummary {
  countryId: number;
  iso2: string;
  name: string;
  continent: Continent | 'Unknown'; // 'Unknown' is never counted as a continent
  tripCount: number; // trips with at least one placed stop there
  firstVisit: string; // YYYY-MM-DD, earliest arrival
  lastVisit: string; // YYYY-MM-DD, latest departure
  isNow: boolean; // the active trip's current stop is here
  focus: {
    center: [number, number];
    bounds: [[number, number], [number, number]] | null;
  };
}

interface WorldTotals {
  countries: number; // the existing statistic (every country once, planned trips included)
  countriesOf: 195; // fixed reference (spec: owner question on the denominator)
  trips: number;
  distanceKm: number; // the existing statistic: legs within trips, summed
  continents: number; // distinct, excluding 'Unknown'
  continentsOf: 7;
}
```

`countries` and `distanceKm` are exactly `travelSummary()` of `features/globe/travel-stats.ts` (FR-082): the
feature adds fields beside them and changes nothing in them. A stop in a city this device has not cached
counts for nothing, as there. Grouping and ordering of the list: by continent name ascending, then by name
within it (device collation). **Visibility posture**: private, local, never transmitted.

## 6. Trip list models (derived)

```ts
interface TripCardModel {
  id: string;
  title: string;
  status: TripStatus; // derived by features/trips/trip-status.ts, never the stored column
  stopCount: number;
  cover:
    | TripCover
    | { kind: 'generated'; palette: 0 | 1 | 2; iso2: string | null; initial: string };
  dateRange: { start: string; end: string } | null;
  lengthDays: number | null; // end - start + 1
  country: { iso2: string; name: string } | null; // the first placed stop's country
  dayOf: { day: number; of: number } | null; // active trips only: today - start + 1 of lengthDays
  daysToGo: number | null; // planning trips with dates only: start - today
  strip: Array<'done' | 'now' | 'next' | 'later'>; // one per stop, in order
  distanceKm: number;
  pending: boolean; // is_dirty on the trip or any of its stops
}

type TripListItem =
  | { type: 'hero'; trip: TripCardModel }
  | { type: 'ticket'; trip: TripCardModel }
  | { type: 'row'; trip: TripCardModel }
  | { type: 'yearHeader'; year: number | 'none'; tripCount: number; distanceKm: number };

type TripFilter = 'all' | 'active' | 'planned' | 'past';
function composeTripList(
  trips: TripCardModel[],
  filter: TripFilter,
  today: string,
): TripListItem[];
```

**Rules**: (1) the active trip with the earliest arrival is the `hero`; further active trips follow as `row`s
before the first year header. (2) The planning trip with the earliest start is the `ticket`; other planned trips
are `row`s. (3) The rest are `row`s under `yearHeader`s by the year of `dateRange.start`, newest year first and,
inside a year, newest start first; a trip with no stops is under the header `none` ("No dates yet") first,
newest created first. (4) A filter applies before composition. (5) `getItemType` is `item.type`. The cover rule
is the 004 rule (designated, earliest, then generated). The generated palette is `fnv1a32(tripId) % 3`.
**Visibility posture**: private, local, never transmitted; only a local thumbnail path is read.

## 7. Home sheet and globe fit (in memory)

```ts
type SheetDetent = 'peek' | 'half' | 'full';

interface SheetGeometry {
  windowHeight: number;
  topInset: number;
  bottomInset: number;
  tabZone: number; // pill height + its bottom offset (88 on a 390 by 844 phone)
  headerBottom: number; // measured at runtime
}
function detentHeight(d: SheetDetent, g: SheetGeometry, rowHeight: number): number;
// peek = 28 (grab zone) + rowHeight + tabZone + 16; half = max(0.52 * windowHeight, peek + 120);
// full = windowHeight - (topInset + 10)

interface GlobeFit {
  radius: number;
  centreX: number;
  centreY: number; // for tests and screenshots
  padding: { top: number; bottom: number; left: 0; right: 0 }; // handed to the camera
  zoomDelta: number; // log2(freeBand / fullHeight), clamped to GlobeCamera.minZoomLevel
}
function globeFit(
  d: SheetDetent,
  windowWidth: number,
  headerBottom: number,
  sheetTop: number,
): GlobeFit;
// peek: radius = clamp((band - 24) / 2, 110, 175), centred in the band; others: clamp(0.95 * band, 150, 286)
```

The detent is held in a non-persisted store and starts at `half`. **Nothing is persisted.**

## 8. SyncChipState (derived)

```ts
type SyncChipState =
  | { kind: 'synced' }
  | { kind: 'waiting'; count: number }
  | { kind: 'syncing'; count: number }
  | { kind: 'offline'; count: number }
  | { kind: 'failed'; count: number };
```

`count` is the number of rows with `is_dirty = true` across the seven synchronised tables; `offline` comes from
the network state; `syncing` and `failed` from the sync runtime's existing status. The chip reads these; it
queries nothing new and writes nothing.

## 9. Passport and day models (derived)

```ts
type PassportPeriod = 'all' | number; // a calendar year with at least one trip

interface PassportTotals extends WorldTotals {
  lapFraction: number;
} // distanceKm / 40075
function passportTotals(trips, period: PassportPeriod): PassportTotals;
// a trip belongs to the year of its first arrival (local calendar day); countries and continents
// are counted once within the period

interface TripDay {
  index: number;
  date: string;
  isToday: boolean;
  stopIds: string[];
}
interface StopLeg {
  fromStopId: string;
  toStopId: string;
  km: number | null;
} // null if either end is unplaced

interface SpendingSummary {
  totalHome: string; // decimal string, decimal.js sum of amount_home
  pendingCount: number; // rows with fx_pending, excluded from the total and counted
  perDay: Array<{ date: string; totalHome: string }>;
  perCategory: Array<{ categoryId: string; totalHome: string; share: number }>;
  averagePerDay: string | null; // totalHome / elapsed days (active) or length (past)
  ratesAsOf: string | null; // the FX snapshot's as_of, said in words by the screen
}
```

All sums use `decimal.js` and wire decimal strings; no `Number` touches an amount (AGENTS.md).
`SpendingSummary` is derived from `expenses` of ONE trip and is never exposed beyond the Expenses screen
(FR-084).

## 10. Generated cover (derived)

`{ palette: 0 | 1 | 2; iso2: string | null; initial: string }`: three gradients (`cover1..3` start and end
tokens, white text measured at least 5.05:1 on every stop), the country's code as a large ghost glyph, the
flag chip and a dashed stamp outline. Shown wherever the 004 cover rule yields no photograph.

## 11. In-memory presentation state (no persistence)

| State                         | Where it lives                            | Notes                                                                    |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------ |
| Home sheet detent             | A small non-persisted store               | Starts at `half`; read by the camera and the pill's fade                 |
| Idle spin state               | `useIdleSpin()` refs                      | Stops on touch, sheet above half, blur, background, 45 s, reduced motion |
| Stamps landed this session    | A module-level `Set`                      | "Earned in the last 7 days and not yet landed in this session"           |
| Count-up played               | Per mount                                 | Final text under reduced motion                                          |
| Trips filter, Countries query | Component state                           | Reset when the screen unmounts                                           |
| Active theme                  | `useAppearance()` then `Uniwind.setTheme` | Unchanged from 004 (single resolver)                                     |

## 12. What does not change

`packages/contracts`, `apps/api`, `apps/mobile/src/db/schema.ts` and the migrations, the sync engine, every
repository write path, the globe's geometry, journey, arc and statistics code, and every privacy rule. The
only repository reads added are two local queries (the earliest arrival per country and trip counts per country
for the Countries list, and dirty-row counts for the sync chip), both read-only and both derived from existing
tables. **Visibility posture of the feature**: private, local, never transmitted.
