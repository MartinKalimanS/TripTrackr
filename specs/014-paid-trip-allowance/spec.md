# Feature Specification: Paid trip allowance

**Feature Branch**: `014-paid-trip-allowance`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "Paid trip allowance (supersedes the flat allowance of spec 013). Free: a traveller may hold 3 trips at a time; beyond that a single-trip purchase, a Tier 1 yearly subscription (10 new trips per year) or an Unlimited yearly subscription. Yearly prices fall for each consecutive year subscribed. Charging is switched on by the owner later; until then nobody is blocked or charged and the product records who would have been."

## Relationship to spec 013

Spec 013 (built, PR open) holds every traveller to one flat number of live trips and lets any active subscription lift
it. This feature replaces that rule. What stays: the check happens only when a trip is created, the count is live,
creation is serialised per traveller, sync never rejects a trip, and nothing already recorded is ever touched
(Constitution V). What changes: the free number becomes 3, "an active entitlement lifts the limit" becomes three
distinct ways to add trips, and a trip can now be _covered_ by something the traveller paid for.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Nobody is blocked or charged until the owner switches charging on (Priority: P1)

Until the owner decides the app has enough regular users, every traveller can add as many trips as they like and sees
no price, no limit and no mention of payment. In the background the product counts how many travellers would have
been stopped, so the owner can see the real size of the paywall before turning it on.

**Why this priority**: This is the launch state. Everything else is dormant until this switch is flipped, and a
mistake here either blocks the first users or hides the data the owner needs to choose a launch date.

**Independent Test**: With charging off, create more trips than the free number: every create succeeds and no
allowance or payment wording appears anywhere. The owner's report shows how many travellers went over, and how many
times a create would have been refused.

**Acceptance Scenarios**:

1. **Given** charging is off, **When** a traveller with 3 trips adds a 4th, **Then** it succeeds with no limit or
   price shown.
2. **Given** charging is off, **When** a traveller goes beyond the free number, **Then** the product records that this
   traveller would have been stopped, without telling the traveller.
3. **Given** charging is off, **When** the owner reads the report, **Then** it shows the number of travellers who
   would have been stopped and the number of create attempts that would have been refused, with no traveller's trips,
   titles or contents.

---

### User Story 2 - A traveller meets the free limit and sees their options (Priority: P1)

Once charging is on, a traveller may hold 3 trips at a time for free. Trying to add a 4th stops with a clear message
saying how many trips they hold, and offers: buy this trip, take a yearly plan, or delete a trip to make room. What
they had typed is kept.

**Why this priority**: It is the moment the whole business model depends on, and it must never feel like data being
held hostage.

**Independent Test**: With charging on and 3 trips held, attempt a 4th: the creation is refused with the counts and
every way forward, nothing is created, and the typed details survive. Delete a trip and the same attempt succeeds.

**Acceptance Scenarios**:

1. **Given** charging is on and a traveller holds 2 trips, **When** they add a 3rd, **Then** it succeeds and no
   allowance or payment wording appears.
2. **Given** a traveller holds 3 free-slot trips and nothing paid, **When** they add another, **Then** it is refused
   with how many they hold, the free number, and the options to buy this trip, take a yearly plan or delete a trip.
3. **Given** the refusal, **When** the traveller deletes one of the 3 trips, **Then** adding the trip now succeeds
   and the details they typed were not lost.
4. **Given** two creates arrive at the same moment with one free slot left, **Then** exactly one succeeds.

---

### User Story 3 - Buying a single trip (Priority: P1)

A traveller who only needs one more trip pays once and gets a single-use credit. The trip they create with it is
marked as covered by it. If they later delete that trip, the credit is gone with it: it does not come back.

**Why this priority**: It is the entry-level purchase and the cheapest way for the owner to learn whether travellers
will pay at all.

**Independent Test**: Buy one credit, create a trip with it, delete the trip, and confirm a new trip is refused again
(the credit is not returned) while the deleted trip's free-slot neighbours are unaffected.

**Acceptance Scenarios**:

1. **Given** a traveller at the limit buys one credit, **When** the purchase completes, **Then** the trip they were
   trying to add is created at once with nothing re-entered, and it is marked as covered by that credit.
2. **Given** a covered trip, **When** the traveller deletes it, **Then** the credit stays spent and the traveller is
   at the limit again if they hold 3 free-slot trips.
3. **Given** a covered trip, **When** the traveller counts their free slots, **Then** the covered trip does not take
   one: deleting a covered trip frees nothing, deleting a free-slot trip frees a free slot.
