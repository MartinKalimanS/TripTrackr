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

---

## C4-8. Containers, lists, fields, chips, states

| Adapter                                                 | Replaces       | API                                                                                        | Guarantees and preserved identifiers                                                                                                                                                                                                                             |
| ------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Screen`                                                | `Screen`       | `testID`, `edges`, `keyboardAware`, `style`                                                | Paints the canvas; scrolls at the largest text size; uses `contentInsetAdjustmentBehavior` so headers inset content; same `keyboardShouldPersistTaps="handled"`                                                                                                  |
| `ListScreen`                                            | `ListScreen`   | unchanged generics                                                                         | `FlashList` is the scroller (D-23); header, empty and footer travel with it                                                                                                                                                                                      |
| `Text`, `ThemedText`                                    | `ThemedText`   | `type` (existing values plus `largeTitle`, `headline`, `caption`, `numeric`), `themeColor` | Muted ink promotes to primary under increased contrast; numerals tabular where `numeric`; `ThemedText` stays as a shim so call sites need no change in phase 2                                                                                                   |
| `Card`, `Panel`                                         | `Surface`      | `variant="raised" \| "flat"`, `overMap?`, `pending?`, `radius?`                            | `overMap` is opaque with a hairline and **no shadow or tint** (FR-018, FR-033); a card never contains a card (FR-006); `pending` adds the pending marker treatment (FR-034)                                                                                      |
| `ListGroup`, `ListRow`                                  | row layouts    | `title`, `description?`, `leading?`, `trailing?`, `onPress?`, `accessibilityActions?`      | A pressable row shows a chevron at 3:1 unless it supplies its own cue (FR-024); row-level `accessibilityActions` are forwarded (stop rows keep move up, move down, edit, delete)                                                                                 |
| `Field`                                                 | `TextField`    | `label`, `value`, `onChangeText`, `error?`, `description?`, all `TextInput` props          | `testID` lands on the input; `accessibilityLabel` is the label; `aria-invalid` when an error exists; error is words under the field, never colour alone (FR-025); `secureTextEntry`, `textContentType`, `autoComplete` and `keyboardType` pass through unchanged |
| `Chip`                                                  | pill buttons   | `label`, `selected?`, `onPress?`, `leading?`                                               | Selected is shown by fill, weight and a check glyph, not colour alone                                                                                                                                                                                            |
| `ChipGroup`                                             | `PillGroup`    | `options[{key,label,testID,accessibilityLabel}]`, `selectedKey`, `onSelect`                | Keeps `radiogroup` and `radio` roles with `selected` and `checked`; selection plays a selection haptic; may scroll sideways (FR-009 and 003 FR-017)                                                                                                              |
| `StatusChip`                                            | `StatusPill`   | `status: 'planning' \| 'active' \| 'past'`                                                 | Keeps `testID="status-pill-<status>"` and label "Status: …"; icon and text carry the state; colours from the status tokens                                                                                                                                       |
| `SyncBadge`                                             | `SyncBadge`    | `state: 'pending' \| 'syncing' \| 'failed'`                                                | Icon and text, announced with a text equivalent; reflects props, queries nothing (002 C11 kept)                                                                                                                                                                  |
| `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton*` | `state-view`   | `title`, `detail?`, `onRetry?`; skeleton variants for trip card, row, list                 | Loading is announced (`progressbar`); skeletons mimic the shape of the content; error offers retry (FR-021, FR-035)                                                                                                                                              |
| `FormActions`                                           | `FormActions`  | `testIDPrefix`, `saveLabel`, `onCancel`, `onSave`, `saveDisabled?`                         | Keeps `<prefix>-cancel` and `<prefix>-save`; Save is the single primary; sticky above the keyboard (FR-009)                                                                                                                                                      |
| `InlineError`                                           | `InlineError`  | `message`, `testID`                                                                        | `accessibilityRole="alert"`                                                                                                                                                                                                                                      |
| `Icon`                                                  | ad-hoc symbols | `name: { ios, android }`, `size: 16 \| 20 \| 24`, `tone?`                                  | One vocabulary over `expo-symbols`; decorative icons are hidden from assistive technology, meaningful ones carry a label                                                                                                                                         |
| `Avatar`                                                | none           | `name`, `size`                                                                             | Initials from the display name; decorative unless it is the only identifier                                                                                                                                                                                      |
| `MediaFrame`                                            | `MediaFrame`   | unchanged                                                                                  | Frames photographs with a hairline; **never** wraps them in a parent whose shadow bleeds inward (002 C12)                                                                                                                                                        |

---

## C4-9. Tab bar and headers

**`TabBar`** (renamed from `NeumorphicTabBar`; same props from `BottomTabBarProps`)

- Flat strip of the canvas colour with one divider at 3:1 (`border` token); content at most 56 dp at the
  default text size, growing with text size (003 FR-013, FR-014).
- Each tab: icon (filled variant when selected) and label; selected shown by accent, heavier label and a
  short mark above the icon, so it survives greyscale (FR-010, FR-025).
- Preserved: `testID="tab-bar"`, `tab-<routeName>`, `tab-mark-<routeName>`, `accessibilityRole="tablist"` and
  `"tab"` with `selected` state and the route's label as the name.
- Press feedback and focus ring through `Tappable` in its bare form.

**Headers**

- Native stack headers (`expo-router` `Stack`) with themed options: `headerTintColor` accent,
  `headerTitleStyle` and `headerLargeTitleStyle` in the display face, `contentStyle` canvas.
- `HeaderBackButton` adapter: renders the platform back affordance with accessible name **"Back"**; used
  as a custom `headerLeft` if the native label does not resolve for the Maestro flows (research
  "Items to verify", item 7).
- iOS top-level list screens use large titles; Android uses a standard header with the same title.

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
