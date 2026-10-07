# Contract: Component Adapter Layer (Atlas)

**Feature**: `specs/004-app-ui-redesign` | **Consumers**: every screen | **Supersedes**:
`specs/002-neumorphic-ui/contracts/surface-components.md` C8 to C11 (C12 and C13 are kept, restated in
`screens.md`).

The adapter layer is `apps/mobile/src/components/ui/`. It wraps the UI kit (HeroUI Native on Uniwind,
research D4-02) in this app's own API and guarantees, so screens, tests and the fallback never depend on
the kit.

---

## C4-6. The adapter boundary

**Rules**

1. Screens and feature components import UI primitives **only** from `@/components/ui/*`.
2. Only files under `src/components/ui/**` and test files may import `heroui-native` or `uniwind`
   components. (`useCSSVariable` and `Uniwind` in the root layout and theme hook are the two allowed
   exceptions outside the folder.)
3. Adapters take the app's own props (below), not the kit's; kit props the app does not need are not
   re-exported.
4. Every adapter that renders a control requires an accessible name and forwards `testID` unchanged to
   the node a test or Maestro flow finds it by.

**Fallback** (research D4-02): if the spike fails, each adapter is re-implemented on React Native
primitives with the same tokens; this contract and every screen are unchanged.

**Enforcement**: `no-restricted-imports` in `eslint.config.js`; a unit test that fails if a file outside
the allowed folders imports the kit.

---

## C4-7. `Tappable` and `Button`

```tsx
<Tappable accessibilityLabel onPress busy? disabled? hitSlop? style? testID? />
<Button
  variant="primary" | "secondary" | "text" | "destructive"   // FR-005
  size="md" | "lg" | "sm"
  accessibilityLabel                                          // required
  busy? disabled? icon? iconOnly?
  onPress testID? >label</Button>
```

**Guarantees** (the non-visual contract of the retired `PressableSurface`, kept)

- `accessibilityRole` is `button`; `accessibilityState` carries `disabled` and `busy`.
- Minimum touch target 44 dp (iOS) or 48 dp (Android), scaled by the font scale so large text does not
  clip (FR-026, FR-029), independent of the visible size.
- A visible focus indicator at 3:1 that does not depend on the pressed appearance (FR-024).
- A pressed appearance within 100 ms of touch-down (FR-019); busy shows a spinner and ignores presses;
  disabled is flat, announced unavailable and ignores presses.
- `busy` and `disabled` are mutually exclusive; both set throws in development (data-model §6).
- A haptic on press according to `useHaptics()` for `primary` and `destructive` only; none under reduced
  motion (FR-020).
- At most one `primary` per screen state is a **review rule**, asserted in screen tests where practical
  (FR-005).

**Mapping**: `primary` to the kit's `primary`; `secondary` to `secondary` (tonal); `text` to `ghost`;
`destructive` to `danger-soft` (and `danger` for the confirmation action).

**As built (T417)**

- `icon` is an `IconName` drawn by `Icon` in the ink that reads on the variant's fill, so a caller cannot choose an
  unreadable one. `variant` defaults to `primary` and `size` to `md`.
- A busy button is announced `{ busy: true, disabled: true }` (the kit has no busy state), keeps its label and swaps
  its icon for a spinner, and is not dimmed (a disabled one is). `busy` and `disabled` both set throws in
  development, as does a blank label. Neither the kit nor React Native can announce a button unavailable while the
  kit still sees it enabled, so both go to the kit as `isDisabled` and a busy one cancels the 50% opacity.
- The kit's fixed heights (sm 40, md 48, lg 56 dp) are replaced by a minimum: the larger of the kit height and the
  platform floor scaled by the font scale (`h-auto` plus a style `minHeight`), so `sm` is raised to the floor and a
  wrapping label grows the button. An icon-only button is a fixed square of the floor.
- The kit's press highlight is turned off (it overlays the 20% soft hover, which review rule 5 forbids under text,
  and it disappears under `animation: 'disable-all'`); each variant swaps to a fixed `active:` fill instead:
  `accent-hover` for primary, `separator-secondary` for secondary and text, a 5% danger tint for destructive. Each
  is at least a 1.08:1 step from the resting fill on canvas, surface and overlay and keeps its label at 4.5:1 (7:1
  in the contrast themes) in all four themes, measured by `test/theme/adapter-pressed-fills.test.ts`. The kit's
  4% hover and `surface-tertiary` (which IS the overlay colour in dark) were measured and rejected. The kit's scale
  stays.