4. **Given** a traveller holds unused credits, **When** any amount of time passes, **Then** the credits do not expire.
5. **Given** a traveller deletes their account, **Then** unused credits are lost, and the delete-account screen says
   so before the traveller confirms.

---

### User Story 4 - Tier 1 yearly plan: 10 new trips per year (Priority: P2)

A frequent traveller takes a yearly plan that allows 10 new trips in each subscription year. Each new trip uses one of
the ten and is marked as covered. Deleting a trip does not give the use back. Whatever is unused when the year ends
is lost; trips already created stay covered if the plan lapses.

**Why this priority**: It is the main recurring product, but it needs the credit and covering rules of Story 3.

**Independent Test**: Subscribe, create 10 trips, confirm the 11th is refused with the single-trip option, delete one
trip and confirm the refusal remains, then let the year roll over and confirm 10 fresh trips are available.

**Acceptance Scenarios**:

1. **Given** an active Tier 1 year with 4 trips used, **When** a traveller creates a trip, **Then** it succeeds, is
   marked covered, and 5 remain.
2. **Given** all 10 used, **When** the traveller adds another, **Then** it is refused with the single-trip option and
   the Unlimited option, and no trip is created.
3. **Given** all 10 used, **When** the traveller deletes a covered trip, **Then** no use is returned.
4. **Given** the year ends with trips unused, **When** it renews, **Then** the new year starts with 10 and the unused
   ones are gone.
5. **Given** the plan lapses, **When** the traveller opens any trip, **Then** every trip is still fully readable,
   editable and exportable exactly as before; only creating further trips beyond the free number is refused.

---

### User Story 5 - Unlimited yearly plan (Priority: P2)

A traveller who logs constantly takes a more expensive yearly plan with no trip limit while it is active.

**Why this priority**: It completes the ladder and gives heavy users a reason not to repeatedly buy single trips.

**Independent Test**: Subscribe to Unlimited and create well past the Tier 1 number: every create succeeds and none
uses a credit.

**Acceptance Scenarios**:

1. **Given** an active Unlimited plan, **When** the traveller creates any number of trips, **Then** every create
   succeeds and no credit or yearly use is spent.
2. **Given** the plan lapses, **When** the traveller opens their trips, **Then** nothing is hidden or locked.
3. **Given** a traveller moves from Tier 1 to Unlimited mid-year, **Then** the trips they already covered stay covered.

---

### User Story 6 - Yearly plans get cheaper the longer you stay (Priority: P3)

For each consecutive year a traveller stays subscribed, the price of their next year is lower, down to a floor. The
traveller is shown, in their own currency, exactly what the next renewal will cost before it renews.

**Why this priority**: It is a retention reward, valuable only once the plans exist and people have stayed a year.

**Independent Test**: For a traveller in their 1st, 2nd and 3rd consecutive year, the price shown for the next year
follows the configured ladder and never goes below the floor; changing the configured prices changes what is shown
without releasing a new app version.

**Acceptance Scenarios**:

1. **Given** a traveller completing their first year, **When** they look at the renewal, **Then** the next year's
   price is the configured second-year price, shown in their store currency.
2. **Given** a traveller at the floor, **When** they renew, **Then** the price does not fall further.
3. **Given** a traveller whose plan lapses and who later returns, **Then** the ladder restarts at the first-year
   price.

---

### User Story 7 - Trips made offline beyond the allowance are never lost (Priority: P2)

A traveller without connectivity creates trips beyond what they are allowed. When the device syncs, none is rejected
or deleted. Each is flagged, and the traveller can cover a flagged trip with a credit or a plan.

**Why this priority**: Constitution II and V. Offline work is never discarded because of a commercial limit.

**Independent Test**: Create 5 trips offline with 3 allowed, sync, and confirm all 5 exist on every device, the
over-limit ones are flagged, and covering one with a credit clears its flag.

**Acceptance Scenarios**:

1. **Given** 3 trips allowed and 5 created offline, **When** they sync, **Then** all 5 are kept and 2 are flagged.
2. **Given** a flagged trip, **When** the traveller applies a credit or has an active plan, **Then** the flag clears
   and the trip is marked covered.
3. **Given** flagged trips, **When** the traveller reads, edits or exports them, **Then** they behave exactly like
   any other trip.

---

### User Story 8 - Refunds and lapses never touch recorded data (Priority: P2)

A refund, a failed renewal or a cancelled plan changes only what the traveller can create next. It never hides,
locks, deletes or changes the export of anything already recorded.

**Why this priority**: Constitution V is non-negotiable; this story is the test that the new money rules respect it.

