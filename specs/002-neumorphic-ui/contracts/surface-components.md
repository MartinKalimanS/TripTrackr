# Contract: Surface Component API

**Feature**: `specs/002-neumorphic-ui` | **Consumers**: screens in `src/app/`, feature 001 screens

The primitives every screen composes from. The contract is deliberately narrow: a screen declares
*what a thing is*, never *how deep its shadow is*.

---

## C8. `<Surface>` — static surfaces

```tsx
<Surface treatment="raised" | "recessed" | "flat" depth={1 | 2 | 3} pending?={boolean} />
```

**Guarantees**

- Renders a `View` with the resolved style for the current appearance. No extra wrapper view is
  introduced — the whole point of using core `boxShadow` is that one view carries both shadows
  (research R-001).
- Carries **no** border in `full` profile. Static surfaces are decorative and stay borderless.
- `pending` composes: `<Surface treatment="raised" pending />` is a raised card marked
  unsynchronised, not a different card (FR-007).
- Transparent to accessibility: adds no role, no label, no focus stop (FR-017).

**Obligations**: do not pass a `style` that overrides `backgroundColor`, `boxShadow`, or
`borderColor`. Layout properties are yours; appearance properties belong to the treatment.

---

## C9. `<PressableSurface>` — interactive surfaces

```tsx
<PressableSurface
  treatment="raised" | "flat"
  depth={1 | 2 | 3}
  busy?={boolean}
  disabled?={boolean}
  onPress={() => void}
  accessibilityLabel={string}   // required
/>
```

**Guarantees**

| Behaviour                                                                    | Requirement |
| ---------------------------------------------------------------------------- | ----------- |
| Shows `pressed` for the full duration of the held touch, reverts on release  | FR-018      |
| Press style appears within 100 ms; no interpolation                          | SC-005, R-004 |
| Always carries a compliant hairline border (it is an interactive element)    | FR-009      |
| Exposes a visible focus indicator meeting 3:1, distinct from press depth     | FR-012      |
| Touch target ≥ platform minimum regardless of visible decoration size        | FR-011      |
| `disabled` → flat, inert, announced unavailable                              | FR-019      |
| `busy` → dimmed, rejects input, announced in-progress                        | FR-020      |
| `disabled` and `busy` are mutually exclusive; both set is a development error | §5 of data-model |

**Obligations**: `accessibilityLabel` is required by the type, not merely encouraged — a soft
low-contrast control with no label is the worst combination this feature could ship.

---

## C10. `<TextField>` — recessed input

```tsx
<TextField value={string} onChangeText={(t: string) => void} label={string} error?={string} />
```

**Guarantees**

- Renders `recessed`, so it reads as a place to type before it is touched (Acceptance Scenario 1.3).
- In `reduced`/`flat` profiles, falls back to `surfaceSunk` plus a compliant border — never to an
  undifferentiated flat rectangle.
- Focus indicator meets 3:1 and is distinguishable from the recessed appearance itself (FR-012).
- `error` is conveyed by icon and text as well as colour (FR-010).
- Grows with `fontScale` rather than clipping (FR-016).

---

## C11. `<SyncBadge>` — pending-synchronisation marker

```tsx
<SyncBadge state="pending" | "syncing" | "failed" />
```

**Guarantees**

- Conveys state by **icon and text**, not hue alone (FR-010).
- Reflects state supplied by the caller; queries and mutates nothing (Principle II boundary).
- Announced to assistive technology with a text equivalent, never as decoration.

**Why this primitive exists in a styling feature**: Principle II forbids presenting a record as saved
before its bytes have landed. A style whose entire vocabulary is "soft, settled, finished" needs an
explicit counter-signal, or it will quietly imply the opposite.

---

## C12. Content surfaces — what must NOT be styled

**Guarantee**: no treatment is applied over map, globe, street-level, or photographic content
(FR-024).

| Rule                                                                     | Requirement |
| ------------------------------------------------------------------------ | ----------- |
| No shadow, tint, scrim, or overlay drawn across map or image content     | FR-024      |
| Controls over such content are opaque and bordered, legible on light and dark | FR-025  |
| Images carry a hairline boundary against similar-toned surfaces          | FR-026      |

**Obligation**: `<Surface>` frames media; it never wraps it as a parent whose shadow bleeds inward.
A shadow cast onto map imagery can be mistaken for terrain, which is a correctness problem, not an
aesthetic one.

---

## C13. Screen-level obligations

Every screen, including ones added later:

1. Composes only from these primitives; no raw `View` with an inline appearance style.
2. Defines empty, loading, and error presentations to the same standard as its populated state
   (FR-027).
3. Renders completely at the largest supported text size, verified at that setting rather than
   assumed (FR-016, SC-008).
4. Leaves accessibility output unchanged from its pre-styling behaviour (FR-017, SC-009).
