# Specification Quality Checklist: Sunrise Passport UI

**Purpose**: Validate specification completeness and quality before proceeding to implementation
**Created**: 2026-10-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Traceability and Consistency (added for this feature)

- [x] Every FR-001 to FR-084 is covered by at least one task ([tasks.md](../tasks.md), "FR coverage"), checked by a
      script
- [x] Every SC-001 to SC-018 maps to a task or gate
- [x] Every task cites a requirement or a decision (`D5-nn`), checked by a script
- [x] Every requirement carries a scope tier (Tier 1 restyle, Tier 2 derived read-only view); Tier 3 items are
      listed with what each needs and none is built (spec, "Tier 3: out of scope")
- [x] Every amendment to feature 001, 002, 003 or 004 is stated in the spec and in research D5-20
- [x] The libraries, the fonts, the map layers and every other technology choice live in plan.md and research.md,
      not in spec.md
- [x] Each contrast figure quoted in research.md and `contracts/design-tokens.md` was measured with the repository's
      WCAG formula on 2026-10-12; the failures found (coral fill, arc ends, pressed fills, button disc) have a
      stated resolution
- [x] Each dependency pin has a publish date verified with `npm view` on 2026-10-12, at least 7 days old
- [x] The visibility posture of the derived views is stated (data-model, plan.md): private, local, never
      transmitted, nothing new stored; no schema, wire, preference or sync change
- [x] The globe's geometry, journey and statistics are explicitly untouched (FR-082)
- [x] Every prototype element that conflicts with the data model or a product rule is listed with its handling
      (spec, "Prototype elements that conflict")
- [x] Every deliberate label change is listed with the flows and tests to update (spec, "Copy and label policy")
- [x] The tasks verifiable only on a device are listed (tasks.md)
- [x] The contracts (design tokens, components, screens) cover every component and screen of the design

## Notes

- **Platform vocabulary**: the spec says "sheet", "pill", "handle", "haptic", "stamp", "large title" and names iOS
  and Android. These are user-visible behaviours and product scope (feature 001 R-D14: iOS and Android only), not
  implementation details.
- **SC-003, SC-006, SC-011, SC-012 and SC-017** refer to automated checks, frame rates, size and builds. They are
  verification mechanisms for the maintainers; the user-visible outcome (nothing a traveller used disappears; the
  product stays smooth; it builds and ships) is stated alongside.
- **FR-069 clarification**: the spec records that the coral button's fill measures 2.82:1 (2.40:1 in increased
  contrast) against white and is therefore identified by its label and an edge ring. This is called out in
  "Amendments" and in `contracts/design-tokens.md` so the owner can reject it.
- **FR-074 caps**: capping tab labels, chip captions and hero numerals at 1.3 times text size departs from
  feature 004's uncapped text; it is an owner question (plan.md Q-1).
- **Open items carried as questions, not clarifications**: plan.md Q-1 to Q-10 (text caps, the "of 195"
  denominator, flags, the Trips button on iOS, Welcome's buttons, the extra native module, thumbnail placeholders,
  the empty-state art, Tier 3 priorities, glass).
- Iteration count: 1 of 3; no failing items.