**Independent Test**: Take a traveller with covered trips through a refund, a lapse and a cancellation, and confirm
every read, list and export is identical before and after.

**Acceptance Scenarios**:

1. **Given** an unspent credit, **When** the store refunds it, **Then** the credit disappears and nothing else changes.
2. **Given** a spent credit, **When** the store refunds it, **Then** the trip stays and counts as an ordinary trip,
   and the traveller may be over their allowance and unable to create more until under it.
3. **Given** the same purchase notification arrives twice, **Then** exactly one credit exists.

### Edge Cases

- A traveller holds covered trips and ordinary trips: only ordinary ones take free slots.
- Spending order when creating a trip: a free slot first, then a use from the active Tier 1 year, then a single-trip
  credit. An Unlimited plan spends nothing.
- A create replayed with an id the traveller already owns returns that trip, never a second one and never a refusal.
- A purchase completes after the create attempt was abandoned: the credit simply waits unused.
- A subscription renews exactly while a create is in flight: the create sees one consistent state, either before or
  after the renewal, never half of each.
- A traveller on Tier 1 whose year ends with trips still unused loses them without notice beyond the in-app wording
  shown before renewal.
- The store reports a purchase for an account that has since been deleted: it is discarded and the account is not
  recreated.
- Device clock changes never change who is entitled: only the server's record decides.
- A traveller travelling abroad is charged in their own store's currency and sees prices in it.

## Requirements _(mandatory)_

### Functional Requirements

**Free allowance**

- **FR-001**: A traveller MUST be able to hold 3 ordinary trips at a time without paying. The number is
  configurable without releasing a new app version.
- **FR-002**: Deleting an ordinary trip MUST free its slot immediately. The count MUST be live, never a stored counter.
- **FR-003**: A traveller below the limit MUST see no reference to allowances, prices or payment anywhere (FR-084 of
  the original product spec).

**Covering and spending**

- **FR-004**: Creating a trip MUST spend, in this order: a free slot, then a use from the traveller's active Tier 1
  year, then a single-trip credit. An active Unlimited plan MUST spend nothing.
- **FR-005**: A trip created with a credit or a Tier 1 use, or under an Unlimited plan, MUST be marked as covered.
  A covered trip MUST NOT take a free slot.
- **FR-006**: Deleting a covered trip MUST NOT return a credit or a Tier 1 use, and MUST NOT free a slot for another
  trip.
- **FR-007**: Checking the limit and creating the trip MUST be one step per traveller: two simultaneous creates MUST
  NOT both take the last slot, the last credit or the last Tier 1 use.
- **FR-008**: A create replayed with an id the traveller already owns MUST return that trip and spend nothing.

**Single trip credit**

- **FR-009**: A traveller MUST be able to buy a single-trip credit as a one-off purchase. Completing it from a refused
  create MUST create that trip at once without retyping.
- **FR-010**: Credits MUST NOT expire. Unused credits MUST be lost on account deletion, and the delete-account
  screen MUST say so before the traveller confirms.

**Yearly plans**

- **FR-011**: A Tier 1 subscription year MUST allow exactly 10 new trips. Unused uses MUST expire when the year ends
  and the new year MUST start with 10. Trips already created MUST stay covered after a lapse.
- **FR-012**: An Unlimited subscription MUST allow any number of new trips while it is active.
- **FR-013**: Each consecutive year a traveller stays subscribed MUST be priced at or below the previous year's, down
  to a configured floor. Prices MUST be configured, not fixed in the app, and MUST be shown in the traveller's own
  store currency, together with the next renewal's price, before renewal.
- **FR-014**: A lapse in subscription MUST restart the ladder at the first-year price on return.
- **FR-015**: Travellers MUST be able to cancel without contacting support and MUST be told the date the change takes
  effect.

**Refused creation**

- **FR-016**: A refused create MUST tell the traveller how many ordinary trips they hold, the free number, and offer
  every way forward: buy this trip, the available yearly plans, or delete a trip. It MUST echo what they submitted.
- **FR-017**: A refused create MUST write nothing.

**Offline and sync**

- **FR-018**: A trip arriving by sync MUST never be refused or deleted for the allowance. If it is beyond what the
  traveller is allowed it MUST be kept and flagged.
- **FR-019**: A traveller MUST be able to cover a flagged trip with a credit or a Tier 1 use, and a flagged trip
  MUST be covered automatically under an active Unlimited plan; either clears the flag.

**Never hold data hostage**