- `primary` plays the selection haptic and `destructive` the warning haptic; the success haptic is the caller's,
  once a save has succeeded. `Tappable` is the bare form: no fill, a `separator-secondary` pressed fill, a 2 dp focus
  outline 2 dp outside the control, a minimum target scaled by the font scale. `Tappable` and `Button` read the
  font scale from `useWindowDimensions`, not `useAppearance` (T461 follow-up).

---

## C4-8. Containers, lists, fields, chips, states

| Adapter                                                 | Replaces       | API                                                                                        | Guarantees and preserved identifiers                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`                                                | `Screen`       | `testID`, `edges`, `keyboardAware`, `style`, `underHeader?`                                | Paints the canvas (`bg-background` and the token style); scrolls at the largest text size; `keyboardShouldPersistTaps="handled"`; opt-in `underHeader` (native header above): default edges `['bottom']`, `contentInsetAdjustmentBehavior="automatic"`           |
| `ListScreen`                                            | `ListScreen`   | unchanged generics, `underHeader?`                                                         | `FlashList` is the scroller (D-23); header, empty and footer travel with it; the same `underHeader` opt-in as `Screen` (edges `['bottom']`, `contentInsetAdjustmentBehavior="automatic"`)                                                                        |
| `Text`, `ThemedText`                                    | `ThemedText`   | `type`: `largeTitle`, `title`, `headline`, `body`, `callout`, `caption`, `numeric`; `tone` | Semantic classes, so increased contrast comes from the theme (no JS promotion); `numeric` is tabular; `largeTitle`, `title` are headers; never capped; `ThemedText` is unchanged until phase 7, not a shim                                                       |
| `Card`, `Panel`                                         | `Surface`      | `variant="raised" \| "flat"`, `overMap?`, `pending?`, `radius?`, `onPress?`, `cue?`        | `overMap` is opaque, hairline, `shadow-none`, no tint (FR-018, FR-033); a card never contains a card, a development error (FR-006); `pending` adds a dashed `border-pending` edge (FR-034); `onPress` makes the card one control with a chevron cue (FR-024)     |
| `ListGroup`, `ListRow`                                  | row layouts    | `title`, `description?`, `leading?`, `trailing?`, `onPress?`, `accessibilityActions?`      | A pressable row shows a chevron at 3:1 unless it supplies `trailing` (FR-024); row-level `accessibilityActions` are forwarded (stop rows keep move up, move down, edit, delete); `tone="destructive"` is danger ink plus an icon (FR-025)                        |
| `Field`                                                 | `TextField`    | `label`, `value`, `onChangeText`, `error?`, `description?`, `isRequired?`, TextInput props | `testID` lands on the input; `accessibilityLabel` is the label; `aria-invalid` when an error exists; error is words under the field, never colour alone (FR-025); `secureTextEntry`, `textContentType`, `autoComplete` and `keyboardType` pass through unchanged |
| `Chip`                                                  | pill buttons   | `label`, `accessibilityLabel`, `selected?`, `onPress?`, `leading?`, `disabled?`            | Selected is shown by fill, weight and a check glyph, not colour alone                                                                                                                                                                                            |
| `ChipGroup`                                             | `PillGroup`    | `options[{key,label,testID,accessibilityLabel}]`, `selectedKey`, `onSelect`, `scroll?`     | Keeps `radiogroup` and `radio` roles with `selected` and `checked`; selection plays a selection haptic; may scroll sideways (FR-009 and 003 FR-017)                                                                                                              |
| `StatusChip`                                            | `StatusPill`   | `status: 'planning' \| 'active' \| 'past'`                                                 | Keeps `testID="status-pill-<status>"` and label "Status: …"; icon and text carry the state; colours from the status tokens                                                                                                                                       |
| `SyncBadge`                                             | `SyncBadge`    | `state: 'pending' \| 'syncing' \| 'failed'`                                                | Icon and text, announced with a text equivalent ("Sync pending", "Sync in progress", "Sync failed"); `pending` ink while waiting, `danger` when failed; reflects props, queries nothing (002 C11 kept)                                                           |
| `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton*` | `state-view`   | `title`, `detail?`, `icon?`, `action?`, `onRetry?`; lists: `variant`, `rows?`, `label?`    | Flat surface, no nested card; loading is ONE `progressbar` (spinner hidden); error = words, alert icon, danger ink, secondary "Try again"; empty names its next action; a skeleton is ONE `progressbar` named `label`, shapes hidden (FR-021, FR-025, FR-035)    |
| `FormActions`                                           | `FormActions`  | `testIDPrefix`, `saveLabel`, `onCancel`, `onSave`, `saveDisabled?`                         | Keeps `<prefix>-cancel` and `<prefix>-save`; Save is the single primary, Cancel a text button; the row wraps at large text; sticky above the keyboard is the screen's concern (FR-005, FR-009, FR-029)                                                           |
| `InlineError`                                           | `InlineError`  | `message`, `testID`                                                                        | `accessibilityRole="alert"` and `testID` on one focusable node; danger ink with a leading alert icon, never colour alone (FR-025)                                                                                                                                |
| `Icon`                                                  | ad-hoc symbols | `name: { ios, android }`, `size: 16 \| 20 \| 24`, `tone?`, `label?`                        | One vocabulary over `expo-symbols`; decorative icons are hidden from assistive technology, meaningful ones (`label`) are announced as images                                                                                                                     |
| `Avatar`                                                | none           | `name`, `size?`, `decorative?`                                                             | Initials from the display name (up to two words, `?` when empty); announced by the name unless decorative                                                                                                                                                        |
| `MediaFrame`                                            | `MediaFrame`   | unchanged                                                                                  | Frames photographs with a hairline; **never** wraps them in a parent whose shadow bleeds inward (002 C12)                                                                                                                                                        |

**As built (T418, T419, T424)**: the table above states the contract; these are the decisions and the places the
built API goes beyond it.

- **`Card`**: `variant` defaults to `raised` and `radius` to `lg` (16 dp; `md` 12, `xl` 24; continuous corner).
  `raised` is the kit's own surface (`bg-surface` and its soft light-theme shadow `--surface-shadow`); `flat` is the
  same fill with `shadow-none`; neither draws an edge (FR-006). The kit's Surface carries `box-shadow` in its own
  stylesheet, so "no shadow" has to be asked for: `shadow-none` is the one shadow class used, and it cancels, never
  adds. `overMap` is `bg-surface border border-border shadow-none` whatever the variant, with no opacity suffix and
  no translucent style (a test pins it); `pending` is `border border-dashed border-pending` (it replaces the
  hairline of an `overMap` card, it does not stack on it) and is only the edge: `SyncBadge` stays the text and icon
  marker (FR-025, FR-034).
- **A pressable `Card`** (`onPress`, which makes `accessibilityLabel` a required prop by type and, in development,
  at run time) is ONE `Tappable` around the kit surface, so role `button`, `disabled` and `busy` announced and
  inert, the font-scaled minimum target and the focus ring (which follows the card's corner) are `Tappable`'s.
  `testID` lands on that control; the surface inside is `<testID>-surface` and the cue `<testID>-cue`. The pressed
  fill belongs to the card (`bg-surface-tertiary`, at once), so the control behind it paints nothing. The trailing
  chevron (`PressCue`, muted ink, the gate's "row cue" pair) is on unless `cue={false}`. Extra props beyond the
  contract: `cue?`, `disabled?`, `busy?`, `className` and `style` (layout only, on the outermost node), and, on a
  card with no `onPress` only, `accessibilityLabel?`, `accessibilityHint?`, `accessibilityRole?` (a notice card is
  `accessibilityRole="alert"`); a plain card announces nothing of its own.
- **One surface in another** is a development error, shared by `Card` and `ListGroup` (`surface-nesting.tsx`): any
  raised container inside another, through any number of `Panel`s, throws; it is a no-op in a release build. A
  `ListGroup` counts as a raised surface (this goes beyond the contract text, which names only cards).
- **`Panel`** is a plain `View`, not a kit Surface: no fill, no edge, no shadow, no padding, so it adds no depth
  level and may sit on the canvas or inside a card (the kit's Surface clips its children, which would cut off the
  shadow of a card placed in it). Its optional `title` is a `headline` announced as a heading.
- **`ListGroup`** is the kit's group in a continuous `lg` corner with an inset (`ms-4`) kit `Separator` between
  rows (`<testID>-separator-<n>`); rows must be direct children or arrays (a Fragment is one child). `header` is a
  muted `caption` heading above the group.
- **`ListRow`**: `testID` lands on the row. A pressable row is role `button`, announced `disabled` and dimmed when
  it is, with the same font-scaled minimum height as `Tappable` and a held-press fill (`active:bg-surface-tertiary`)
  at once. Its focus ring is drawn INSIDE the row (the group clips to its rounded corners, which would cut off a
  ring outside; review rule 6 asks only that it never touch an accent fill); the default chevron is `<testID>-cue`.
  It sets no `accessibilityLabel` of its own: the platform reads the row's text, trailing text included. A row with
  no `onPress` is not a control (no role, not focusable, never announced unavailable) and is one element for
  assistive technology only when given an `accessibilityLabel` or `accessibilityActions`, so a trailing switch
  stays reachable. `tone="destructive"` is `text-danger` and a leading icon (a caution glyph, `<testID>-icon`,
  unless the caller passes `leading`).
- **`Screen` and `ListScreen`** gain `underHeader?: boolean` (default `false`; everything else unchanged): default
  edges `['bottom']`, `contentInsetAdjustmentBehavior="automatic"` on the scroll view or `FlashList`, the scroller
  the first child of the screen root (for `ListScreen`, first down the chain of first children: react-native-screens
  4.26 walks it, `RNSScrollViewFinder`). The canvas is the `bg-background` class AND the `ThemedView` canvas token
  style in both modes.

**As built (T422)**

- `state-view.tsx`, `form-actions.tsx` and `inline-error.tsx` are restyled in place: every export, prop, role and test id is
  the one the unmigrated screens already use. `Surface`, `PressableSurface` and `ThemedText` are no longer used inside them.
- The API is `EmptyState({ title, detail?, icon?, action?: { label, onPress, testID? } })`, `LoadingState({ title? = 'Loading' })`,
  `ErrorState({ title, detail?, onRetry? })`, `TripCardSkeleton`, `RowSkeleton` and `ListSkeleton({ variant: 'card' | 'row', rows? = 3 })`;
  each skeleton takes `label? = 'Loading'` and `testID?`.
- The state container is a plain `View` (`bg-surface rounded-2xl p-6 items-center gap-2`, continuous corners by style), not the
  kit's `Surface`, because that carries a 16 dp padding, a 3xl radius and the light theme's `--surface-shadow`.
- `LoadingState` is `accessible` with role `progressbar` and the title as its name. The kit `Spinner` is itself an accessible
  `progressbar`, so it is hidden (`accessibilityElementsHidden`, `no-hide-descendants`) and the region is announced once.
- `EmptyState` gained `icon?` and `action?`. The action is a `secondary` `Button` named by its label, `testID` forwarded; it is
  never a primary (FR-005). `ErrorState` gained the leading alert icon, and its retry is a `secondary` `Button` still named
  "Try again". Both buttons call back with no arguments (the press event is not passed on).
- Skeletons are built from the kit `SkeletonGroup` and `SkeletonGroup.Item`. A group root hands every prop except `className`,
  `style` and `children` to EACH item, so the accessibility props live on a wrapping `View`, never on the group. A region
  (`accessible`, `progressbar`, named `label`) wraps a second `View` that hides every shape. `ListSkeleton` draws `rows` shapes
  under one region: a fraction is truncated, a negative is none, a non-finite value is the default. Under reduced motion the
  provider (`animation: 'disable-all'`) stops the shimmer and the fades, so the shapes stay as static placeholders.
- `FormActions` renders Cancel (`text`) then Save (`primary`) in a `flex-row flex-wrap gap-3` row; each button is `grow max-w-full`,
  so they share the line and Save drops to its own line when the labels no longer fit at the largest text size. Save plays the
  `Button`'s selection haptic on press (silent under reduced motion); the success haptic is still the caller's.
- `alert-icon.ts` holds the one alert glyph (`exclamationmark.triangle` / `warning`) shared by `ErrorState` and `InlineError`.

**As built (T420, T421)**

- `Field` is over the kit's `TextField`, `Label`, `Input`, `FieldError` and `Description`. `testID` is the input's and
  `${testID}-error` the message's. An error is one `alert` element under the input; an empty string is no error; the
  description stays neutral beside it. `isRequired` shows the kit's asterisk and adds the hint "Required" (a caller hint
  wins). `editable={false}` is the kit's disabled state. The input's minimum height is the larger of the kit's 48 dp and
  the platform floor, scaled by the font scale and never below it. A multiline field starts at the top, with the kit
  TextArea's vertical padding.
- The kit's Android classes (`android:border-transparent`) hide the field border until focus, so `Field` asks for
  `android:border-field-border` again, except while invalid (the kit's `android:border-danger` must stay). The facts
  are pinned in `test/ui-kit/field-chip-kit-facts.test.ts`.
- `Chip` also takes `accessibilityRole?`, `testID?` and `className?` (layout only); `accessibilityLabel` is required.
  It shows selection by an accent fill, `font-semibold` and a check glyph that replaces the leading glyph; unselected is
  outlined in `border`, which the gate measures at 3:1 (a tone-on-tone chip would not reach it). Neither is a soft chip.
  The role is `button` (or the caller's; `text` without `onPress`), the state `{ selected }` plus `checked` for a radio
  and `disabled`. An interactive chip has a minimum size of the platform floor each way, 4 dp of slop, `overflow-visible`
  (the kit clips its root, which would cut the focus ring off), an `active:` fill gated for its text (never the 20%
  hover), and the 2 dp ring offset 2 dp.
- `ChipGroup` also takes `accessibilityLabel?` and `testID?` for its container. It is `PillGroup` with the same roles,
  ids and `{ selected, checked }` state. The selection haptic plays on a change, not on a re-press, and `onSelect` is
  still called for both. `scroll` is one sideways row with no scroll bar and `keyboardShouldPersistTaps="handled"`; the
  container is deliberately not an accessibility element, so its radios stay reachable one by one.
- `StatusChip` and `SyncBadge` are capsules of an `Icon` and a `caption` word: the ink on its 15% soft fill, exactly the
  pairs the gate measures (`status-active`, `status-past`, `status-planning-ink`, `pending`, `danger`). `Icon` gained
  `statusPlanning`, `statusActive`, `statusPast` and `pending` tones for them. `SyncBadge` keeps its ids, announcements and
  visible words (Maestro looks for "Not yet synced"), stays dashed, and hugs its content (`self-start`).

**As built (T427 trips and profile, T430)**

- `useStackHeaderOptions(title)` (`components/ui/stack-header.ts`) is the themed option set of a native stack header,
  an adapter because `useThemeColor` and `useCSSVariable` may not be imported under `src/app`; `stackHeaderOptions` is
  its pure half, asserted per platform. iOS: `headerLargeTitleEnabled` (`headerLargeTitle` is deprecated in router
  57.0.22), no shadow under either bar (`headerShadowVisible`, `headerLargeTitleShadowVisible` false), accent
  `headerTintColor`, foreground title ink, the canvas as `contentStyle`, and NO `headerStyle` background (a background
  on a large-title header hides the title on iOS 26, per the router's own note). Android: a standard header painted with
  the canvas, no large title. Display face: `--font-display` (weight `'600'`) for the title, `--font-display-bold`
  (`'700'`) for the large title, quotes stripped; left to the platform face when a variable is unreadable.
- `ListScreen` gained `listTestID?`, forwarded to the `FlashList` (which hands it to its scroll view): the id of the
  list itself, apart from the screen root `testID`.
- `TripCard` is a pressable `Card` with `cue={false}` and its own `PressCue` (`<id>-cue`) beside the text, because the
  cover runs to the card's edges (`-mx-4 -mt-4` over the kit Surface's 16 dp padding, clipped by its corner) and the
  default chevron would sit beside the picture. Ids, each written out in full where it is built (the id extractor
  reads them with the literal head `trip-card-`, and none is an unresolved forward): `trip-card-<id>`, `-cover`, `-photo`,
  `-initial`, `-cue`, `-status-row`, `-meta-row`. The date text is `formatDateRange`, which is `null` for a range it cannot
  read (the card then shows none). The title is announced as text, not a header (the card is one element). The cover falls back
  to the typographic look for a thumbnail address that errored, and tries a new address afresh.
- "Plan a trip" (`components/trip/plan-trip-action.tsx`): `PlanTripHeaderAction` (icon-only text `Button`: a plus, named
  "Plan a trip", a fixed 44 pt square not scaled with the font scale, in `headerRight`) on iOS; `PlanTripFab` (primary `lg` `Button`, `absolute`, 16 dp above
  the screen's bottom and `16 dp + the larger side inset` from its end) on Android, with `PlanTripFabClearance` as the
  list's footer. Both: `testID="trips-plan-trip"`, name "Plan a trip".

---

## C4-9. Tab bar and headers

**`TabBar`** (renamed from `NeumorphicTabBar`; same props from `BottomTabBarProps`)

- Flat strip of the canvas colour with one divider at 3:1 (`border` token); content at most 56 dp at the
  default text size, growing with text size (003 FR-013, FR-014).
- Each tab: icon (filled variant when selected) and label; selected shown by accent, heavier label and a
  short mark above the icon, so it survives greyscale (FR-010, FR-025).
- Preserved: `testID="tab-bar"`, `tab-<routeName>`, `tab-mark-<routeName>`, `accessibilityRole="tablist"` and
  `"tab"` with `selected` state and the route's label as the name.
- Press feedback and focus ring through `Tappable`.

**Headers**

- Native stack headers (`expo-router` `Stack`) with themed options: `headerTintColor` accent,
  `headerTitleStyle` and `headerLargeTitleStyle` in the display face, `contentStyle` canvas.
- `HeaderBackButton` adapter: a chevron and the word "Back" in a `Tappable` with accessible name **"Back"**
  (never the previous screen's title); `onPress` defaults to `router.back()`; draws nothing when React
  Navigation passes `canGoBack={false}`; platform minimum target, not scaled with the font scale (a header is a
  fixed-height bar). Used as a custom `headerLeft` if the native label does not resolve for the Maestro flows
  (research "Items to verify", item 7).
- iOS top-level list screens use large titles; Android uses a standard header with the same title.

**As built (T427, trip part)**

- `useHeaderTheme()` (`components/ui/header-theme.ts`) is how a layout themes a native header without importing the
  kit: it returns `headerStyle` and `contentStyle` (the kit's `background`), `headerTintColor` (`accent`) and
  `headerShadowVisible: false`, memoised on the two colours. It sets no title, title face or large title; the first
  screen that shows a native title adds `headerTitleStyle` and `headerLargeTitleStyle` (D4-07) beside it.
- The trip overview is the first screen to use `HeaderBackButton` as its `headerLeft`, called WITHOUT the props React
  Navigation passes. `canGoBack` is false for a trip opened with nothing beneath it; the button then replaces with
  `/` instead of drawing nothing. The native back button is replaced, not added to (`backButtonInCustomView` stays
  false), and a nested stack's first screen would otherwise carry the parent's previous route name (`(tabs)`) as
  its label (`NativeStackView.native.js`: `parentHeaderBack`).

---

## Review rules for new adapters

1. Function under 50 lines, file under 800, nesting under 4, no debug output.
2. A failing test first: accessible name required, `testID` forwarded, busy and disabled semantics,
   largest-text rendering, reduced-motion behaviour.
3. No literal colour; no kit import outside this folder; no `useAppearance` re-implementation.
4. A tappable surface names its cue (chevron, icon or label) at 3:1.
5. An adapter MUST NOT use a 20% soft fill (the kit's soft hover) for text that has to be read: the
   gate measures soft chips at 15% only, and hover is not reachable on touch devices. At 20% the text
   can fall below 4.5:1 (light-theme danger text on canvas is about 4.2:1).
6. A focus indicator is drawn with `FocusRing.offset` (2 dp) of the surrounding neutral between the
   ring and the control, so it never touches an accent fill (`design-tokens.md` C4-3).
7. A soft chip is placed on canvas, surface or overlay only, never on the field fill
   (`surfaceSecondary`) or on `surfaceTertiary`: the light accent's soft chip over those two cannot reach
   4.5:1 and is the one pair exception in `design-tokens.md` C4-3.
