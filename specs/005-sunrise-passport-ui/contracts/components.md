# Contract: Component Adapter Layer (Sunrise Passport)

**Feature**: `specs/005-sunrise-passport-ui` | **Consumers**: every screen | **Supersedes**: the look, sizes and
variants in `specs/004-app-ui-redesign/contracts/components.md` C4-7 to C4-9 (its adapter boundary C4-6 and its
"As built" accessibility guarantees are **inherited**: they are style-independent and still hold unless this
document restates them).

The adapter layer is `apps/mobile/src/components/ui/` plus, for navigation chrome, `components/navigation/`.
Screens import UI primitives only from there. Only that folder imports `heroui-native`, `uniwind` components,
`phosphor-react-native`, `expo-glass-effect`, `react-native-zoom-toolkit` and `react-native-view-shot`.

Test identifiers: **every pre-existing `testID` and accessible name is preserved** (FR-081, SC-003). Where a
component is new, its identifiers are listed here and per screen in `screens.md`.

---

## C5-13. Adapter boundary (inherits C4-6; extended)

1. Screens and feature components import UI primitives **only** from `@/components/ui/*` and
   `@/components/navigation/*`.
2. Only those folders import the kit, Phosphor, the glass module, the zoom toolkit and view-shot; the
   `no-restricted-imports` rule and `adapter-guards.test.ts` list them.
3. Adapters take the app's own props, require an accessible name on every control and forward `testID` to the
   node a test or Maestro finds it by.
4. Fallbacks swap internals without touching a screen: glass to blur to solid (C5-21); Phosphor to the
   platform symbols (D5-07); the zoom toolkit to a custom viewer (D5-13); view-shot roundels to dots and
   `MarkerView` (D5-04).
5. Every component is exercised in `app/(dev)/gallery.tsx` (T524) in four themes at font scale 1 and 2.

---

## C5-14. `Icon` (registry over Phosphor)

```tsx
<Icon name="globe" size={24} weight="regular" tone="ink" label? decorative? testID? />
```

`name` is a registry key (`icon-registry.ts`, about 60 deep imports, never the barrel). `size` 16, 20 or 24;
`weight` `regular` (default), `fill` or `duotone`; `tone` a palette key (`ink`, `muted`, `accentText`, …,
resolved per theme, so the contrast themes need no promotion). Decorative icons are hidden from assistive
technology; a meaningful one (`label`) is announced as an image. Mirroring: a direction glyph (chevron, arrow)
mirrors when the layout direction is reversed. Brand glyphs (Google, Apple) stay in `brand-glyph.tsx`.

---

## C5-15. `Tappable` and `Button`

```tsx
<Button
  variant="primary" | "secondary" | "tonal" | "ghost" | "destructive"      // FR-006
  size="md" | "lg" | "sm"                                                  // 52 / 56 / 44 dp minimum
  accessibilityLabel                                                       // required
  busy? disabled? icon? iconOnly? onPress testID? >label</Button>
```

| Variant       | Look (light)                                                                              | Pressed                       | Disabled                    |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | --------------------------- |
| `primary`     | `accent` fill, `accentInk` label, 1.5 dp `accentLine` edge ring (2 dp in contrast themes) | `accentPress` fill, scale .97 | `sand` fill, `subtle` label |
| `secondary`   | transparent, 1.5 dp `ink` outline, `ink` label                                            | `surfaceSecondary` fill       | outline `border`, `subtle`  |
| `tonal`       | `surfaceSecondary` fill, hairline, `ink` label                                            | `pressed` fill                | as secondary                |
| `ghost`       | no fill, `ink` label, 44 dp minimum                                                       | `pressed` fill                | `subtle` label              |
| `destructive` | `dangerTint` fill, `danger` label, always icon and verb                                   | `pressed` fill                | `subtle`                    |

**Guarantees (inherited from C4-7, restated)**: role `button`; `accessibilityState` carries `disabled` and
`busy`; minimum target 44 pt (iOS) or 48 dp (Android) scaled by the font scale so large text grows the control
(a minimum, never a fixed height); focus ring 2.5 dp with a 2 dp offset gap at 3:1 (P13); pressed within 100 ms
(scale .97 and fill; fill only under reduced motion); busy shows a spinner, keeps its label and ignores presses;
`busy` and `disabled` together throw in development. **Haptics**: `primary` plays the light impact,
`destructive` the warning notification; none under reduced motion. At most one `primary` per screen state
(review rule). The primary ring token is gated by P15. The label is `callout` (display 600, 17 / 22), `sm` is
`label` (14 / 20). Corner radius full (Android floating `lg`: 16).

`Tappable` is the bare form (no fill, `pressed` fill, the ring, the target) used by cards, rows, tabs and icon
buttons. Icon buttons (`iconOnly`) are 44 dp circles: `paper` with `lift1` (default), `tonal`, `ghost`, `glass`
(on photographs: `scrimButton` disc with `scrimButtonLine`, `onPhoto` icon) and `onSky` (92 percent paper, over
the globe).

---

## C5-16. Chips, pills, segmented control, status and sync