- **FR-020**: A lapse, refund, cancellation or failed renewal MUST NOT hide, lock, delete, alter or change the export
  of any trip, note, expense, photo or document. It MUST affect only the creation of new trips.
- **FR-021**: Every read, list and export for an account MUST answer identically whether purchases are active,
  lapsed or refunded.

**Purchases and refunds**

- **FR-022**: Purchase state MUST come from the payment provider's server notifications only, never from a claim by
  the app. The app MUST handle no raw card details.
- **FR-023**: A purchase notification delivered more than once MUST grant exactly one credit or one year.
- **FR-024**: A refunded credit that is unspent MUST be removed. A refunded credit that is already spent MUST leave
  its trip in place as an ordinary trip.
- **FR-025**: A failed or declined payment MUST be recoverable without a duplicate charge.

**Charging switch and measurement**

- **FR-026**: Charging MUST be off at launch. While off, no create is refused, no price or limit is shown, and no
  purchase is offered.
- **FR-027**: While charging is off, the product MUST record, per traveller, whether they would have been stopped,
  and MUST report to the owner the count of such travellers and of such refused attempts, containing no trip
  content. Recording MUST NOT change what any traveller sees.
- **FR-028**: The owner MUST be able to switch charging on and off without releasing a new app version.
- **FR-029**: When charging is switched on, every trip a traveller already holds MUST be marked as covered
  (owner default A, 2026-10-30, chosen by the assistant as recommended and not objected to). Those travellers keep
  everything and pay only for trips added afterwards; their 3 free slots start empty.

### Key Entities

- **Ordinary trip**: a trip the traveller holds that is not covered; it takes one of the free slots.
- **Covered trip**: a trip marked as paid for by a single-trip credit, a Tier 1 use or an Unlimited plan; it takes no
  free slot and keeps its coverage after the purchase ends.
- **Trip credit**: a single-use right to create one trip. Never expires. Spent by one trip, never returned.
- **Subscription year**: one paid year of Tier 1 or Unlimited, with a start, an end, a tier and a count of uses left
  (Tier 1 only).
- **Price ladder**: the configured sequence of yearly prices per tier with a floor, and the traveller's consecutive
  years subscribed.
- **Would-have-been-stopped record**: while charging is off, a per-traveller marker and attempt count used only to
  size the paywall.

### Privacy posture

Nothing here creates a visibility flag, a public-read path or a share path. Credits, subscription years and
would-have-been-stopped records belong to the traveller who holds them; no other traveller, shared view or export
path can read them. The owner's report is an aggregate count only. Constitution I and V apply unchanged: purchase
state decides whether a new trip can be created and nothing else.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: With charging off, 100% of create attempts by any traveller succeed and none of them shows a limit or a
  price.
- **SC-002**: Before charging is switched on, the owner can read the number of travellers who would have been
  stopped, and it matches the real count to the trip.
- **SC-003**: After a purchase, a traveller sees their trip created in under 5 seconds, with nothing retyped.
- **SC-004**: In 1,000 simultaneous creates against one traveller at the limit, none exceeds the limit and none spends
  a credit or a Tier 1 use twice.
- **SC-005**: A purchase notification replayed 10 times grants exactly one credit or one year.
- **SC-006**: For an account taken through a refund, a lapse and a cancellation, every read, list and export is
  byte-for-byte identical before and after.
- **SC-007**: 100% of trips created offline survive sync on every device, with none lost for the allowance.
- **SC-008**: A deleted covered trip never returns a credit or a Tier 1 use in any scenario tested.
- **SC-009**: The traveller sees the exact price and currency of the next renewal at least once before it renews.

## Assumptions

- A "subscription year" runs for twelve months from the traveller's purchase date, not the calendar year.
- Trips created under an Unlimited plan are marked covered, so a lapsed Unlimited traveller is not forced to delete
  trips to create again. Without this a heavy user would lose the ability to create after one lapse.
- Years subscribed count across Tier 1 and Unlimited together; a lapse of any length restarts the ladder.
- Charging being on or off applies to every traveller at once; no per-country or per-cohort roll-out.
- Prices, the free number (3), the Tier 1 number (10), the ladder steps and the floor are configuration, not
  fixed in the app.
- The would-have-been-stopped record is kept only while charging is off and is deleted when charging is switched on.
- The first launch is mobile on iOS and Android only; the purchase screens' visual design is a later step.

## Out of scope

- Store product creation, price points, the RevenueCat account and its keys (owner task; roadmap step S-11 wires the
  notifications).
- The visual design of the purchase screens.
- Family sharing, gifting, promotional codes and team plans.
- Web purchases.