| Adapter         | API                                                                                      | Look and states                                                                                                                                                                                               | Accessibility and ids                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Chip`          | `label`, `accessibilityLabel`, `selected?`, `onPress?`, `leading?`, `disabled?`          | 40 dp visible, 44 dp hit; `surfaceSecondary` + hairline; selected = `ink` fill, `onInk` label and a check; dashed variant for "add"                                                                           | role `button` (or radio inside `ChipGroup`), `selected` and `checked`; selection haptic on change, not on re-press                 |
| `ChipGroup`     | as 004 (`options`, `selectedKey`, `onSelect`, `scroll?`)                                 | one sideways row, no scroll bar; a fade at the clipped edge                                                                                                                                                   | keeps `radiogroup` and `radio`, every existing id (`currency-<CODE>`, `currency-other-toggle`, …)                                  |
| `SegmentedPill` | `options[{ key, label, count?, testID, accessibilityLabel }]`, `selectedKey`, `onSelect` | track radius full, padding 4, thumb = track − 8 (concentric), min 36 dp (32 small); selected = `ink` fill; counts tabular                                                                                     | `tablist` and `tab`, or `radiogroup`; counts are part of the name ("Active, 1"); used for the trips filter and the passport period |
| `StatusChip`    | `status: 'planning' \| 'active' \| 'past'`, `dayOf?`                                     | 13 / 18 caption, icon and text; `active`: `surfaceSecondary` + hairline, coral live dot, "Active" (and "· Day 3 of 8" in the hero); `planning`: `amberTint` + `amberInk`; `past`: `surfaceSecondary`, `muted` | keeps `status-pill-<status>` and the label "Status: …"; the words stay Planning, Active, Past                                      |
| `SyncChip`      | `state: SyncChipState`, `onRetry?`                                                       | 36 dp, 92 percent paper + `lift1`; `waiting` cloud-up and count; `syncing` spinner; `offline` wifi-off (`amberInk`) and count; `failed` `dangerTint`, `danger` edge, verb "Retry"; `synced` hidden            | one per screen; announced "3 changes waiting to sync" or "Sync failed, retry"; id `sync-chip`; 4 dp hit slop                       |
| `SyncBadge`     | `state: 'pending' \| 'syncing' \| 'failed'` (per record)                                 | icon and text; glyph-only on photographs inside a 24 dp `scrimButton` disc, white and `danger` for failed                                                                                                     | keeps its ids and text equivalents ("Not yet synced", "Sync in progress", "Sync failed")                                           |
| `FlagChip`      | `iso2`, `size?: 'md' \| 'lg'`                                                            | 20 by 14 (28 by 20) rounded 3 (4) box with a hairline; flag glyph, else the two letters                                                                                                                       | decorative; hidden from assistive technology (the country name is beside it)                                                       |
| `PrivacyChip`   | `label?: 'Only you'`                                                                     | lock icon, `aquaTint`, `aquaInk`                                                                                                                                                                              | announced "Only you can see this"; id `privacy-chip`                                                                               |

### As built (T518 to T520)

What the code does where it differs from, or adds to, C5-14 to C5-16. The three tasks are one branch,
`feat/005-adapters-core`; the files are under `apps/mobile/src/components/ui/`.

**`Icon` (C5-14, T518).** `icon-registry.ts` imports 63 icons by deep path (`phosphor-react-native/src/icons/<Name>`,
the only subpath the package's `exports` map serves; the bare package is refused under Jest and the registry source
is read by `icon-registry.test.tsx` to prove it never appears) and names them with app words: `ICONS`, `ICON_KEYS`,
`IconKey`, `isIconKey`, `DIRECTIONAL_ICONS`. The keys, by group:

| Group                    | Keys                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab bar, headers, cues   | `globe`, `suitcase`, `user`, `user-circle`, `chevron-left`, `chevron-right`, `chevron-up`, `chevron-down`, `arrow-left`, `arrow-right`                                     |
| Actions                  | `plus`, `minus`, `x`, `check`, `search`, `pencil`, `trash`, `share`, `ellipsis`, `refresh`, `undo`, `download`, `locate`, `log-out`, `settings`, `grip`, `stop-circle`     |
| Status and feedback      | `check-circle`, `alert` (a circle, the one "something is wrong" glyph), `warning` (a triangle), `info`, `question`, `clock`, `calendar`, `lock`, `shield-check`, `eye-off` |
| Sync and network         | `cloud-upload`, `cloud-check`, `cloud-off`, `sync`, `wifi`, `wifi-off`                                                                                                     |
| Content                  | `image`, `images`, `camera`, `note`, `file-text`, `wallet`, `map`, `map-pin`, `route`, `stamp`, `tag`, `mail`, `sparkle`                                                   |
| Categories and transport | `plane`, `car`, `tram`, `bed`, `fork-knife`, `ticket`, `shopping-bag`                                                                                                      |

- `DIRECTIONAL_ICONS` (mirrored when `I18nManager.isRTL`, through Phosphor's own `mirrored` prop, which is a
  `scaleX: -1` transform): `chevron-left`, `chevron-right`, `arrow-left`, `arrow-right`, `log-out`, `undo`.
- `IconName` is `IconKey`; `IconSize` is `16 | 20 | 24` (the values of `IconSize` in `shape.ts`); `weight` is
  `regular` (default), `fill` or `duotone`. `tone` names a palette key (`ink` default, `muted`, `subtle`, `onInk`,
  `onPhoto`, `accentInk`, `accentText`, `accentLine`, `aquaInk`, `aquaLine`, `amberInk`, `amberLine`, `danger`,
  `dangerInk`, `success`). The 004 names stay as aliases until Phase 10, each on a token that passes: `default` is
  `ink`, **`accent` is `accentText`** (never the coral fill, 2.82:1 on paper in `light`: the gap the tokens
  task left), `onAccent` is `accentInk`, `statusActive` is `accentLine`, `statusPlanning` and `pending` are
  `amberInk`, `statusPast` is `muted`. `icon.test.tsx` reads the generated stylesheet in all four themes and asserts
  every tone paints its palette key and that none resolves to the coral fill.
- **The codemod** (a one-shot node script, not committed) rewrote every `{ ios, android }` literal at 47 files to a key.
  The mapping, for the record: `suitcase` and `luggage` to `suitcase`; `chevron.backward` and `.left` to `chevron-left`;
  `.forward` to `chevron-right`; `.up` and `.down` to `chevron-up` and `chevron-down`; `photo`, `photo.on.rectangle` and
  `photo.badge.plus` to `images`; `creditcard` to `wallet`; `note.text` to `note`; `doc.text` to `file-text`;
  `rectangle.portrait.and.arrow.right` to `log-out`; `globe.europe.africa` (and `.fill`) to `globe`;
  `person.crop.circle` (and `.fill`) to `user-circle`; `wifi.slash` to `wifi-off`; `fork.knife`, `bed.double`, `tram`,
  `ticket`, `bag` to `fork-knife`, `bed`, `tram`, `ticket`, `shopping-bag`; `airplane` to `plane`; `icloud.slash` to
  `cloud-off`; `arrow.down.circle` to `download`; `checkmark.circle` to `check-circle`; `arrow.clockwise` to `refresh`;
  `icloud.and.arrow.up` to `cloud-upload`; **`exclamationmark.triangle` to `alert`** (so `ALERT_ICON` is `alert`, the
  circle of the prototype); `xmark` to `x`; `line.3.horizontal` to `grip`; `location.fill` to `map-pin`;
  `arrow.triangle.2.circlepath` to `sync`; `clock` to `clock`. The tab bar draws `regular` at rest and `fill` when
  selected, and its profile tab is `user` (the signed-out card of the first-sync gate is `user-circle`).
- Tests read a glyph by registry key, never by Phosphor name: `test/helpers/icons.ts` (`glyphsIn`, `glyphNamesIn`,
  `glyphId`, `anyGlyph`) over `screen.toJSON()`, because RNTL 14 queries host nodes only. No source file imports
  `expo-symbols` any more (a test scans `src/`); the dependency stays installed as the fallback of D5-07.

**`Button`, `Tappable`, `IconButton` (C5-15, T519).**

- `Button` is a React Native `Pressable` painted from tokens, not a wrapper over the kit's Button: the kit's variants
  mix the coral into their labels (the five gaps of the 004 gate), fix a height per size and animate through
  Reanimated, none of which the Sunrise variants want. The kit still supplies `Spinner`, `Text` and the theme colours.
  `variant` is `primary | secondary | tonal | text | destructive` (**`text` is the contract's `ghost`**: the call sites
  already say `text`); `size` `sm | md | lg` is 44, 52 and 56 dp as MINIMUMS, raised to the platform floor and scaled by
  the font scale; the label is `callout` (`sm` is the semibold `label`).
- `button-look.ts` is the table of palette KEYS (fill, label, edge) for each variant and state, so "only ink on a
  pressed fill" is a property of data: `primary` rests on `accent` with `accentInk` and the `accentLine` ring (1.5 dp,
  2 dp in the contrast themes, `PrimaryEdgeRing`) and is held on `accentPress` with `accentInk`; `secondary` is a 1.5 dp
  `ink` outline, held on `surfaceSecondary`; `tonal` is `surfaceSecondary` with a hairline, held on `pressed`; `text`
  and `destructive` are held on `pressed`. A held `destructive` label turns to `ink` (P6 gates `ink` on `pressed` and
  nothing else). Busy is the pressed coral for a primary and the resting look otherwise, with the spinner; disabled is
  flat `sand` with a `subtle` label (primary) or a `border` outline (secondary, tonal). The edge keeps its width in
  every state (the colour goes transparent), so a press or a disabled state moves no pixel.
- Press: the fill swaps at once and the button scales to .97 through `pressScaleOf`; reduced motion keeps the fill. The
  scale is a transform on touch-down, not an animation (like `Tappable`'s fill): inside the 100 ms budget with nothing
  for reduced motion to remove.
- **Haptics.** `useHaptics` has `selection`, `success` and `warning` on this branch (T523 adds the semantic map with
  `impact`). A `primary` press therefore plays `selection`, a `destructive` one `warning`, in one table
  (`PRESS_HAPTIC` in `button.tsx`); switching the primary to `impact('light')` is that table's one line.
- The host node still carries `variant`, `size` and `isIconOnly` as marks, under the kit's old names (`primary`,
  `secondary`, `tertiary` for tonal, `ghost` for text, `danger-soft` for destructive), because some twenty screen suites
  count a screen state's primaries by reading `button.props.variant` (review rule 2). Native ignores props a view does
  not know.
- Cost in a list: the font scale is `useWindowDimensions`, the two accessibility flags (reduced motion, increased
  contrast) come from `useAccessibilityFlags` (the shared store alone, no colour-scheme subscription), and the colours are
  ONE `useThemeColor` call by palette key: `theme-tokens.ts` (`TOKEN_OF`, `useColors`) is the table from a key to the
  kit or app variable generated from it, read against the stylesheet in all four themes by `theme-tokens.test.tsx`.
- `Tappable` keeps its API; its held fill is `surface-tertiary` (the palette key `pressed`) instead of the kit's 15
  percent mix, and its ring is the shared `focus-ring.ts` (`focusRingStyle`, `useFocusRing`: 2.5 dp, 2 dp outside).
- `IconButton` (`icon-button.tsx`, new): `variant` `default` (paper, `lift1`), `tonal` (cream, hairline), `ghost`,
  `glass` (`scrimButton` disc, `scrimButtonLine`, `onPhoto` icon: a held press draws the focus ring and keeps the disc,
  the `feedback="ring"` rule of 004 T442) and `onSky` (92 percent paper, `lift1`). A 44 dp circle, a fixed size, with
  slop to the platform floor; `busy`, `disabled`, `testID`, `<testID>-icon` and `<testID>-spinner` as `Button`. `liftStyle`
  (`lift-style.ts`) is `boxShadow` from `Lift` with the `elevation` fallback below Android 9.
- Gate: `test/theme/adapter-pressed-fills.test.ts` now measures `Button`, `IconButton`, `Tappable`, `Chip` and
  `SegmentedPill` in all four themes with **no exception list** (the five `LEGACY_LABEL_GAPS` and the selected-chip gap are
  deleted); `test/ui-kit/pressed-fills-chip-row-card.test.ts` keeps only the row and the card, whose `muted on pressed`
  gap in `light-contrast` stays enumerated for T521. `button-class-merge.test.ts` pinned kit facts the adapter no longer
  relies on and is deleted; `button-busy.test.tsx` keeps the real-kit `Spinner` check.

**Chips (C5-16, T520).** `chip-look.ts` is the table of keys (`chipLook`, `segmentLook`, `STATUS_LOOKS`,
`SYNC_BADGE_LOOKS`, `PRIVACY_LOOK`); `soft-label.tsx` is the shared tinted capsule (internal); the pairs are measured by
`test/theme/chip-contrast.test.ts`.

| Adapter         | As built                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Chip`          | Adds `dashed` (the "add" chip: no fill, a 1.5 dp dashed `border`). 40 dp visible, slop to the floor (vertical) and 4 dp (sideways). Unselected `surfaceSecondary` and a hairline; selected `ink`, `onInk`, and a check in place of the leading glyph; held, the `pressed` fill with an `ink` label whatever the state. A chip without `onPress` is a `View` role `text`. Label `label` semibold, capped at 1.3.                                                                                                                                   |
| `ChipGroup`     | As 004: `radiogroup`, `radio`, `{ selected, checked }`, selection haptic on a change. **Not built: the fade at the clipped edge** (it is a gradient, and only `Scrim`, T523, may draw one).                                                                                                                                                                                                                                                                                                                                                       |
| `SegmentedPill` | `options[{ key, label, count?, testID, accessibilityLabel }]`, `selectedKey`, `onSelect`, `role` `tablist` (default) or `radiogroup`, `size` `md` (36 dp) or `sm` (32), `accessibilityLabel`, `testID`. A capsule track (padding 4, cream, hairline) of capsule segments; selected `ink` and `onInk`, unselected `muted`, held `pressed` and `ink`; counts tabular. No sliding thumb (the thumb is the selected segment's fill; an animation is T523 or later).                                                                                   |
| `StatusChip`    | `status`, `dayOf?: { day, of }` ("Active · Day 3 of 8", announced "Status: Active, day 3 of 8"). `planning` is `amberTint`, a calendar and `amberInk`; `active` is cream with a hairline and the coral live dot (`status-pill-active-dot`, 8 dp with a 3 dp halo), `ink`; `past` is cream, a check and `muted`. Ids, role, "Status: ..." and the words kept; three shapes, not three hues.                                                                                                                                                        |
| `SyncChip`      | `state: SyncChipState` (exported from `sync-chip.tsx` until T529's `use-sync-chip-state` takes the type), `onRetry?`. 36 dp, 92 percent `surface` with `lift1`, `failed` lays `dangerTint` over the paper (`sync-chip-tint`) with a `danger` edge. Announced "3 changes waiting to sync", "Syncing 3 changes", "Offline, 3 changes waiting to sync" or "Sync failed, retry"; `synced` renders nothing; only `failed` with `onRetry` is a button (4 dp slop, ring).                                                                                |
| `SyncBadge`     | Keeps `SyncBadge`, `SyncBadgeProps`, `SyncState`, `sync-badge-icon`, the three announcements and the three phrases. Pending and syncing are `amberInk` on `amberTint` with a dashed `amberLine` edge, failed `danger` on `dangerTint`, dashed `danger`; the icons are `clock`, `sync`, `alert`. **`glyphOnly`** is the form for a photograph: a 24 dp disc, `scrimButton` with an `onPhoto` glyph, and for failed a `danger` disc with the `dangerInk` glyph (P5; the contract's "white and `danger`" would be white on pink in the dark themes). |
| `FlagChip`      | `iso2`, `size` `md` (20 by 14, radius 3) or `lg` (28 by 20, radius 4), `testID`; `flagGlyph(iso2)` is the regional-indicator pair, `null` for anything that is not two letters, and the box then shows the letters (or `?`) on cream. The box is fixed (`allowFontScaling={false}`), clipped, hairline-edged and hidden from assistive technology. Whether a country's glyph exists on a device is V6 (T512).                                                                                                                                     |
| `PrivacyChip`   | `label?: 'Only you'`; a lock on `aquaTint` in `aquaInk`; announced "Only you can see this"; ids `privacy-chip` and `privacy-chip-icon`.                                                                                                                                                                                                                                                                                                                                                                                                           |

**Kit facts read from source** (`heroui-native` 1.0.10 under `node_modules`): the kit's `Button` root fixes `height` per size
in its stylesheet (10, 12 and 14 spacing steps: 40, 48 and 56 dp), sets `border-width: 0`, and wraps a Reanimated `PressableFeedback` with a
highlight overlay coloured from `accent-hover`, `default-hover`, `danger-hover` and `danger-soft-hover` (read with four
`useThemeColor` calls per button); its `secondary` variant is `bg-default` with an `accent-soft-foreground` label, a mix
of the coral. `useThemeColor` accepts an array and answers an array; Phosphor's `IconBase` takes `mirrored` and puts
`scaleX: -1` on the `Svg`, and tags it `phosphor-react-native-<name>-<weight>`. None of this needed a device.

**Device-only checks left open** (none new beyond the existing V1 to V7; each is a line in T507 to T512 and T547):
the emoji flag glyphs at 20 by 14 dp on both platforms (V6; `flagGlyph`'s size and line height are starting values), the
`outline` focus ring of every control at the clipped edge of a sideways chip row (V7), `boxShadow` lifts below Android 9
(`LiftElevation`), the 44 dp icon button reaching 48 dp on Android through slop, and that the `selection` haptic reads as the
primary press until T523 maps `impact`.

---

## C5-17. Fields and pickers

`Field` keeps the 004 API (`label`, `value`, `onChangeText`, `error?`, `description?`, `isRequired?`, TextInput
props; `testID` on the input; `${testID}-error` on the message). Look: label above (`label` 600), 56 dp
minimum, `surfaceSecondary` fill, 1 dp `border` (3:1, P12), radius 12; focused: `surface` fill and a 2.5 dp
`focus` ring with a 2 dp gap; invalid: 1.5 dp `danger` boundary, plus the words and an alert icon beneath
(never colour alone); helper text with a leading info icon. `CurrencyPicker`, `CategoryPicker` and the
`DateField` keep their behaviour, ids and names; they take the chip, field and sheet styles.

---

## C5-18. Containers and rows

| Adapter                | API                                                                                          | Look                                                                                                                                       | Guarantees                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`                 | `variant: 'lift' \| 'tile' \| 'flat'`, `overMap?`, `pending?`, `onPress?`, `cue?`, `radius?` | `lift`: `surface` + `lift1` + hairline; `tile`: `surfaceSecondary` + hairline, no shadow; `flat`: none                                     | A card never contains a card (development error); `overMap` is opaque with a hairline and `lift2`, never translucent; `pending` adds a dashed `amberLine` edge and the `SyncBadge` stays the marker; a pressable card is ONE `Tappable` with a cue at 3:1 |
| `ListGroup`, `ListRow` | as 004                                                                                       | 60 dp rows on `surface`, hairline inset separator, chevron `muted`                                                                         | row-level `accessibilityActions` forwarded; `tone="destructive"` is `danger` ink plus an icon                                                                                                                                                             |
| `StatTile`             | `value`, `of?`, `unit?`, `label`, `icon`, `onPress?`, `accessibilityLabel`                   | numeral 36 / 40 tabular, a lighter `/195` sibling on the same baseline, `label` below, 16 dp `duotone` icon                                | one control when `onPress` is set; announced "14 of 195 countries"; at font scale 1.15 and above a row (label left, figure right)                                                                                                                         |
| `AreaPill`             | `icon`, `label`, `count`, `private?`, `warn?`, `onPress`, `testID`                           | 72 dp minimum, radius 16, `surfaceSecondary` + hairline; lock chip top right for private areas; a 1.5 dp `danger` ring and dot when `warn` | keeps `trip-open-<segment>` ids; name "Photos, 128"; 4 columns, 2 at scale 1.15 and above                                                                                                                                                                 |
| `Panel`                | as 004                                                                                       | no fill                                                                                                                                    |                                                                                                                                                                                                                                                           |

---

## C5-19. Trip list components

| Component        | API                                             | Layout and states                                                                                                                                                                                                        | Accessibility and ids                                                           |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `TripHeroCard`   | `trip: TripCardModel`, `onPress`                | radius 24, minimum 219 dp, cover with `scrim.bottom` and the caption scrim, eyebrow (flag chip, "Country · N stops"), title (2 lines), status chip "Active · Day 3 of 8", `StopStrip`, `SyncBadge` when pending; `lift1` | ONE control "title, status, N stops"; id `trip-card-<id>`; cover hidden from AT |
| `TicketCard`     | `trip`, `onPress`                               | radius 24, 96 dp minimum; 88 dp thumb, text, then a 88 dp stub with a 2 dp dashed `sand` edge and two canvas-coloured notches (circles 16 dp, hairline); stub = days to go; stacks vertically at scale 1.15 and above    | ONE control; id `trip-card-<id>`; the stub is part of the label ("in 94 days")  |
| `TripRow`        | `trip`, `onPress`                               | 72 dp minimum row, 64 dp thumb (56 at large text), title (1 line, 2 at large text), "Country · Mon YYYY · N days", chevron, `SyncBadge` when pending                                                                     | ONE control; id `trip-card-<id>`                                                |
| `StopStrip`      | `dots: Array<'done'\|'now'\|'next'\|'later'>`   | 12 dp dots joined by a 2 dp line: solid between done, dashed otherwise; done filled white, now a thick ring with halo, next a ring; abbreviations (LIS, SNT, OPO) in `eyebrow`                                           | decorative; summarised in the card's label                                      |
| `YearHeader`     | `year`, `tripCount`, `distanceKm`               | `headline` year, then "N trips · 9,380 km" in `muted`; sticky on `surface` with a hairline                                                                                                                               | role header                                                                     |
| `YearScrubber`   | `years: number[]`, `activeYear`, `onJump`       | 28 dp wide capsule on the right edge, `eyebrow` years, active on `ink`; only with 200 or more trips; jumps with a selection haptic                                                                                       | `adjustable` with increment and decrement over years; id `trips-year-scrubber`  |
| `GeneratedCover` | `palette`, `iso2`, `initial`, `thumb?`          | gradient, ghost code glyph at 16 percent white, dashed stamp outline, flag chip; `thumb` shows the code only (40 dp)                                                                                                     | hidden from AT                                                                  |
| `Scrim`          | `kind: 'top' \| 'bottom' \| 'caption' \| 'sky'` | the only consumer of gradient strings (C5-1)                                                                                                                                                                             | `pointerEvents="none"`                                                          |

---

## C5-20. Trip detail components

| Component      | API                                                           | Layout and states                                                                                                                                                                                                                                                                                        | Accessibility and ids                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TripHero`     | `cover`, `title`, `country?`, `dateRange?`, `scrollY`         | 236 dp minimum, `scrim.top` (status bar zone) and the caption scrim; eyebrow (flag, "Portugal · 12–19 Oct 2026"); title bottom-anchored, `title` role, 2 lines, growing upward; parallax .5, scale on overscroll                                                                                         | title keeps `testID="trip-title"` and is a heading; the glass Back is `HeaderBackButton` (name "Back")                                                                                             |
| `CollapsedBar` | `title`, `onBack`                                             | 56 dp solid `surface` + hairline appears when the hero has scrolled away; title centred, `callout`; the day strip pins beneath                                                                                                                                                                           | one Back; the title is announced once                                                                                                                                                              |
| `ProgressRow`  | `status`, `dayOf?`, `syncState`                               | 36 dp minimum: `StatusChip`, "Day 3 of 8" with dots (6 dp, `accentLine` done, ring now, `sand` rest), `SyncChip` right                                                                                                                                                                                   | id `trip-header-row` (kept)                                                                                                                                                                        |
| `AreasStrip`   | `counts`, `spendingTotal`, `warnPhotos?`                      | four `AreaPill`s (Photos, Notes, Expenses, Documents), the `PrivacyChip` line "Expenses and Documents are only visible to you" (copy from the existing privacy lines), and an Offline maps row beneath                                                                                                   | ids `trip-links`, `trip-open-photos`, `-notes`, `-expenses`, `-documents`, `-offline-maps`                                                                                                         |
| `DayChips`     | `days: TripDay[]`, `selected`, `onSelect`                     | 56 dp chips (`callout` "D3", `caption` "14 Oct"), "All" first; selected `ink` fill; sideways, pinned beneath the collapsed bar                                                                                                                                                                           | `radiogroup`; each name "Day 3, 14 October"; hidden with zero stops; id `trip-days`                                                                                                                |
| `StopRow`      | `stop`, `state: 'done' \| 'here' \| 'next'`, `leg?`, handlers | rail 32 dp: node 28 dp (check on `ink`, coral with a 4 dp halo, ring), spine 3 dp `ink` solid to the next stop or `accentLine` when the next stop is current; body: place (`callout`), country, dates and nights, "Now" chip, 56 dp city thumb; per-stop controls kept as compact icon-and-label buttons | keeps `stop-row-<id>`, `stop-dates-<id>`, `stop-move-up-<id>`, `stop-move-down-<id>`, `stop-edit-<id>`, `stop-remove-<id>` and the row's `accessibilityActions` (move up, move down, edit, remove) |
| `TransitRow`   | `km`                                                          | 36 dp: a dotted 3 dp `border` spine and "313 km" with a small icon; omitted when `km` is null                                                                                                                                                                                                            | decorative; the distance is in the stop's label ("313 km from Lisbon")                                                                                                                             |
| `AddStopRow`   | `onPress`                                                     | 52 dp, 2 dp dashed `border` outline, plus icon and "Add stop" (`callout`); inline at the end of the timeline, no FAB                                                                                                                                                                                     | keeps `trip-add-stop` and its name                                                                                                                                                                 |

---

## C5-21. `TabBar` as a floating pill (iOS), navigation bar (Android)

```tsx
<TabBar {...BottomTabBarProps} /> // components/navigation/tab-bar.tsx, export name kept
```

- **Geometry (iOS)**: absolute, `left` and `right` 16, `height` 64, `padding` 6, `gap` 4, radius full,
  `bottom = max(insets.bottom − 10, 12)`; the container is `pointerEvents="box-none"` so the globe pans around
  it; it reports `height + bottomOffset` through `BottomTabBarHeightCallbackContext` (88 dp on a 390 by 844
  phone). A 48 dp `surface` fade sits under it so content does not collide.
- **Surface** (`tab-surface.tsx`, one pure `tabSurface()`): iOS 26 or later with `isLiquidGlassAvailable()`,
  transparency not reduced and a base theme gives `GlassView`; otherwise iOS `BlurView` (a `surface` tint at
  84 percent); otherwise (Android, reduced transparency, contrast themes) opaque `surface` with a hairline and
  `lift2`. Opacity is never animated on the glass (it would vanish); hide with `translateY`.
- **Tab**: icon (24, `regular`; `fill` when selected) and `eyebrow`-size label (12 / 14, capped at 1.3), equal
  widths so the capsule is `index × tabWidth`; selected: `accentTint` capsule (`translateX`, the sheet
  spring), `ink` icon and label, heavier weight; unselected `muted`. Selection is a filled icon, a heavier label
  AND the capsule (FR-022), so it survives greyscale.
- **Android** (`android-nav-bar.tsx`): full width, 64 dp plus `insets.bottom`, `surfaceSecondary`, a top hairline,
  icon with a 56 by 32 dp indicator (`accentTint` at 26 percent) and a 12 dp label beneath, no blur, no fade.
- **Preserved**: `testID="tab-bar"`, `tab-<routeName>`, `tab-mark-<routeName>` (now on the selected capsule),
  `accessibilityRole` `tablist` and `tab`, `selected` state, the route label as the name. Press behaviour is
  React Navigation's (`tabPress`, then navigate; `tabLongPress`). Targets are at least 44 pt and 48 dp; labels wrap
  at large text and the pill grows (a minimum height, not a height).
- **Labels**: Globe, Trips, You (deliberate label change; `tab-profile` unchanged).

---

## C5-22. `Sheet` and `HomeSheet`

```tsx
<Sheet
  detents={{ peek, half, full }} // heights in dp from detentHeight()
  index
  onIndexChange
  onSettle
  handleLabel="Countries and trips"
  renderBody
/>
```

- **Placement**: a sibling overlay of `GlobeView` in `HomeGlobe`; `position: 'absolute'`; container
  `pointerEvents="box-none"`, sheet `pointerEvents="auto"`; bottom edge at the screen bottom, content padded by
  the tab zone (`useBottomTabBarHeight()`), radius 28 top, `surface`, hairline and `lift2`.
- **Gestures**: a `Gesture.Pan()` on the handle zone (a 96 by 48 dp area) and the header always, and on the body
  only when its scroll offset is at most 0 or the sheet is below full; release picks the nearest detent by
  velocity projection and settles with the sheet spring (C5-9); rubber-band above `full`. `activeOffsetY` and
  `failOffsetX` let horizontal swipes win. The body scroller (FlashList or ScrollView) has `bounces={false}` and
  its `scrollEnabled` changes only when a detent settles (once per settle, never per frame).
- **Detents**: `detentHeight()` of data-model §7: peek = 28 + live row + tab zone + 16 (212 dp at the default
  text size), half = max(52 percent of the window, peek + 120), full = window − (top inset + 10).
- **Accessibility**: the handle is `accessibilityRole="adjustable"` with `accessibilityValue` "Peek", "Half" or
  "Full" and `accessibilityActions` `increment` and `decrement` stepping the detents; Android `BackHandler`
  (inside `useFocusEffect`) lowers full to half to peek before the route pops.
- **Haptics**: selection on each settle. **Camera**: `onSettle(index)` calls `globeFit()` and
  `cameraRef.setCamera({ padding, zoomLevel, animationMode: 'easeTo', animationDuration: 280 })` once, then
  moves the map logo and attribution to `bottom: sheetVisiblePx + 8` (`logoPosition`, `attributionPosition`).
- **`globeFit(detent, windowWidth, headerBottom, sheetTop)`** (pure, in `features/globe/globe-fit.ts`): the rule
  of data-model §7: peek radius `clamp((band − 24) / 2, 110, 175)` centred in the band at `headerBottom +
band / 2 + 4`, other detents radius `clamp(0.95 × band, 150, 286)` centred at `headerBottom + 28 + radius`,
  `band = sheetTop − headerBottom`; at least 20 dp of margin to each side at peek (SC-018). At `full` the
  camera does not move (the map is hidden) and rotation pauses.
- **Ids**: `home-sheet`, `home-sheet-handle`, `home-sheet-body`.

---

## C5-23. Home content

| Component        | Detent     | Content and rules                                                                                                                                                                                                                                                       | Ids (kept in bold)                                                                                                      |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GreetingHeader` | peek, half | over the globe: `eyebrow` date ("WED 14 OCT"), `display` "Hello, _Marta_" (the name in the serif accent), 2 lines maximum; right: `SyncChip` and a recentre control only after the camera moved; hidden at full                                                         | `home-greeting`, `home-recentre`                                                                                        |
| `StatsRow`       | half       | three `StatTile`s separated by hairlines (countries `/195`, trips, kilometres); `AnimatedNumber` counts up once; the countries tile opens the full detent, trips opens the Trips tab, distance does nothing but is announced; stacked rows at font scale 1.15 and above | **`globe-stats`**, **`globe-stat-countries`** (text is the plain number), **`globe-stat-distance`**, `globe-stat-trips` |
| `NowCard`        | peek, half | a 64 dp thumb (56 at peek), title, "Day 3 of 8 · Sintra", progress dots, chevron; opens the trip; the one live trip, else the next planned, else nothing                                                                                                                | `home-now-card`                                                                                                         |
| `NextRow`        | half       | the next planned trip as a 48 dp thumb row: title, "Jan 2027 · in 94 days"                                                                                                                                                                                              | `home-next-row`                                                                                                         |
| `CountriesList`  | full       | header "Countries" with a collapse control, `Field` search ("Search countries"), a ring card ("14 of 195", "4 of 7 continents · 19 trips") with up to two stamps, then groups by continent (sticky `eyebrow` headers with counts); a FlashList; no results message      | `countries-list`, `countries-search`, `countries-collapse`                                                              |
| `CountryRow`     | full       | 60 dp: `FlagChip`, name (`callout`), "First visited 2021", "Now" chip, trailing "3 trips" and a chevron; press lowers the sheet to half and flies the globe to `focus`                                                                                                  | `country-row-<iso2>`; name "Portugal, 3 trips, first visited 2021"                                                      |
| `PlanTripFab`    | peek, half | the extended button above the pill: iOS capsule (52 dp), Android rounded square (56 dp); label "Plan a trip"; hidden at full and when no trips exist; 16 dp above the pill                                                                                              | **`home-plan-trip`** (the existing id; with no trips it is the invitation card's primary)                               |
| `InvitationCard` | (no trips) | the existing `globe-empty-state` card: three tilted empty photo frames (84 by 108 dp, `skeleton` fill, a pin glyph, 3 dp `surface` border, `lift2`) above the headline "Your globe is waiting for its first trip" with one accent word, one line, the primary           | **`globe-empty-state`**, **`home-plan-trip`**, **`home-add-stop`**, **`home-open-trips`**, **`globe-notice`**           |
| `HomeSkeleton`   | loading    | a disc where the globe will mount (radius from `globeFit('half')`), skeleton sheet (greeting, 3 stat blocks, one row); the greeting text comes from the previous session's cached name                                                                                  | `home-skeleton`; ONE `progressbar` named "Loading your globe"                                                           |

The existing `LoadingState` "Loading your globe" is kept for the wait for the local store. Home uses no header.

---

## C5-24. Globe layers (inside `components/globe/`)

All inside the ONE `MapView`; geometry code untouched (FR-082). Each has a Jest stand-in tag.

| Component / hook        | Role                                                                                                                                    | Gate and tests                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `basemap-config.ts`     | the `StyleImport` config object from `GlobeStyle` tokens and the theme; allow-listed keys only                                          | key allow-list test (T505); `colorAdminBoundaries`, `colorGreenspace`              |
| `AtmosphereLayer`       | `<Atmosphere style>` from tokens; opaque colours                                                                                        | V2 device check                                                                    |
| `VisitedCountriesLayer` | `VectorSource` country boundaries, `FillLayer` + keyline `LineLayer` (and the amber dashed planned keyline), worldview filter, ISO list | filter built by a pure function; asserts the worldview clause                      |
| `GraticuleLayer`        | static GeoJSON every 30 degrees; opacity fades out above zoom 4                                                                         | pure geometry test                                                                 |
| `GradientArcLayer`      | `lineMetrics` source, one Feature per leg, `lineGradient` over `line-progress` from the `GlobeColors` stops                             | stops gated (C5-11); the shared hit source is unchanged                            |
| `RoundelLayer`          | `SymbolLayer` + `Images` for pins; `symbolSortKey` by status rank (active last); dots beyond about 60                                   | falls back to dots without view-shot (V2)                                          |
| `ActiveCallout`         | ONE `MarkerView`: tag (white, radius 16, 220 dp maximum, title one line, "Day 3 of 8 · Sintra") and Reanimated pulse rings              | flips side near an edge (12 dp margin); still under reduced motion; announced once |
| `useIdleSpin`           | `linearTo` chain, 5 s per 20 degrees, every stop condition of FR-019                                                                    | timer spied through `setInterval`, as AGENTS.md says                               |
| `useGlobeActions`       | `accessibilityActions` of the map view: next trip, previous trip, recentre, open countries                                              | FR-017                                                                             |

---

## C5-25. Passport components

| Component      | API                                     | Look and rules                                                                                                                                                                                               | Accessibility and ids                                                           |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `Stamp`        | `spec: StampSpec`, `size`, `landing?`   | `react-native-svg`, viewBox 120 by 120, `TextPath` circular text, code 25 to 30 pt in display 700, wear `<Mask>`, rotation, `multiply` in light and normal in dark; `landing` plays the stamp animation once | `accessible={false}`; the parent is labelled "Stamp: Portugal, 12 October 2026" |
| `GhostStamp`   | `size`                                  | dashed `border` outline, no text; the empty-passport and zero-stop art                                                                                                                                       | hidden from AT                                                                  |
| `PassportCard` | `totals: PassportTotals`, `periodLabel` | radius 24, the passport gradient (C5-10), 20 dp padding, two-column grid of `numeral`s (one column at font scale 1.15 and above), "1.5× around the Earth" line, a watermark glyph, an MRZ line (decorative)  | id `passport-card`; announced as one summary in words                           |
| `StampsPage`   | `stamps: StampSpec[]`, `visitedCount`   | `surfaceSecondary` page with a notch, hairline, two columns with the second shifted 20 dp, ghosts for the first unvisited slots, "14 of 195"; rasterised stamps past about 100                               | id `stamps-page`                                                                |
| `PeriodSwitch` | `periods: PassportPeriod[]`, `selected` | a `SegmentedPill` ("All time", "2026", "2025")                                                                                                                                                               | id `passport-period`                                                            |

---

## C5-26. Photos

| Component       | API                                       | Look and rules                                                                                                                                                                                                                                                               | Accessibility and ids                                                                                                                                                    |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DayHeader`     | `day`, `place`, `count`                   | `numeral`-size date (36), `callout` place, `label` "Wed · Oct · 14 photos"                                                                                                                                                                                                   | a heading                                                                                                                                                                |
| `PhotoMosaic`   | `photos`, `onOpen`                        | grid of three 114 dp columns (gap 4) with a 2 by 2 lead tile and, past nine, a last tile "+N"; radius 16 on the image only; `recyclingKey`; thumbnails only; **no tint and no shadow**                                                                                       | each tile named with its place and time (existing `photo-tile` naming)                                                                                                   |
| `UploadState`   | `state`, `onRetry`                        | on the thumbnail: queued (dashed ring and cloud-up), uploading (ring spinner), uploaded (a check for 2 s then nothing), failed (`danger` pill "Retry" with an alert icon) in a 24 dp `scrimButton` disc                                                                      | keeps `photo-status-icon` and its text equivalents; a failed tile is a button                                                                                            |
| `UploadSummary` | `uploading`, `total`, `failed`, `onRetry` | a 56 dp tonal capsule "Uploading 2 of 5 · 1 failed" with a ring spinner and "Retry"                                                                                                                                                                                          | ONE live region; id `photos-upload-summary`                                                                                                                              |
| `PhotoViewer`   | existing props                            | full screen `Modal`; the photo on its own colour (an `expo-image` `blurRadius` backdrop, no backdrop filter), zoom, double-tap, swipe between, pull down to close; the existing detail block (place and time, refile `ChipGroup`, retry, delete with `Alert`, Close) beneath | keeps `photo-viewer`, `photo-viewer-modal`, `photo-viewer-image`, `photo-viewer-place`, `photo-viewer-mismatch`, `photo-viewer-error`, "Close photo", `photo-file-<key>` |

---

## C5-27. Expenses, notes, documents, offline maps

| Component         | Look and rules                                                                                                                                                                                                                                                                              | Ids kept                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `SpendingHero`    | "Spent so far" `label`, the currency sign (display 28) and the total (`numeral` at 56 / 56 in display 700, tabular, may shrink with `adjustsFontSizeToFit`), a tonal capsule "€281 / day · Day 3 of 8", the rate line with an info icon ("Converted at today's rate · as of 14 Oct, 09:00") | `summary-total`, `summary-rates`, `summary-pending`, `spending-summary`, `expenses-toggle-summary` |
| `DayBars`         | one bar per day: radius 12 top, `sand` with a `border` outline for past days, `ink` for today, dotted baseline for empty days; labels date over amount (tabular); **no budget line**                                                                                                        | `expenses-day-bars`                                                                                |
| `CategoryBar`     | 12 dp bar, radius full, 2 dp gaps; legend of swatch, name, amount; four category inks from the stamp and accent tokens; each category also has its icon in the rows (never colour alone)                                                                                                    | `expenses-category-bar`                                                                            |
| `ExpenseRow`      | 48 dp category roundel (icon on a tint), title (the note or the category), "Category · City", amount right-aligned tabular; group header "Wed 14 Oct · Today" with the day total                                                                                                            | `expenses-screen`, `expenses-add`, `expenses-write-error`                                          |
| `NoteCard`        | radius 16, `surfaceSecondary` + hairline, title or preview (3 lines), "16:12 · Sintra", a `SyncBadge` glyph                                                                                                                                                                                 | `notes-screen`, `notes-add`, `notes-write-error`                                                   |
| `DocumentTicket`  | like `TicketCard`: a 44 dp `surface` circle with the type icon (plane, bed, document), kind (`caption`), title (`callout`, 2 lines), one detail, a stub with the day numeral and month; two notches                                                                                         | `documents-screen`, `documents-add`, `documents-privacy`, `document-view-screen`                   |
| `OfflineCityCard` | restyled: 64 dp thumb, city, size, a "Download" or "Downloaded" pill (44 dp), progress ring; `StorageBar` (12 dp, used and free in MB)                                                                                                                                                      | `offline-maps-screen`, `offline-storage`, `offline-status-<id>`, `offline-unplaced`                |
| `AreaHeader`      | Back (`HeaderBackButton`, round), title (`title`), subtitle line `label` "Trip · N things", `PrivacyChip` on Expenses and Documents; used under the native header of each pushed screen                                                                                                     | `<area>-screen` ids as today; the title ids (`documents-title`, `photos-title`, …)                 |
| `AreaFab`         | the screen's one primary add action, extended, 16 dp above the safe area, `lift2`; hides while the keyboard is up                                                                                                                                                                           | `photos-add`, `photos-take`, `notes-add`, `expenses-add`, `documents-add`                          |

---

## C5-28. States

| Component                                                                | Look and rules                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Skeleton`, `SkeletonGroup` (kit)                                        | `skeleton` fill, shimmer `skeletonHighlight` at 1.4 s; ONE `progressbar` region per skeleton, shapes hidden; static under reduced motion; a photograph skeleton carries a pin glyph          |
| `TripListSkeleton`, `TripDetailSkeleton`, `AreaSkeleton`, `HomeSkeleton` | shaped from the real geometry (hero 16:10, ticket, rows; hero, status row, four tiles, day chips, three stops)                                                                               |
| `EmptyState`                                                             | `variant: 'ghost-stamp' \| 'frames' \| 'plain' \| 'filtered'`, `title`, `detail?`, `action?`; never a primary when a screen already has one; the existing strings are kept                   |
| `ErrorState`                                                             | words, alert icon, `danger` ink, a secondary "Try again" where a retry exists                                                                                                                |
| `Banner`                                                                 | `tone: 'offline' \| 'error'`, a slim non-blocking row: `amberTint` and `amberInk` for offline, `dangerTint` and `danger` for error, icon, text, an underlined action; role `alert` for error |
| `Toast`                                                                  | over the HeroUI Toast: `toastSurface`, `toastInk`, one 44 dp action in `accentPress`, a 3 dp countdown bar, radius 16, `lift2`, above the pill; announced politely; auto-dismiss 5 s         |
| `PermissionState`                                                        | the camera and photographs denial screens restyled: icon, words, "Open Settings" secondary                                                                                                   |

---

## C5-29. Forms

`FormSheet`, `FormModal`, `FormActions`, `InlineError` keep the 004 contracts and ids (`<id>-body`, `<id>-footer`,
`<prefix>-cancel`, `<prefix>-save`); they take the Sunrise look: 28 dp top radius, a 36 by 5 dp `grab` handle
(32 by 4 on Android), `Cancel` in `ink` (text variant), the title centred (`callout` in the bar, `headline` as
the heading), the footer opaque with a hairline, `Save` the single primary. The keyboard-visibility test
(`test/helpers/keyboard.ts`) is still written for every form (004 rule 8). The stop editor adds `RoutePreview`
(a `StopStrip` of the trip's stops plus the new one, and "Stop 3 · 322 km from Sintra") and `NightsStepper`
(two 44 dp circular buttons and the figure; changing it moves the departure date; ids
`stop-editor-nights-minus`, `stop-editor-nights-plus`) beside the unchanged `stop-editor-arrive` and
`stop-editor-depart`.

---

## C5-30. `AnimatedNumber`, haptics

```tsx
<AnimatedNumber value={14} format={Intl options} role="numeral" />
```

Renders the final text at once under reduced motion; otherwise counts up once per appearance (C5-9) and always
sets `accessibilityLabel` to the FINAL formatted value. `useHaptics()` exposes `selection`, `impact(light |
heavy)`, `success`, `warning`, `error`, each a no-op under reduced motion or where unsupported (map: D5-14).

---

## Review rules for new adapters

1. Function under 50 lines, file under 800, nesting under 4, no debug output.
2. A failing test first: accessible name required, `testID` forwarded, busy and disabled semantics,
   largest-text rendering (scale 2), reduced-motion behaviour, four themes.
3. No literal colour or gradient; no import of the kit, Phosphor, glass, zoom or view-shot outside the folders.
4. A tappable surface names its cue (chevron, icon or label) at 3:1.
5. No 20 percent soft fill under text (the gate measures the fixed tints).
6. A focus ring is drawn with the 2 dp offset gap of surrounding neutral.
7. Only `ink` text on a `pressed` fill. A soft chip sits on `surface` or `surfaceSecondary` only.
8. Text on a photograph sits on the caption scrim and is `onPhoto`; a control on a photograph sits on a
   `scrimButton` disc; a grid thumbnail or the viewer carries no overlay.
9. A component with a fixed height is a bug: use a minimum and let it grow.
10. A component never fades the glass pill by opacity.

---

## As built (T523): Scrim, GeneratedCover, stamps, AnimatedNumber, haptics

Branch `feat/005-adapters-visual`. Everything is in `apps/mobile/src/components/ui/` except the hash
(`src/lib/fnv1a.ts`) and the haptics (`src/hooks/use-haptics.ts`). 313 new tests, written red first.

### `Scrim` (`scrim.tsx`), C5-10 and C5-19

```tsx
<Scrim kind="top" | "bottom" | "sky" style? testID? />
<Scrim kind="caption" style? contentStyle? testID?>{text}</Scrim>
<Scrim kind="cover" palette={0 | 1 | 2} style? testID? />
```

- **The only gradient consumer.** The values stay data in `src/theme/scrim.ts` (`scrimSpec`, `Sky`, `Passport`,
  `withAlpha`); `scrim.tsx` writes no number of its own. It paints with React Native 0.86's
  `experimental_backgroundImage` in its **typed object form**: an array of linear gradients (`direction`, then
  `colorStops` of `{ color, positions: ['44%'] }`) and radial ones (`shape`, `size`, `position`, `colorStops`), so no
  gradient _string_ exists outside `src/theme/` at all. Read in `processBackgroundImage.js` of `react-native`
  (`Libraries/StyleSheet`): the object form needs no parsing, hex with alpha (`#RRGGBBAA`) is a valid stop, a bad stop
  drops the whole gradient (so the tests read every stop back), and layers are listed top first, as in CSS. Uniwind
  maps a CSS `background-image` onto this very style (`css-processor/rn.js` in `uniwind/dist/module/bundler`); the
  adapter sets the style directly because the alphas are computed from tokens, not written into a stylesheet.
  `expo-linear-gradient` is not installed (Batch 2, D5-19) and nothing needs it; no stacked-alpha fallback was built.
- **Kinds.** `top` is the 120 dp band pinned to the top edge (alpha `.68` held to 44 percent, then to nothing);
  `bottom`, `sky` and `cover` fill their parent (`StyleSheet.absoluteFill`: React Native 0.86 has no
  `absoluteFillObject`); `caption` is a column of a 48 dp ramp and a block that **wraps the children** (a minimum,
  never a height, so it grows with large text and the alpha under any line is at least `minUnderText` at every text
  scale). `contentStyle` is the block's, where its padding belongs; `style` is the container's. A caller `style` is
  applied last.
- **`cover` is a fifth kind** (the contract lists four): `GeneratedCover` and, later, the passport card need a
  gradient and `scrim.tsx` is the only file the ESLint rule exempts. It draws the passport's amber corner
  (`Passport.glow`, alpha .20) over a 135 degree gradient between `cover1..3Start` and `End` of the theme's palette.
  The prototype's cover glow is .62; that value is not a token, so it was not invented here (see "Needs from the
  token layer").
- **Theme.** `useAppearance()`: `prefersMoreContrast` picks the darker scrims, the colour scheme the sky (the
  contrast themes keep the base sky), `themeName` the cover stops. Read live.
- **Behaviour.** `pointerEvents="none"`, `accessibilityElementsHidden` and `importantForAccessibility` `"no-hide-descendants"` on every gradient View; the caption's ramp is hidden, its block is not (the text is read)
  and its container is `box-none`. A hidden node is not found by a default query: tests use
  `includeHiddenElements`.
- **The contrast test** (`scrim.test.tsx`, 52 tests) reads the stops back from what the component renders and
  composites them over the gate's `WHITE_PHOTO` (`test/theme/palette-gate-support.ts`) in all four themes: white
  (`onPhoto`) holds 4.5:1 (7:1 in the contrast themes) in the top scrim's status-bar zone (0 to 44 percent), in the
  bottom scrim from its 55 percent stop down, and at every position of the caption block (alpha never under
  `minUnderText`); on the **sky** the text is `ink` and `muted` (never white), measured on every linear stop and at
  each glow's peak over the gradient at its centre. A mutation (the block's last stop at .30) fails five tests.

### `GeneratedCover` (`generated-cover.tsx`), C5-19, FR-008

```tsx
<GeneratedCover palette={coverPalette(trip.id)} iso2="PT" initial="Portugal Road Trip" thumb? style? testID? />
coverPalette(seed: string): 0 | 1 | 2     // fnv1a32(seed) % 3: pass the trip id, or the title with no id
coverGlyph(iso2, initial): string         // the code in upper case, else the first letter of the title
```

A `Scrim kind="cover"` gradient, the country code as a ghost glyph (120 dp Bricolage Bold, `onPhoto` at 16 percent,
bottom corner), a dashed stamp outline (two SVG rings, top corner, tilted -10 degrees), all clipped to
`absoluteFill` so it fills the frame of the photograph it replaces. `thumb` is the row form: the code only, 40 dp, in
**opaque** `onPhoto` (text on a picture is never alpha). It is decoration, hidden with its descendants. **The flag
chip is not drawn by the cover**: in the prototype frames (`trips-nocover`, `trip-nocover`) the flag sits in the
caption row over the cover exactly as over a photograph, so the card draws it once (`FlagChip`, T520); FR-008's
"flag chip" is met at the card. `generated-cover.test.tsx` (32 tests) re-measures white on both stops of the three
palettes in all four themes from the rendered gradient.

### `fnv1a32` (`src/lib/fnv1a.ts`)

The 32-bit FNV-1a of the UTF-8 bytes of a string (a lone surrogate counts as U+FFFD instead of throwing), integer
arithmetic only, pinned to the published vectors (`''` is `0x811c9dc5`, `'foobar'` is `0xbf9cf968`). It did not
exist before; the stamp and the cover share it.

### Stamps: `stamp-spec.ts`, `stamp-wear.ts`, `stamp-layout.ts`, `stamp.tsx`, `stamp-in.tsx`

```ts
stampSpec(iso2, firstVisit /* 'YYYY-MM-DD' */, top?): StampSpec
// { iso2, shape, ink, rotationDeg, wear, perforated, top, date }
stampDateText(isoDate, locale?)    // '12 OCT 2026' (en-US 'OCT 12, 2026'): upper case, Intl, local calendar day
stampLabel(place, isoDate, locale?) // 'Stamp: Portugal, 12 October 2026': what the PARENT says
```

```tsx
<Stamp spec size={124} testID="stamp" />
<GhostStamp size={96} rotationDeg={0} testID="ghost-stamp" />
<StampIn tiltDeg={spec.rotationDeg} play={true} style? testID="stamp-in"><Stamp spec={spec} /></StampIn>
```

- **`stampSpec` is `deriveStamp` of data-model section 4**, in `components/ui/` because `Stamp` consumes it and the
  adapter layer must not import from `features/`; the passport feature (T556) chooses the country, the earliest
  arrival and the city, and calls it. `h = fnv1a32(ISO2 + '|' + day)`, `shape = SHAPES[h % 6]`, `ink = INKS[(h >>> 3) % 4]`, `rotationDeg = ((h >>> 7) % 17) - 8` (never `-0`), `wear = (h >>> 12) % 4`, and
  `perforated` is bit 15. `top` (a city or the country, upper case, cut to 16 whole characters, `ARRIVAL` when empty) and the
  formatted date are **not** part of the hash. Pinned by seven golden rows computed with an independent
  implementation of the formula, by 240 pairs asked twice and in reverse order (SC-016 asks for 200), and by 1,000
  pairs that reach all 24 shape and ink combinations, all 17 tilts and all four wear masks.
- **`Stamp`**: the six shapes of the prototype's `stampSVG` in a 120 by 120 `viewBox`, the ink one of
  `stampCoral|Navy|Teal|Green`, the outer ring heavy (dashed `7 5` when perforated; the scallop's dotted ring is
  already perforated) and the inner rings fine. The circle writes its top and its date on two arcs and the scallop
  its top on one (`TextPath`, `startOffset` 50 percent, `textAnchor` middle); the others write on lines. Each line
  is **fitted to its room by arithmetic** (`fitLabel`: the letter spacing closes up first, then the size shrinks,
  never under 6.5; width is estimated as characters times 0.64 em plus the spacing), because SVG text ignores
  Dynamic Type. The text is the embedded Bricolage Bold: the family name is read from the `--font-display-bold`
  variable with `useCSSVariable` and `fontFamilyOf` (the name differs by platform and `global.css` spells both;
  no name is written in the component), with `fontWeight="normal"` so a weight-named family is not emboldened
  twice. The box is tilted by the spec's degrees and blends with `mixBlendMode` `multiply` in the light themes
  and `normal` in the dark ones. Ids come from `useId()`, stripped to letters and digits, so two stamps never share
  a mask or an arc.
- **The wear is baked path data, not a PNG (a deviation from D5-08's "four grayscale PNGs").** Each of the four
  textures is ONE path: the whole box followed by 130 specks, 26 chips, 7 blotches and 5 scratches (about 8.7 kB
  and 4 to 5 percent of the box), cut by a seeded integer generator (`mulberry32` over `fnv1a32('stamp-wear-<n>')`),
  clamped to the box and drawn with `fillRule="evenodd"` in `onPhoto` as the shape of an SVG `<Mask>` in user-space units. One path is one node however many holes, which answers D5-08's objection to a
  mask of 100 circles, and it removes the risk that spike V5 was written for: a mask whose `<Image>` fails to draw
  on a platform would hide the WHOLE stamp, whereas a mask of shapes cannot fail that way. No binary asset ships.
  A guard test fails the build if `stamp.tsx`, `stamp-layout.ts` or `stamp-wear.ts` ever mention a filter
  (`feTurbulence`, `feDisplacementMap`, `feMorphology`, `<Filter`), which draw nothing in 15.15.4.
- **Decoration (FR-076).** A stamp and a ghost are `accessible={false}`, hidden with their descendants and
  `pointerEvents="none"`. The parent is labelled with `stampLabel`. `GhostStamp` is the dashed outline of the
  prototype (`r` 54, dash `7 6`, round caps, and a fine inner ring, in the `border` token), no text, no wear, no
  blend.
- **`StampIn`** (the separate wrapper the brief asks for; the contract's `landing?` prop on `Stamp` is not built):
  a Reanimated layout animation, `entering` with a `Keyframe` from scale 1.6, rotate `-14 - tiltDeg` degrees and
  opacity 0 to scale 1, rotate 0 and opacity 1, easing out cubic, `Motion.stampLandMs` (200 ms; the contract says
  180 to 220). The stamp holds its own tilt in its style, so the wrapper turns from `-14 - tiltDeg` to 0 and the two
  never fight over `transform`. At the landing it plays `useHaptics().stamp()` once (a timer cleared on unmount, not
  restarted by a re-render, withdrawn if reduced motion comes on mid-flight). `play` is read at mount: the screen
  decides "earned in the last seven days and not yet landed this session" and keeps its own once-per-session set.
  With reduced motion, or `play={false}`, there is no animation, no timer and no haptic. The 2 dp settle of C5-9 is
  not built.
- Tests: `stamp-spec` 30, `stamp-wear` 17, `stamp-layout` 13, `stamp` 45 (over a `react-native-svg` stand-in that
  keeps every prop), `stamp-render` 9 (the real library draws every shape in every ink, with a real `TextPath` where
  the shape has one), `stamp-in` 12.

### `AnimatedNumber` (`animated-number.tsx`, `count-up.ts`), C5-30, D5-11

```tsx
<AnimatedNumber value={14} format? locale? delay? duration? variant="numeral" containerStyle? accessibilityLabel? testID? {...Text props} />
```

- **The prop is `variant`, not the contract's `role`**: `role` is a React Native accessibility prop, and `variant`
  is what `Text` calls it. The roles on offer are the display ones (`numeral`, `display`, `title`, `headline`,
  `callout`) because only Bricolage has `tnum`; both texts get `fontVariant: ['tabular-nums']` whatever the role.
- **Counts 0 to `value` once per mount** in `Motion.countUpMs` (700 ms), eased out (`1 - (1 - t)^3`, the curve of
  `Easing.out(Easing.cubic)` written out), and on a new `value` counts on from the figure last drawn; `delay` is the
  80 ms stagger. A value that is not a number is 0.
- **The engine is a small interval, not a Reanimated shared value (a deviation, within the options the brief gives
  and D5-11 names).** The digits are an ordinary `Text`, so every frame needs the JavaScript thread anyway and a
  UI-thread clock would only add a worklet hop per frame; a `TextInput` with animated props flickers on Android
  Fabric and announces nothing, so it is not used. The interval runs at about 30 frames a second (`FRAME_MS` 33),
  only while a count is under way, and takes its progress from `Date.now()`, never from a tick count, so a slow
  frame costs smoothness and not time. No Reanimated import means a screen that shows a figure needs no Reanimated
  double in its test (the global stand-in of `jest.setup.ts` has no `useSharedValue`).
- **Assistive technology hears the final value once.** The visible text's `accessibilityLabel` is the final
  formatted value from the first render (`accessibilityLabel` replaces it, e.g. "14 of 195 countries"), no frame
  changes it, and nothing is a live region.
- **No layout shift.** While counting, the figure (absolute, over the box) lies on an invisible copy of the FINAL
  text that sizes the box and is hidden from assistive technology (so it is read once); every text style applies to
  both, `textAlign` included, and `containerStyle` lays the box out. Under reduced motion there is a single `Text`
  with the final text on the first render and no timer.
- **Figures follow the device**: `Intl.NumberFormat` with `deviceLocale().languageTag` (or `locale`), a whole
  number unless `format` asks for more; one formatter per locale and options is cached (Hermes constructors are
  slow); a locale `Intl` refuses is read as English. Compact notation (`notation: 'compact'`, "1.26M") is the
  caller's `format`; Hermes support for it is a device check. For non-negative figures.
- **Testing a screen that shows one**: `testID` is the visible figure (`<testID>-width` the keeper,
  `<testID>-container` the box). The first render draws `0`; ask for reduced motion (`prefersLessMotion: true` in the
  mocked `useAppearance`) to read the final text at once, or drive the clock with
  `test/helpers/captured-interval.ts` (`captureIntervals()` captures the component's own interval and `tick()` runs
  a frame; Jest's fake clock does not coexist with Testing Library's async `render` across the tests of a file here).
- Tests: `count-up` 23 (easing, `countUpValue`, `formatFigure` in en, de, fr and an unknown locale, `useCountUp`
  through a captured interval), `animated-number` 27.

### `useHaptics` (`src/hooks/use-haptics.ts`), D5-14, FR-062

`const haptics = useHaptics()` returns a `SemanticHaptics`: the original `selection`, `success`, `warning` plus
`tap`, `select`, `sheetSnap`, `tabChange`, `error`, `stamp` and `impact('light' | 'heavy')`. **`Haptics` is still
the three-name type** (`button.tsx` reads `keyof Haptics`, and three test doubles implement it), so no sibling's
file stops compiling; `SemanticHaptics extends Haptics` is what the hook returns.

| Name                       | iOS and the fallback | Android (`performAndroidHapticsAsync`) |
| -------------------------- | -------------------- | -------------------------------------- |
| `tap`, `impact('light')`   | `impactAsync(Light)` | `Virtual_Key`                          |
| `select`, `selection`      | `selectionAsync()`   | `Segment_Tick`                         |
| `sheetSnap`                | `selectionAsync()`   | `Segment_Tick`                         |
| `tabChange`                | `selectionAsync()`   | `Virtual_Key`                          |
| `success`                  | `notificationAsync`  | `Confirm`                              |
| `warning`                  | `notificationAsync`  | `Long_Press`                           |
| `error`                    | `notificationAsync`  | `Reject`                               |
| `stamp`, `impact('heavy')` | `impactAsync(Heavy)` | `Long_Press`                           |

- Android uses the platform constants where `performAndroidHapticsAsync` exists (it does in expo-haptics 57.0.3:
  `Haptics.d.ts` and the v57 reference, "Supported platforms: Android"; it needs no VIBRATE permission and the
  docs prefer it to the `Vibrator` the other calls simulate); an Android client without it falls back to the
  cross-platform call. The constants are looked up when played, so a client without the `AndroidHaptics` enum cannot
  break an import (several suites mock `expo-haptics` with their own factory). `Segment_Tick`, `Virtual_Key` and
  the rest are the starting point of device check V6 (T512); there is no heavy-impact constant, so `warning` and
  `stamp` share `Long_Press`.
- **Silent under reduced motion** (read live; the object is stable while the setting does not change), every device
  failure swallowed (a synchronous throw, a rejection, a missing enum), fire and forget.
- **Debounced 80 ms per name, per hook instance** (D5-14 says "debounced 80 ms"): the same name asked again within
  80 ms by the same component is dropped, `select` and `selection` are one name, and different names never silence
  each other (a failure right after a tap is felt). It is per instance and not module-wide on purpose: a module
  window leaks between the tests of a file and between two components that happen to fire together.
- Tests: `use-haptics-map.test.ts` 42 (the whole map on both platforms, the fallback, silence, swallowing, the
  debounce); the original `use-haptics.test.ts` (13) passes unchanged.

### Verified from source, and what only a phone can say

- Read in `node_modules`: `experimental_backgroundImage` and its object form in `react-native` 0.86.3
  (`processBackgroundImage.js`, `StyleSheetTypes.d.ts`); `TextPath` and `Mask` props in `react-native-svg` 15.15.4;
  `performAndroidHapticsAsync` and `AndroidHaptics` in `expo-haptics` 57.0.3; the `Keyframe` builder in
  `react-native-reanimated` 4.5.1. All the new components and hooks (`Scrim`, `GeneratedCover`, `Stamp`,
  `GhostStamp`, `StampIn`, `AnimatedNumber`, `useCountUp`, `useHaptics`) compile under `babel-plugin-react-compiler`
  1.0.0 with 0 bail-outs and 0 skips (its logger, over a throwaway script that was deleted); Jest does not enable the
  compiler itself, so the suites test the uncompiled source, as 004 and the T506 spike noted.
- **Device-only checks** (the doubles prove the request, not the pixels): (1) **V5**: `TextPath` draws the embedded
  Bricolage on both platforms (and the `fitLabel` estimate of 0.64 em per capital), the evenodd wear mask applies on
  both, `mixBlendMode: 'multiply'` on Android, and a passport of 100 stamps scrolls (else rasterise, D5-08);
  (2) **V6**: the Android haptic constants, and `Intl` `notation: 'compact'` on Hermes; (3) that layered
  `experimental_backgroundImage` (radial over linear) draws top layer first on both platforms, the caption block
  and ramp meet without a seam, and the cover and sky glows look like the prototype's; (4) the landing's `Keyframe`
  with an array `transform` plays as drawn, and the thud lands with it; (5) AnimatedNumber at 30 frames a second on a
  mid Android phone, with three figures at once.

### Needs from the token layer (not changed here)

- A `CoverGlow` (or a `cover` entry in `scrim.ts`) if the prototype's .62 amber corner is wanted on generated
  covers; the cover uses the passport's .20 glow today.
- `scrim.ts`'s `Sky`, `Passport` and `Glow` types are `readonly number[]` after `deepFreeze`, not the tuple types
  they declare; the adapter takes the structural type it reads (`centre[0]`, `centre[1]`).

## As built (T521, T522)

Branch `feat/005-adapters-surfaces`. Every adapter below restyles a 004 adapter in place (same file, export names,
props, roles, states and testIDs) or is new; the call sites are untouched. Facts about the kit are read from
`node_modules/heroui-native/src` and re-checked against the real kit in `test/ui-kit/surfaces-real-render.test.tsx`,
`field-chip-real-render.test.tsx` and `states-real-render.test.tsx`.

### Kit facts verified from source

- **Surface and Card** (`styles/components/surface.css`): the root has `padding: 16`, `border-radius: var(--radius-3xl)`,
  `box-shadow: var(--shadow-surface)` and `overflow: hidden`; `variant` is `default`, `secondary`, `tertiary` or
  `transparent` (fills `surface`, `surface-secondary`, `surface-tertiary` = the Sunrise `pressed`, none). The real kit
  puts `surface__root` and `surface__root--variant-<name>` first and our classes after them. `ListGroup` is a Surface
  too and takes the same `variant`.
- **Input, Label, FieldError, Description**: the input draws `ios:outline` / `ios:focus:outline-accent` and, on Android,
  `android:border-transparent` until focus, which is why `Field` keeps the focus state itself. `Label.Text` takes
  `className`; `FieldError` and `Label` render a child that is an element as written (`childrenToString` answers `null`
  for an element), so an alert may hold an icon and its words.
- **Skeleton and SkeletonGroup**: the root fill is a 30 percent mix of `muted` (replaced by `bg-skeleton`); shimmer
  defaults to 1500 ms and takes `animation.shimmer.{duration, highlightColor}`; `variant="none"` is a static bone;
  a Bone outside a `SkeletonGroup` throws (the group's context is strict); the animation reads `ReduceMotion.System` and
  the provider's `animation: 'disable-all'` through the kit's context.
- **Toast**: the root is a `View` with `role="status"`, `aria-live="polite"` and `aria-atomic`; the provider's default
  duration is 4000 ms and an explicit `id` is shown once; the root renders its children twice (the second, invisible
  copy measures the height); the provider's `toast` object changes with its stack; `Toast.Action` is a `Button`
  (`sm` 40 dp, `md` 48 dp); `.toast__root` is `bg-overlay`, 16 dp padding, radius 3xl, `overflow: hidden`.

### API as built

| Adapter                                                                                          | Public API as built                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`                                                                                           | `variant: 'lift' \| 'tile' \| 'flat'` (default `lift`; the 004 `raised` is `lift`), `overMap?`, `pending?`, `radius?: 'md' \| 'lg' \| 'xl' \| 'sheet'` (default 24 dp for `lift`, 16 dp for `tile` and `flat`), `onPress?`, `cue?`, `innerClassName?`, `innerStyle?` (the surface inside a pressable card), the rest as 004; `cardClasses(look)` exported |
| `useLiftStyle`, `lift.ts`                                                                        | `useLiftStyle(name \| null)`: the device scheme and the "no lift" case over `liftStyle` of `lift-style.ts` (T519), which maps a lift to `boxShadow` from the `Lift` token, or `elevation` on Android below API 28; the only shadow an adapter draws                                                                                                       |
| `ListGroup`, `ListRow`                                                                           | as 004; the group is a cream `tile` (24 dp, hairline, no shadow); `ROW_MIN_HEIGHT` 60 dp, scaled by the font scale; `ROW_PRESSED_CLASS` kept                                                                                                                                                                                                              |
| `StatTile`                                                                                       | `value: string \| number \| ReactElement`, `of?`, `unit?`, `label`, `icon?: IconKey`, `onPress?`, `disabled?`, `busy?`, `accessibilityLabel?`, `testID?`, `valueTestID?`; `statTileName()` exported                                                                                                                                                       |
| `AreaPill`                                                                                       | `icon: IconKey`, `label`, `count: number \| string`, `private?`, `warn?`, `onPress`, `disabled?`, `busy?`, `testID?`; `areaPillName()`, `AREA_MIN_HEIGHT` exported                                                                                                                                                                                        |
| `reflow.ts`                                                                                      | `REFLOW_FONT_SCALE` (1.15), `isLargeText(fontScale)`, `areaColumns(fontScale)` (4, or 2 from 1.15)                                                                                                                                                                                                                                                        |
| `Field`                                                                                          | the 004 props unchanged; `FIELD_MIN_HEIGHT` 56 dp; `fieldMinHeight(fontScale, lines?)` exported                                                                                                                                                                                                                                                           |
| `FormActions`                                                                                    | as 004 (ids `<prefix>-cancel`, `<prefix>-save`); Save `grow`s, Cancel keeps to its label                                                                                                                                                                                                                                                                  |
| `InlineError`                                                                                    | as 004                                                                                                                                                                                                                                                                                                                                                    |
| `ShimmerGroup`, `Bone`, `PhotoBone`, `useSkeletonMotion`, `wholeCount`                           | `skeleton.tsx`: the kit's group with the 1.4 s shimmer (`variant="none"` and `animation="disable-all"` under reduced motion), one placeholder box (`bg-skeleton`), a photograph's placeholder with a pin glyph                                                                                                                                            |
| `TripListSkeleton`, `TripDetailSkeleton`, `AreaSkeleton`, `HomeSkeleton`                         | `screen-skeletons.tsx`; `SkeletonRegionProps` (`label`, `testID`) plus `rows?` (list, area), `hero?` (detail), `discRadius?`, `discCentreY?`, `greetingName?` (home); defaults `trips-skeleton` / "Loading trips", `trip-skeleton` / "Loading trip", `area-skeleton` / "Loading", `home-skeleton` / "Loading your globe"                                  |
| `EmptyState`                                                                                     | the 004 props plus `variant?: 'plain' \| 'ghost-stamp' \| 'frames' \| 'filtered'` (default `plain`: what every call site had) and `action.primary?`; `StateBox`, `Detail` exported                                                                                                                                                                        |
| `ErrorState`, `LoadingState`, `LoadingRegion`, `ListSkeleton`, `TripCardSkeleton`, `RowSkeleton` | as 004 (`LoadingRegion` gains `className`); shapes now `ShimmerGroup` and `Bone`                                                                                                                                                                                                                                                                          |
| `Banner`                                                                                         | `tone: 'offline' \| 'error'`, `message`, `action?: { label, onPress, testID?, busy? }`, `testID?`; ids `<testID>`, `<testID>-message`                                                                                                                                                                                                                     |
| `Toast`, `useToast`                                                                              | `useToast()` returns a stable `{ show({ message, action?: { label, onPress, testID? }, id?, durationMs? }): string, hide(id?) }`; `Toast` is the body the kit renders; `TOAST_DURATION_MS` 5000; ids `toast-<id>`, `toast-<id>-countdown`                                                                                                                 |
| `PermissionState`                                                                                | `icon: IconKey`, `title`, `detail?`, `onOpenSettings`, `settingsLabel?` ("Open Settings"), `settingsTestID?`, `alternative?: StateAction`, `testID?`, `accessibilityLiveRegion?`                                                                                                                                                                          |

### Where the build differs from the contract text above

1. **`ListGroup` is cream, not `surface`**: the prototype's settings groups are `surfaceSecondary` with a hairline, and a
   white group on the white canvas of the light themes would have only its edge to stand on. The contract's "rows on
   `surface`" is read as "rows on the group's own fill".
2. **`Card` `flat` draws no fill** (the contract's "none"; 004's flat kept the surface fill). `overMap` is the opaque
   `surface` with the hairline (`border-separator`) and the second lift, whatever the variant; the 004 `border-border`
   and "no shadow over the map" are gone (C5-18). `pending` is `border-amber-line`, dashed.
3. **A pressable card's children keep their own tones while held**, so a `muted` line on the pressed fill is 6.68:1 in
   `light-contrast` (the pair `test/ui-kit/pressed-fills-chip-row-card.test.ts` already pins). `ListRow`, whose text the
   adapter owns, turns its description to the ink while held, as review rule 7 asks.
4. **`StatTile`**: `accessibilityLabel` is optional (composed as "14 of 195 countries"; required when `value` is an
   element, such as `AnimatedNumber`); `valueTestID` lands on the numeral because `globe-stat-countries` is "the plain
   number"; a pressable tile defaults its glyph to `chevron-right`, and the glyph (the default or the caller's `icon` key) is 16 dp in
   the `duotone` weight, the one C5-8 gives the stat tiles.
5. **`AreaPill` is a `Card variant="tile"`** (so its pressed fill and focus ring are the card's) named with the lock and
   the warning in words ("Expenses, 842 EUR, only you can see this"). The lock is the `lock` key, 16 dp in the `aquaInk`
   tone, on a 20 dp aqua-tint disc in the corner of the tile; `PrivacyChip` (T520) is the capsule for a line of words and
   is not reused for it.
6. **`Field`** draws its focus ring, fill and invalid boundary from state in the style (outline width 0 at rest) and does
   not rely on the kit's platform-specific `focus:` classes; the label stays in the ink while invalid; the multiline
   padding is 12 dp (`py-3`, 24 dp of a floor) and the floor 56 dp.
7. **`HomeSkeleton` takes the disc as props** (`discRadius`, `discCentreY`) because `globeFit()` (T531) does not exist yet;
   the screen passes `globeFit('half')`. The sky behind it is the screen's `Scrim`.
8. **`EmptyState` art is drawn in `state-art.tsx` with plain views** (a dashed circle for `ghost-stamp`), not the SVG
   `GhostStamp` (T523): an empty state does not wait for the SVG layer, and swapping it is one component.
9. **`Toast` is 5 seconds** (the contract), not the prototype's 10; `durationMs` overrides it. How far it sits above the
   pill is the provider's `toast.insets.bottom` in the root layout, set once, not each toast's. The action is the kit's
   `Toast.Action` (a 48 dp ghost `Button`) with an `accent-press` label, not a `Tappable`, because a pressed fill from
   `Tappable` would be a light patch on the navy toast.
10. **Icon keys** (the T518 registry; no `{ ios, android }` name is left in these files): `AreaPill` `lock` (aquaInk), the
    icon of each pill is the caller's key; `Banner` `wifi-off` (amberInk) for offline and `cloud-off` (danger) for a sync
    error; `Field` `alert` (danger, `ALERT_ICON`) beside an error and `info` (muted) beside the helper text;
    `StatTile` `chevron-right` (`CHEVRON`) or the caller's key, `duotone`; `PhotoBone` and the empty `frames` `map-pin`;
    the empty `filtered` art `search`; `PermissionState`'s glyph is the caller's key (`camera`, `images`). The registry has
    no camera with a slash, no cloud with an exclamation mark and no magnifier with a cross, which the prototype draws
    for the denial, the sync error and no-results art: `camera`, `cloud-off` and `search` stand in (a one-line key each
    if the owner wants them).
11. The kit stand-in (`test/mocks/heroui-native.tsx`): `Label` is a pressable root with a `Label.Text` part; `Toast` mirrors
    the kit's `status` role and polite live region (it was `alert`); `mockToast.show` and `hide` accept arguments.
12. `lift.ts` is only the hook: the one mapping from a lift to a style is `lift-style.ts` (T519), which the icon buttons and the
    sync chip already used; the first version of this branch carried its own copy, now removed.

### Not done here, and why

- No screen was migrated: `Banner`, `Toast`, `PermissionState`, the screen skeletons, `StatTile` and `AreaPill` have no call
  site yet (T529, T536 to T548, T553 to T559). `components/globe/**` and `components/trip/**` are untouched except three
  test files of the globe cards that pinned the 004 classes.
- `Toast` still needs the provider's `insets.bottom` and the one-line `GestureHandlerRootView` check on a device.

### Device-only checks

- A `boxShadow` on a kit Surface that has `overflow: hidden` (the lift) is drawn outside the card on iOS and on Android
  9 and later; the `elevation` fallback below Android 9.
- `border-separator`, `shadow-none` and our other utilities beat the kit's component classes (`surface__root`,
  `list-group__item`, `label__text`) in Uniwind, as `bg-surface` did in 004 (the real-render tests prove the order of the
  strings, not the cascade).
- The Field focus ring (2.5 dp, 2 dp gap) on both platforms, with the sheet's keyboard up; the invalid boundary and the
  ring together.
- The skeleton shimmer at 1.4 s in `skeletonHighlight`, still under reduced motion and under the provider's
  `animation: 'disable-all'`; the hero pin glyph.
- The toast: announced once by VoiceOver and TalkBack (the kit renders the root twice, the second copy invisible and
  `pointerEvents="none"`), the countdown bar shrinking toward the start edge in a right-to-left layout, the Undo target.
- `StatTile` at font scales 1, 1.15, 1.5 and 2 in four themes (the row layout), `AreaPill` four across at 390 dp.

---

## As built (T539 to T542): the trips list

Branch `feat/005-trips`. Test-first: every pure derivation, adapter and screen below has its test file, observed red
before the code (a module that did not exist, or a screen that did not match). Visibility posture of everything here:
**private, local, never transmitted, nothing new stored** (FR-084, D5-17); the filter is component state.

### Files

| Area               | Files                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Derivations (T539) | `features/trips/trip-card-model.ts` (card model, `buildTripCards`, `stopStrip`, `dayOfTrip`, `daysToGo`, ...), `trip-sections.ts` (`composeTripList` and its lookups), `use-trips.ts` (now returns `TripCardModel[]`), `use-today.ts` (the local day as state), `db/repositories/stops.ts` (`allActiveWithCountryQuery`) |
| Words (T540)       | `features/trips/trip-card-copy.ts`, `formatMonthYear` in `trip-date-range.ts`                                                                                                                                                                                                                                            |
| Components (T540)  | `components/trip/`: `trip-hero-card`, `ticket-card`, `trip-row`, `stop-strip`, `year-header`, `year-scrubber`, `trip-cover-art` (replaces `trip-cover-band`)                                                                                                                                                             |
| Screen (T541)      | `app/(tabs)/trips/index.tsx`, `components/trip/trips-list-parts.tsx`, `use-tab-zone.ts`, `features/trips/use-trips-sync.ts`, `components/ui/plan-trip-fab.tsx`, `components/ui/list-screen.tsx` (additive props)                                                                                                         |
| Removed            | `components/trip/trip-card.tsx`, `trip-cover-band.tsx`, `plan-trip-action.tsx` and `test/components/trip-card.test.tsx` (nothing imports them; their behaviour is in the new tests)                                                                                                                                      |

### `TripCardModel` and `composeTripList` (T539), data-model section 6

```ts
interface TripCardModel extends TripSummary {   // every 004 field keeps its name: trip, stopCount, status, cover, dateRange
  id: string; title: string;                    // trip.id, trip.title, flat as the data model names them
  generated: { palette: 0 | 1 | 2; iso2: string | null; initial: string };   // fnv1a32(id) % 3
  country: { iso2: string; name: string } | null;   // the first stop whose city is cached
  lengthDays: number | null;                    // end - start + 1
  dayOf: { day: number; of: number } | null;    // active only
  daysToGo: number | null;                      // planning with dates only
  strip: ('done' | 'now' | 'next' | 'later')[]; // one per stop
  stripLabels: string[];                        // three letters of the city, '' when not cached
  distanceKm: number;                           // the globe's own placedLegs, so list and globe agree (FR-082)
  pending: boolean;                             // the trip or any stop is_dirty
}
composeTripList(trips, filter): TripListItem[]  // hero | ticket | row | yearHeader { year: number | 'none', tripCount, distanceKm }
tripFilterCounts, tripSpan, tripItemType, tripItemKey, yearOfItems, listedYears, yearHeaderIndex, YEAR_SCRUBBER_MIN_TRIPS (200)
```

Order as built: hero (earliest-arrival active trip), ticket (earliest-start planning trip WITH dates), further active trips
as rows, then year groups: "none" first (trips with no stops, newest created first), then years newest first, inside a year
the newest start first. A tie keeps the order `useTrips` gave (most recently changed first). A header counts the rows UNDER it
(the hero and the ticket are not counted again under their year, as the prototype's "2026 · 1 trip · 9,380 km" shows). The
filter is applied before composition, so "Planned" has its own ticket. On a day of transfer the later stop is `now`; an earlier
stop that overlaps it is `done`.

`useTrips` reads the stops WITH their city and country (`stopsRepository.allActiveWithCountryQuery`, in the globe's leg order)
and, like `useGlobe`, keys that read on the city cache (`cityCountQuery`'s `updatedAt`), because `useLiveQuery` subscribes to the
FROM table only; a city cached after the first render gives the card its flag on the next change. The cache query holds neither
`loading` nor `error`: until a city arrives a card has no flag and the covers are generated. Referential stability: each field of a
card is kept when deep-equal (`sameData`), a card when every field is, the list when every card is
(`test/features/use-trips-cover.test.tsx` passes unchanged).

### The cards (T540)

| Component      | API                                       | As built                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TripHeroCard` | `trip: TripCardModel`, `onPress`          | A `Tappable` (`feedback="ring"`) with the first lift; inside, a clipped 24 dp frame (`trip-card-<id>-frame`, minimum 219 dp): cover, `Scrim bottom`, a status row (`StatusChip` "Active · Day 3 of 8" and the `SyncBadge` text and icon, wrapping), and the caption scrim holding the flag and "Portugal · 3 stops" (eyebrow), the title (2 lines), the dates and nights, the `StopStrip` |
| `TicketCard`   | `trip`, `onPress`                         | 88 dp thumb, text, 88 dp stub (`trip-card-<id>-stub`) with a 2 dp dashed `sand` edge and two canvas notches; at font scale 1.15 and above a column (thumb 88 dp high, stub a row under a dashed top edge, no notches). Pressed fill on its own surface                                                                                                                                    |
| `TripRow`      | `trip`, `onPress`                         | 72 dp minimum, 64 dp thumb (56 at large text) with a hairline, title (1 line, 2 at large text), "Japan · Mar 2026 · 9 days" with the flag, `PressCue`; a `StatusChip` under it for an active or planned row; `SyncBadge` when pending                                                                                                                                                     |
| `StopStrip`    | `dots`, `labels?`                         | 12 dp dots in a 16 dp halo box, a 2 dp link solid up to a done or current stop and dashed beyond; filled / thick ring with halo / ring 2 dp / ring 1.5 dp; labels only up to 5 stops; hidden from AT; ids `stop-strip`, `-dot-<i>`, `-halo-<i>`, `-link-<i>`, `-label-<i>`                                                                                                                |
| `YearHeader`   | `year`, `tripCount`, `distanceKm`         | `headline` year + "N trips" + the distance (`formatDistance`, the device's unit); one heading "2026, 1 trip, 9,380 kilometres"; `bg-background` and a hairline for sticking; id `year-header-<year>`                                                                                                                                                                                      |
| `YearScrubber` | `years`, `activeYear`, `onJump`, `style?` | `adjustable` ("Jump to year", value the year, `increment` = later, `decrement` = earlier); touch and drag by responder events (`locationY`), a selection haptic per year change; newest seven + a dot + the oldest above nine years; 28 dp wide, `hitSlop` to 44; ids `trips-year-scrubber`, `-year-<year>`                                                                               |
| `TripCoverArt` | `trip`, `thumb?`                          | fills its parent (`absoluteFill`): the thumbnail through `expo-image` (`recyclingKey` = photo id, `cachePolicy` `memory-disk`, 220 ms fade, none under reduced motion) or `GeneratedCover` when there is none or `onError` fired for that thumbnail's address; ids `-cover`, `-photo`, `-generated`                                                                                       |

Every card is ONE `Tappable`, role button, hint "Opens the trip", id `trip-card-<id>`, and its accessible name is the 004 one
word for word: `${title}, ${status}, ${describeStopCount(stopCount)}`. Each card writes that template where it sets
`accessibilityLabel` so the id parity guard still reads `<param>, <param>, <param>` (a helper would hide it: the parity run
failed on the baseline name until it was inlined). The hero's day and the ticket's countdown are the control's
`accessibilityValue` ("Day 3 of 8", "Starts in 94 days", "Starts tomorrow"), additive, never part of the name. Decoration (cover,
strip, flag, cue, notches) is hidden from AT. Ids of the 004 card kept where the element still exists: `-cover`, `-photo`,
`-cue` (row), `-status-row` (hero), `-meta-row` (all three); `-initial` is gone with the typographic cover (the generated cover's
glyph is `-generated-glyph`).

### `PlanTripFab` (T541), `components/ui/plan-trip-fab.tsx`

```tsx
<PlanTripFab screen="trips" | "home" onPress bottomInset={tabZone} hidden? />
planTripFabHidden({ tripCount, sheetFull? }): boolean   // Home: hidden at the full detent and with no trips
```

A `Button` (`primary`, `lg`, a plus, "Plan a trip") on the second lift, `absolute`, `bottom = bottomInset + 16`, `end = 16 +
the larger side inset`. A full pill on iOS, a rounded square (16 dp) on Android, the same words on both. The id is a table of the
screen: `trips-plan-trip` (Trips; unique there) and `home-plan-trip-fab` (Home; `home-plan-trip` stays the invitation card's
action). **For the Home branch**: import it, pass `screen="home"`, `bottomInset={tabZone}` and
`hidden={planTripFabHidden({ tripCount, sheetFull })}`. Trips never hides it, in the empty, loading and error states either (flow 01
taps it from an empty list). `hidden` draws nothing at all.

### The screen (T541)

`ListScreen` (additive optional props: `getItemType`, `stickyHeaderIndices`, `listRef`, `onViewableItemsChanged`,
`viewabilityConfig`, `bottomInset`, `horizontalInset`, `endInset`, `itemGap`; with none the list is what it was) carries the mixed list. The
screen passes `getItemType = item.type`, the header indices as sticky, `itemGap={0}` (a card item pads 16 dp under itself, a row
12 dp, a header none), `horizontalInset` 20 (16 on Android: `ScreenMargin`), `endInset` 44 while the year strip is shown (the prototype's `padding-right: 44px`; a new optional prop of `ListScreen`), `bottomInset = useTabZone()` and a footer
`trips-fab-clearance` of the button's minimum at this text size plus 16. Under the native title: `trips-count` ("22 trips", and
from 200 "214 trips · since 2009"), `trips-filter` (`SegmentedPill`, `trips-filter-all|active|planned|past`, "Active, 1"; counts
are over the whole list and do not move with the filter), and `trips-sync-banner` when there is a banner. States: `trips-skeleton`
(`TripListSkeleton`; the filter is drawn with no counts), the 004 error words, `trips-empty` "No trips yet" with the secondary
`trips-empty-plan-trip`, and `trips-filtered-empty` ("No planned trips", "Show all trips" = `trips-filter-reset`). `trips-list` is
on the scroller only when the list has items. From 200 trips `YearScrubber` sits at the vertical middle of the right edge and
jumps with `scrollToIndex` to the year's header; the year in view follows `onViewableItemsChanged`.

**`useTabZone`** (`components/trip/use-tab-zone.ts`) reads React Navigation's `BottomTabBarHeightContext` (exported by
`expo-router/js-tabs`) and answers 0 outside a navigator; `useBottomTabBarHeight()` (documented at
docs.expo.dev/router/advanced/tabs) throws there. On this branch the bar is still the flat strip in the navigator's flow, so the
zone is its height and the screen pads and floats a little more than it needs; it is never too little, and exact once the pill merges.

**The sync seam** (`features/trips/use-trips-sync.ts`): the chrome branch writes `features/sync/use-sync-chip-state.ts` (T529).
Until it lands `useTripsSync(watch)` derives the same `SyncChipState` from `syncRepository.countUnsynced` (re-read when the list,
the sync phase or the last success changes) and `useSyncStatus()`: a running cycle with rows waiting is `syncing` (it wins over the last failure; with nothing waiting it is a pull and the chip says nothing, or it would flash "0" on every cycle), a
failure to reach the server is `offline`, any other failure `failed`, rows waiting `waiting`, `unauthorized` says nothing. It returns
`{ chip, banner, retry }`; the chip goes to the header (`headerRight`, only `failed` is a button) and the banner under the filter
("Offline. 3 changes will sync when you're back online." / "Couldn't sync 2 changes. Your trips are safe on this phone." with Retry).
**To wire T529: replace the body of `useTripsSync` (one import in `trips/index.tsx`).** Its limit, written in the file: the count is
re-read when the list changes or a cycle moves, not on every write to a table the screen does not read.

### Where the build differs from the contract text above

1. `composeTripList(trips, filter)` has no `today` parameter: the statuses, `dayOf`, `daysToGo` and `strip` are in the model, so the
   composition has no clock. `TripCardModel` extends `TripSummary` instead of replacing it, so `cover` stays the 004 `TripCover`
   (photo or typographic) and the generated cover is the separate `generated` field; `stripLabels` is new.
2. The ticket's label is NOT extended with the stub ("in 94 days", C5-19): FR-075 and the parent brief fix the name; the countdown
   is the accessibility value.
3. The hero's sync marker is the full `SyncBadge` (icon and "Not yet synced"), not the glyph-only disc of the prototype: US2
   scenario 6 asks for text and icon, and the Maestro flows wait on "Not yet synced" (a disc would end a `notVisible` wait early).
4. A row shows a status chip when its trip is active or planned. The prototype draws only past rows; FR-070 forbids a planned
   trip that reads as a past one.
5. The count line is a caption under the native title, not a trailing caption beside it (the native large title takes no trailing view),
   and the chip is the header's `headerRight` (iOS: top bar, not the title row).
6. The strip's abbreviations are the first three letters of the city ("LIS", "SIN", "POR": the prototype's IATA-like codes need a data
   source this app does not have) and are drawn only up to five stops.
7. The year header shows nothing for a year it has no kilometres for.
8. `useTrips` reads the day from a new `useToday` (`features/trips/use-today.ts`: a timer to just after local midnight and a re-read on
   return to the foreground), not once when the store last changed: a tab screen never unmounts, so "Day 3 of 8" would otherwise
   still read "Day 3" the next morning. A `today` argument still wins (the suites that pin a date).
9. While a cycle runs with nothing waiting the sync chip says nothing (a pull is not the traveller's change): `SyncChip`'s figure for
   `syncing` is the count, and a count of 0 would flash "0" with a spinner on every periodic cycle.

### Verified from source

- `react-native` 0.86 `Pressable` resolves a function `style` and `children` for the host node, and turns `accessibilityValue` into
  `{ min, max, now, text }` (the tests read `.text`); `StyleSheet.flatten` of the host style reads the lift (`boxShadow`).
- `@shopify/flash-list` 2.0.2: `getItemType`, `stickyHeaderIndices`, `onViewableItemsChanged`, `viewabilityConfig` and the `ref`
  (`FlashListRef.scrollToIndex`) are list props; Jest replaces `FlashList` with `RecyclerView`, which renders a window of the items (the
  200-trip test draws far fewer than 214 cards).
- `expo-image` 57.0.x: `cachePolicy` accepts `memory-disk`; `onError`'s event is `{ error: string }` and names no source (so the failure
  is kept against the address shown when it arrives, as in 004).
- Yoga positions an absolute child from the padding edge (inside the border): the notch's `left: -9` over a 2 dp edge centres the circle
  on the edge, as the prototype's CSS does.
- `expo-router/js-tabs` exports `BottomTabBarHeightContext` beside `useBottomTabBarHeight` (`build/react-navigation/bottom-tabs/index.d.ts`).
- `syncRepository.countUnsynced` is synchronous and covers the seven tables (byte-backed rows only once uploaded); `useSyncStatus` is a
  zustand store (`phase`, `failure`, `lastSyncedAt`).

### Device-only checks (add to T547)

- The first lift under the hero and the ticket: it is on the transparent `Tappable` around a clipped frame (iOS and Android 9+); the
  Android elevation fallback below 9.
- The ticket's dashed edge: React Native draws a dashed border of one side on a view with no radius; the notches clip half a circle
  at the card edge on both platforms.
- The year strip: `locationY` is the strip's own because its labels are `pointerEvents="none"`; a drag across it keeps the list from
  scrolling; sticky headers under `contentInsetAdjustmentBehavior="automatic"` with the large title collapsing.
- The thumbnail is drawn on a 390 dp hero (a "card" derivative of D5-09 is not built): sharpness on a 3x screen.
- The flag emoji at 20 by 14 dp over a photograph and on the generated cover (V6), the caption scrim over a bright photograph in the four
  themes (gated by `scrim.test.tsx`, to be looked at), the chip in the iOS 26 header (it may sit in the system's glass bubble).
- Scrolling 214 trips (SC-006) against the baseline, with the tab pill.
- `useToday` on a device: a hero left open across midnight says "Day 4 of 8" at 00:00:01, and one resumed after a night in the
  background says it at once (the timer sleeps in the background, the return to the foreground reads the clock).
- The year strip beside more than nine years: the touch maps the whole height onto every year, the labels show the newest seven, a
  dot and the oldest (a guide), so a drag through the middle lands on years that have no label. Feel it with 15 or more years.
- The Maestro flows that assert two or three trips at once (`offline/07-b`, `10-b`: "Gate baseline", "Gate bulk", "Gate over
  allowance") assume they share the first screen. The hero is 235 dp with its gap, a row 84 dp: count it on the smallest phone.
- The Maestro flows themselves (not runnable here): the audit is under "Maestro flow edits" in `tasks.md`.

### Maestro audit (T542): `01`, `02`, `05` and every `offline/*` that touches Trips

Read against the new screen; Maestro itself cannot run here. Matching is taken as Maestro documents it: a regex over the whole of an
element's text, accessibility text (content-desc, label) or hint, case-insensitive.

| Step (flow)                                                                                                      | Resolves as                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tab-trips`, `trips-screen` (01, 02, 03, 04, 05, offline)                                                        | ids kept (the parity run holds: 205 testIDs, 64 labels)                                                                                                                                                                                                                                                                |
| `assertVisible: 'No trips yet'` then `tapOn: trips-plan-trip` on an empty list (01)                              | the empty state's text; the button is the FAB, drawn in the empty state too (the header action of iOS is gone, one control on both platforms)                                                                                                                                                                          |
| `tapOn: trips-plan-trip` with trips (02, 03, offline `add-trip`, `15-a`)                                         | the FAB, `trips-plan-trip`, unique on the screen                                                                                                                                                                                                                                                                       |
| `assertVisible: 'Italy, spring 2026'` and `tapOn: 'Italy, spring 2026'` (01)                                     | the title text of a hero, a ticket or a row                                                                                                                                                                                                                                                                            |
| `assertVisible: '2 stops.*'` (01)                                                                                | **edited** to `'.*2 stops.*'`: no text starts with it any more (see "Maestro flow edits")                                                                                                                                                                                                                              |
| `assertVisible: 'Planning'` (01, line 156)                                                                       | **does not resolve, before or after**: the stop editor pre-fills today and tomorrow, so that trip is Active and the list shows "Active" (the Atlas chip) or "Active · Day 1 of 3" (the hero's). Not edited (a step that was wrong before, not a text this feature changed); listed under "Maestro flow edits" as found |
| `tapOn: 'Swiss notes'`, `'Rome archive'`, `'Gate baseline'`, `'Gate bulk'` ... (02, 05, offline)                 | the title text; rows are about 84 dp, so more trips are on screen than with the 004 cards                                                                                                                                                                                                                              |
| `assertNotVisible` and `notVisible: 'Not yet synced'` on the list (offline `00-a`, `03-a`, `07-b`, `13-b`, `15`) | every card that is waiting says the words: the ticket and the row through `SyncBadge`, **the hero too** (a glyph-only disc would have ended these waits early)                                                                                                                                                         |

No other flow step reads the Trips screen. Left for T538 and T546, not Trips: `'Active'` on the trip screen (03, 04), see below.

### For the other branches

- Flows 03 and 04 assert `'Active'` on the trip screen. `StatusChip` with `dayOf` writes "Active · Day 3 of 8" in ONE text, so an exact
  `'Active'` no longer matches wherever `dayOf` is passed (the trip screen's progress row, T543/T546): either keep a separate "Active" text
  there or make the assertion `'Active.*'` and record it (T538/T546).
- The pill's merge (T526) removes the interim padding of `useTabZone`; nothing else here knows about the bar.
