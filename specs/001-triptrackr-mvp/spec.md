# Feature Specification: TripTrackr MVP

**Feature Branch**: `001-triptrackr-mvp`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "using the blueprint and spec complete the template"

**Source documents**: `travelappblueprint.md` (product & technical blueprint), `travelappfullspec.md` (full technical specification)

---

## Overview

TripTrackr is a mobile travel companion that keeps everything about a trip in one place. It is deliberately three products layered in a strict order of trust:

1. A **private trip journal** — where a traveller has been, what they wrote down, what they spent, and the documents they need at the airport.
2. An **offline-first capture layer** — because travellers are routinely on aeroplanes, in foreign countries without data, or on hotel Wi-Fi that barely works.
3. An **opt-in social layer** — where a traveller can publish a curated version of a trip, and browse other travellers' public trips for inspiration.

The organising principle is that **privacy is the default and sharing is an explicit, per-object act**. Financial records are never shareable under any circumstance.

The product's signature surface is a 3D globe home screen showing the traveller's own history as arcs between the places they have been — past trips dimmed, the active trip alive and animated.

The product is free to use up to a limited number of trips. Beyond that, a traveller either takes a paid subscription or deletes an existing trip to make room. Nothing a traveller has already recorded is ever deleted, hidden, or held hostage by that limit — the constraint applies only to _creating_ a new trip.

---

## User Scenarios & Testing _(mandatory)_

<!--
  Stories are ordered to match the build sequence agreed in the blueprint (§11).
  Each is independently testable and delivers standalone value.
  Note the hard gate: User Story 6 (offline sync) MUST be complete and verified
  before User Story 7 (social) begins. See "Sequencing constraint" below.
-->

### User Story 1 - Create an account and record a multi-stop trip (Priority: P1)

A traveller signs up (with an email and password, or with their existing Google or Apple account), then creates a trip such as "Italy, spring 2026". They add stops in order — Rome, then Florence — picking each city from its country, with arrival and departure dates. The trip appears in their list of trips, marked as _Planning_ because it has not started yet.

**Why this priority**: Nothing else in the product exists without an account and a trip to attach things to. This is the smallest slice that is genuinely usable — a traveller can record where they are going and when, which is already more than a notes app gives them.

**Independent Test**: Register a new account, create a trip with two ordered stops in different cities, close and reopen the app, and confirm the trip and both stops persist with the correct dates and order. Delivers a working itinerary skeleton with zero dependency on any other story.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they register with an email, password, and display name, **Then** an account is created and they are signed in.
2. **Given** a visitor who has never used the app, **When** they sign in with Google or Apple for the first time, **Then** an account is created transparently without a separate registration step.
3. **Given** a signed-in traveller, **When** they create a trip with a title and a home currency, **Then** the trip is saved with status _Planning_.
4. **Given** a trip being created, **When** the traveller picks a country and types the first few letters of a city, **Then** matching cities in that country are offered, ranked by prominence.
5. **Given** a trip with stops in Rome (ending 12 May) and Florence, **When** the traveller adds the Florence stop, **Then** its arrival date is pre-suggested as 12 May.
6. **Given** a trip with three stops, **When** the traveller drags the third stop to first position, **Then** the stop order is updated and persists.
7. **Given** a trip whose start date has arrived, **When** the traveller views their trip list, **Then** the trip is shown as _Active_; once the end date has passed it is shown as _Past_.
8. **Given** a stop being added, **When** the traveller sets a departure date earlier than the arrival date, **Then** the entry is rejected with a clear message.
9. **Given** a traveller who is already at their trip allowance, **When** they attempt to create another trip, **Then** creation is blocked with a clear explanation and the two ways forward (subscribe, or delete an existing trip) — see User Story 9.

---

### User Story 2 - Keep private notes and track spending per trip (Priority: P2)

During and around a trip, the traveller writes notes and logs expenses. Notes can live at three levels: attached to a specific city, attached to a country in general, or attached to the whole trip. Expenses are entered in whatever currency was actually paid, and the traveller sees totals and charts in their own home currency so the numbers are comparable.

**Why this priority**: This is the daily-use loop and the fastest way to validate that the underlying data model is right, before any expensive visual work is built on top of it.

**Independent Test**: On an existing trip, write one country-level note and one city-level note, log three expenses in two different currencies, and confirm the summary chart totals are correct in the home currency. Then move the country-level note into a specific city and confirm it reappears under that city.

**Acceptance Scenarios**:

1. **Given** a trip with stops, **When** the traveller writes a note and attaches it to a country, **Then** the note is saved and appears under that country for the trip.
2. **Given** an existing country-level note, **When** the traveller moves it to a specific city, **Then** it appears under that city without any loss of content.
3. **Given** a traveller logging an expense, **When** they enter an amount and choose a currency different from the trip's home currency, **Then** both the original amount and the converted home-currency amount are stored, along with the conversion rate used at that moment.
4. **Given** a trip with expenses in more than one currency, **When** the traveller views the trip's spending summary, **Then** they see a breakdown by category and by day in the home currency, plus a visible indication of the conversion rate applied.
5. **Given** the expense entry screen, **When** the traveller opens the category picker, **Then** they see the standard categories (Food, Lodging, Transport, Activities, Shopping, Other) and can add a custom category inline.
6. **Given** a traveller who created a custom category on one trip, **When** they log an expense on a different trip, **Then** that custom category is available again.
7. **Given** any expense record, **When** any sharing or publishing action is attempted anywhere in the product, **Then** there is no mechanism by which the expense can be made visible to another person.

---

### User Story 3 - See your travel history as a 3D globe (Priority: P3)

The traveller opens the app and lands on a globe showing every trip they have taken as a curved arc between cities. Past trips are dimmed, the current or next trip is animated so the eye goes to it first. Tapping an arc opens that trip.

**Why this priority**: This is the product's identity and its strongest emotional and social hook, but it depends on there being real trip data to render — so it follows, rather than precedes, the journal.

**Independent Test**: With an account holding three trips in different statuses, open the home screen and confirm three visually distinct arcs render between the correct cities, that the active trip is animated, and that tapping an arc opens the correct trip.

**Acceptance Scenarios**:

1. **Given** a traveller with several recorded trips, **When** they open the home screen, **Then** a globe renders showing an arc for each consecutive pair of stops in each trip.
2. **Given** trips in different states, **When** the globe renders, **Then** planning, active, and past trips are visually distinguishable at a glance.
3. **Given** an active trip on the globe, **When** the traveller watches the home screen, **Then** that trip's arc is animated while others are static.
4. **Given** a rendered globe, **When** the traveller taps an arc, **Then** the corresponding trip opens.
5. **Given** a traveller with recorded trips, **When** they view the globe, **Then** a summary overlay shows countries visited and total distance travelled.
6. **Given** a traveller with no trips yet, **When** they open the home screen, **Then** they see an inviting empty state prompting them to create their first trip, not a blank sphere.

---

### User Story 4 - Zoom from the globe into street-level detail (Priority: P4)

The traveller pinches into a city on the globe and the view transitions smoothly from a sphere into a detailed map of the place, with terrain and building shapes, so they can actually look at where they stayed.

**Why this priority**: It completes the globe's promise ("zoom in and see the place"), but the globe is useful without it, so it is a separable follow-on slice.

**Independent Test**: From the globe, zoom continuously into a city with a recorded stop and confirm the transition is unbroken and that detailed terrain and buildings appear at close range.

**Acceptance Scenarios**:

1. **Given** the globe view, **When** the traveller zooms in past a city, **Then** the view transitions continuously into a detailed flat map without a visible reload or jump between two different views.
2. **Given** a close-in map view, **When** it renders, **Then** terrain relief and building shapes are visible.
3. **Given** a trip with finalised stops, **When** the traveller chooses to prepare for travel, **Then** they can download that city's map data for use without a connection.
4. **Given** a traveller with a downloaded city and no connectivity, **When** they open the map for that city, **Then** it renders from the downloaded data.

---

### User Story 5 - Store photos and travel documents against a trip (Priority: P5)

The traveller adds photos to a trip and stores boarding passes and booking confirmations. Photos may later be shared; documents never can be. Scanning a boarding pass automatically pulls out the flight number, date, and passenger name so the traveller does not type it in.

**Why this priority**: High practical value at the airport, and it introduces the file-handling path that the offline layer then has to account for — so it must land before offline sync is finalised.

**Independent Test**: Upload three photos and one boarding pass to a trip, confirm the photos appear in the trip gallery, confirm the boarding pass's flight details were extracted, and confirm no interface anywhere offers to share the document.

**Acceptance Scenarios**:

1. **Given** a trip, **When** the traveller adds photos, **Then** they are stored privately against the trip and appear in the trip's gallery.
2. **Given** a photo that carries capture location and time information, **When** it is added, **Then** that information is recorded and the photo is associated with the matching city where possible.
3. **Given** a boarding pass with a scannable barcode, **When** the traveller captures it, **Then** the flight number, date, and passenger name are extracted and pre-filled for confirmation.
4. **Given** a stored travel document, **When** the traveller views it, **Then** screenshots and screen recording are blocked on that screen.
5. **Given** any stored document, **When** the traveller browses the product's sharing controls, **Then** documents are absent from them entirely.
6. **Given** a trip gallery, **When** the traveller opens it, **Then** thumbnails load quickly rather than full-resolution originals.

---

### User Story 6 - Work fully offline and reconcile on reconnect (Priority: P6 — HARD GATE)

The traveller lands somewhere with no data plan. They keep writing notes, logging expenses, taking trip photos, and adding documents for the entire trip. When they next get a connection, everything they captured syncs up correctly — including the awkward case where they also edited something on a second device.

**Why this priority**: This is the single most important non-obvious requirement for a travel product, and it is a **gate**: the social layer introduces public/private state that must survive synchronisation correctly. Proving the sync engine against a simple, private-only data model first avoids debugging synchronisation correctness and privacy correctness simultaneously.

**Independent Test**: Put the device in aeroplane mode. Create, edit, and delete notes, expenses, photo captures, and documents. Force-quit and relaunch the app — all of it is still there. Restore connectivity and confirm every change reaches the server, deletions included. Separately, edit the same record on two devices before either syncs and confirm exactly one version wins deterministically and the losing device is told.

**Acceptance Scenarios**:

1. **Given** a device with no connectivity, **When** the traveller creates or edits notes, expenses, photo captures, and documents, **Then** all changes are saved locally and are immediately visible in the app.
2. **Given** unsynced local changes, **When** the app is force-quit and relaunched, **Then** all changes are still present.
3. **Given** unsynced local changes, **When** connectivity returns, **Then** all changes reach the server automatically without the traveller taking any action.
4. **Given** a record deleted while offline, **When** synchronisation completes, **Then** the deletion propagates and the record does not reappear on any other device.
5. **Given** the same record edited on two devices before either synced, **When** both synchronise, **Then** one version wins by a single consistent rule, and the device whose version lost is updated and informed.
6. **Given** a photo captured offline, **When** connectivity returns, **Then** the photo's file is uploaded — and it is not treated as fully saved until the file itself has arrived, not merely its description.
7. **Given** a traveller signing in on a brand-new device, **When** the app first loads, **Then** they see a clear "syncing your trips" state rather than an empty screen, and their full history arrives.
8. **Given** the traveller is offline, **When** they view any previously-synced trip, **Then** its notes, expenses, and itinerary are readable.

---

### User Story 7 - Publish a curated trip and follow other travellers (Priority: P7)

The traveller decides one trip is worth sharing. They mark the trip public, and separately choose which individual notes and photos go with it. The result is a curated story — a globe arc, a cover photo, the cities visited, and only the notes and photos they explicitly chose. Their spending is not part of it and cannot be. They can follow other travellers and browse public trips for a city they are about to visit.

**Why this priority**: This is the growth loop, but it carries the product's largest risk (accidental disclosure), so it is deliberately built last among the core features and only on top of a proven synchronisation layer.

**Independent Test**: From account A, publish a trip with one note public and one note private. From account B, which does not follow A, open A's public trip and confirm only the public note appears, no expenses or documents are reachable by any route, and the private note is absent.

**Acceptance Scenarios**:

1. **Given** a trip, notes, and photos, **When** the traveller reviews sharing settings, **Then** each object carries its own independent visibility setting rather than a single global switch.
2. **Given** a public trip containing both public and private notes, **When** another traveller views it, **Then** only the public notes and photos are shown.
3. **Given** any trip, public or private, **When** any other person attempts to reach its expenses or documents by any route, **Then** access is refused — this must hold even if the interface has a defect.
4. **Given** a traveller with a private profile, **When** someone requests to follow them, **Then** the request is held pending until they accept.
5. **Given** a traveller with a public profile, **When** someone follows them, **Then** the follow takes effect immediately.
6. **Given** a traveller who follows others, **When** they open their feed, **Then** they see recent public trips from the people they follow, newest first.
7. **Given** a traveller planning a visit to a city, **When** they browse discovery for that city, **Then** they see public trips from other travellers that included that city.
8. **Given** a photo the traveller wants to make public, **When** they toggle it, **Then** it does not become visible to anyone until it has passed automated content screening.
9. **Given** a traveller who blocks another, **When** the blocked person views their profile or trips, **Then** the content is not reachable.
10. **Given** any public trip, note, photo, or profile, **When** a traveller finds it objectionable, **Then** they can report it and the report is recorded for review.

---

### User Story 8 - Generate an editable day-by-day itinerary (Priority: P8)

The traveller asks, in plain language, "what should I do in Rome for two days — I like art and food?" They get back a structured day-by-day plan with real places pinned on a map and a walking route connecting them in sensible order. They drag an activity from Day 1 to Day 2, delete one they don't like, add their own, and the route redraws.

**Why this priority**: The highest technical risk and the highest running cost per use, so it is built once the product around it is proven. It is also the feature that ties the social layer back into planning.

**Independent Test**: Request a two-day plan for a city, confirm every suggested place resolves to a real, correctly located pin, drag one activity to another day, and confirm the walking route redraws without regenerating the whole plan.

**Acceptance Scenarios**:

1. **Given** a trip with a city stop, **When** the traveller describes what they want in plain language, **Then** a day-by-day itinerary of named places is produced.
2. **Given** a generated itinerary, **When** it is presented, **Then** every place shown corresponds to a real, verifiable location — suggestions that cannot be confirmed to exist are omitted rather than shown at a guessed position.
3. **Given** a day's activities, **When** the itinerary is presented, **Then** a walking route connects them in an order that avoids obvious backtracking.
4. **Given** a generated itinerary, **When** the traveller drags an activity to a different day, deletes one, or adds their own, **Then** the change is saved and the route for the affected days redraws without regenerating the entire plan.
5. **Given** a request is being processed, **When** the traveller waits, **Then** they see clear progress rather than a frozen screen, and the app remains usable.
6. **Given** a traveller who has made many requests in one day, **When** they exceed the allowance, **Then** they are told clearly rather than silently failing.
7. **Given** a repeated identical request for the same city and duration, **When** it is made within a short window, **Then** it is served without incurring the full cost of regeneration.

---

### User Story 9 - Reach the trip limit and choose to subscribe or make room (Priority: P9)

A traveller who has been using the app for free has recorded five trips. They go to add a sixth. Rather than a dead end, they are told plainly where they stand and offered two honest ways forward: subscribe monthly for an unrestricted allowance, or delete a trip they no longer want. If they subscribe, the new trip is created immediately. If they later cancel, everything they recorded while subscribed stays exactly where it is and remains fully usable — they simply cannot add another trip until they are back under the free allowance.

**Why this priority**: It is the product's only revenue mechanism, but it is deliberately last because it constrains a flow (trip creation) that must be proven to work unconditionally first. Building the limit before the thing being limited risks designing the product around the paywall rather than the other way round.

**Independent Test**: On an account at the free allowance, attempt to create another trip and confirm the choice is presented clearly. Take each branch separately: subscribe and confirm the trip is created; alternatively delete a trip and confirm the slot frees immediately. Then simulate a lapsed subscription on an over-allowance account and confirm every existing trip remains fully readable and editable while new creation is blocked.

**Acceptance Scenarios**:

1. **Given** a traveller below the free allowance, **When** they create a trip, **Then** it is created with no mention of limits or payment at all.
2. **Given** a traveller at the free allowance, **When** they attempt to create a trip, **Then** they are shown how many trips they have, what the allowance is, and both routes forward.
3. **Given** a traveller at the allowance, **When** they delete an existing trip, **Then** the slot frees immediately and they can create a new trip without any further step.
4. **Given** a traveller at the allowance, **When** they take a subscription, **Then** the trip they were trying to create can be created straight away, without re-entering what they had already typed.
5. **Given** a subscribed traveller, **When** they create trips, **Then** no allowance limit applies.
6. **Given** a subscribed traveller with more trips than the free allowance, **When** their subscription ends, **Then** every existing trip remains fully readable and editable, and none is deleted, hidden, locked, or degraded.
7. **Given** a traveller whose subscription has ended while over the free allowance, **When** they attempt to create a new trip, **Then** they are told they must either resubscribe or delete trips until they are back under the allowance.
8. **Given** a traveller taking a subscription, **When** they pay, **Then** the product never handles their raw card details.
9. **Given** a subscribed traveller, **When** they look for how to cancel, **Then** it is findable without contacting support, and the date access changes is stated plainly.
10. **Given** a payment that fails or is declined, **When** the traveller retries, **Then** they are told what happened and no duplicate charge occurs.

---

### Sequencing constraint

User Story 6 (offline sync) is a **hard gate**. User Story 7 (social) must not begin until Story 6's acceptance scenarios pass against genuine multi-device, connectivity-interrupted testing — not happy-path online use. The reasoning: a note created offline and marked public must neither leak nor silently vanish when it eventually synchronises, and that is far harder to prove if the synchronisation engine is itself unfinished.

Stories 1–5, 8, and 9 have no such gate and may be reordered on delivery grounds. Story 9 (the trip allowance) is nonetheless best kept late: it constrains trip creation, and that flow should be proven unconditionally before a limit is layered onto it.

---

### Edge Cases

**Trips and stops**

- A traveller creates a trip with a single stop — no arcs can be drawn; the globe must show a point rather than fail.
- A trip's dates pass while the app is closed — status must be correct on next open, not stuck at _Planning_.
- Two stops in a trip have overlapping date ranges, or a gap of several weeks — both are legitimate and must be permitted.
- A traveller deletes a trip that has notes, expenses, photos, and documents attached — all associated content must go with it, including stored files.
- A traveller records a stop in a city that spans an unusual time zone or crosses the date line.

**Money**

- An expense is logged in a currency for which no conversion rate can be retrieved at that moment.
- A conversion rate changes between two expenses in the same city on the same day — historical entries must not silently change value afterwards.
- A traveller changes a trip's home currency after expenses have been logged.
- An expense is entered as zero or as a negative amount (a refund).

**Notes**

- A note is attached to neither a city nor a country — must be prevented or given a defined home.
- A note is attached to a city that is later removed from the trip.

**Photos and documents**

- A photo carries no capture location or time information at all.
- A photo's embedded location contradicts the city it was filed under.
- A boarding pass barcode is unreadable, damaged, or in an unrecognised format.
- Available device storage runs out mid-capture while offline.

**Offline and sync**

- Connectivity returns for two seconds and drops again mid-synchronisation.
- The same record is edited on two devices, and the device with the _older_ clock syncs second.
- A traveller signs out on a device that still holds unsynced changes.
- A record is deleted on one device while being edited on another.
- A synchronisation batch is large enough that it must be resumed rather than completed in one attempt.

**Privacy and social**

- A trip is made public and then made private again — previously visible content must stop being reachable.
- A public photo is later flagged and rejected by content screening.
- A traveller with a public trip deletes their account — the public trip must disappear along with it.
- A follower is blocked after having already seen content.
- A traveller requests a full export of their own data.

**Planner**

- The plain-language request is nonsensical, empty, or asks for something the city cannot offer.
- Every suggested place fails verification, leaving an empty day.
- A traveller requests a plan for a city with no recorded stop on the trip.

**Trip allowance and subscription**

- A subscription lapses while the traveller is well over the free allowance — no trip may be deleted, hidden, or degraded as a result.
- A traveller deletes a trip and immediately creates another, repeatedly, to check the slot accounting stays correct.
- A traveller subscribes on one device while a second device still believes them to be on the free allowance.
- A trip is created offline by a traveller who is at the allowance — the limit cannot be checked until connectivity returns.
- A payment succeeds but confirmation is lost in transit; the traveller retries and must not be charged twice.
- A traveller subscribes, cancels within the same billing period, and creates trips in the remaining paid time.
- A traveller deletes their account while holding an active subscription.
- The free allowance is changed as a business decision while accounts already sit above the new number.

**Accounts**

- Someone registers with an email that already has an account created via Google or Apple sign-in.
- A sign-in session that has already been revoked is presented again.
- A traveller deletes their account while an operation is still queued.

---

## Requirements _(mandatory)_

### Functional Requirements

**Accounts and access**

- **FR-001**: System MUST allow a person to create an account with an email address, password, and display name.
- **FR-002**: System MUST allow a person to sign in with an existing Google or Apple account, creating an account transparently on first use if none exists.
- **FR-003**: System MUST keep a person signed in across app restarts without re-entering credentials, and MUST store the credentials that make this possible in the device's protected storage.
- **FR-004**: System MUST allow a person to sign out on one device, or on all devices at once.
- **FR-005**: System MUST detect and shut down reuse of a session credential that has already been retired, and inform the account holder.
- **FR-006**: System MUST allow a person to permanently delete their account, removing all their trips, notes, expenses, photos, and documents, including stored files.
- **FR-007**: System MUST allow a person to export all of their own data in a portable form.
- **FR-008**: System MUST let a person set a home currency, a display name, a biography, an avatar, and whether their profile is publicly visible.

**Trips**

- **FR-009**: Users MUST be able to create a trip with a title and a home currency.
- **FR-010**: System MUST model a trip as an ordered sequence of stops, each a city with an arrival and departure date — not as a single origin and destination.
- **FR-011**: System MUST reject a stop whose departure date precedes its arrival date.
- **FR-012**: Users MUST be able to reorder, edit, and remove a trip's stops.
- **FR-013**: System MUST assign every trip a lifecycle state of _Planning_, _Active_, or _Past_, derived from its dates, and keep that state current without user action.
- **FR-014**: System MUST offer city selection filtered by a chosen country, searchable by typing, tolerant of missing accents, and ranked so well-known cities appear first.
- **FR-015**: System MUST suggest the next stop's arrival date based on the previous stop's departure date.
- **FR-016**: System MUST derive the connections drawn between a trip's stops from the stop list itself, so that inserting a stop mid-trip requires no separate maintenance.

**Notes**

- **FR-017**: Users MUST be able to attach a note to a specific city, to a country in general, or to the trip as a whole.
- **FR-018**: Users MUST be able to move an existing note between those levels without losing its content or creation date.
- **FR-019**: System MUST require every note to belong to a trip and to be anchored to at least a country.

**Expenses**

- **FR-020**: Users MUST be able to record an expense with an amount, a currency, a category, a date, and optionally a city and a note.
- **FR-021**: System MUST store both the amount as originally paid and the equivalent in the trip's home currency, together with the conversion rate used at the time of entry.
- **FR-022**: System MUST NOT retroactively alter the home-currency value of an already-recorded expense when rates change.
- **FR-023**: System MUST provide the categories Food, Lodging, Transport, Activities, Shopping, and Other by default.
- **FR-024**: Users MUST be able to create custom expense categories, which MUST be reusable across all of that person's trips.
- **FR-025**: System MUST present per-trip spending broken down by category and by day, expressed in the home currency.
- **FR-026**: System MUST disclose the conversion rate applied when a trip contains more than one currency.
- **FR-027**: System MUST NOT provide any means, in any interface or by any request, for one person's expense records to become visible to another person. This MUST be enforced structurally at the data layer, not only by interface design.

**Photos and documents**

- **FR-028**: Users MUST be able to add photos to a trip and optionally associate them with a city.
- **FR-029**: System MUST read capture time and location from a photo where present and record them.
- **FR-030**: System MUST generate and serve reduced-size versions of photos for browsing, reserving full-resolution originals for deliberate viewing.
- **FR-031**: Users MUST be able to store travel documents — boarding passes, bookings, and similar — against a trip.
- **FR-032**: System MUST treat travel documents as permanently private, with no visibility control offered at all.
- **FR-033**: System MUST protect stored documents such that obtaining the underlying data store alone does not reveal their contents.
- **FR-034**: System MUST prevent screenshots and screen recording while a travel document is displayed.
- **FR-035**: System SHOULD extract flight number, date, and passenger name from a scannable boarding pass and offer them for confirmation rather than requiring manual entry.

**Offline operation**

- **FR-036**: System MUST allow notes, expenses, photo captures, and documents to be created, edited, and deleted with no connectivity, saving locally first.
- **FR-037**: System MUST preserve unsynchronised local changes across app termination and restart.
- **FR-038**: System MUST synchronise local changes automatically when connectivity returns, without user action.
- **FR-039**: System MUST propagate deletions as synchronisable events, so a record deleted on one device does not reappear from another.
- **FR-040**: System MUST resolve competing edits to the same record by one consistent, deterministic rule applied in a single place, and MUST inform the device whose version was superseded.
- **FR-041**: System MUST treat a photo or document as fully saved only once its file has been transferred, not merely its description.
- **FR-042**: System MUST show an explicit first-time synchronisation state on a new device rather than an empty screen.
- **FR-043**: Users MUST be able to read previously synchronised trip content while offline.
- **FR-044**: Users MUST be able to download a city's map data in advance for use without connectivity.

**Globe and map**

- **FR-045**: System MUST present the person's travel history as connections drawn on a 3D globe as the home screen.
- **FR-046**: System MUST visually distinguish planning, active, and past trips on the globe, and MUST animate the active trip.
- **FR-047**: Users MUST be able to open a trip by tapping its connection on the globe.
- **FR-048**: System MUST transition continuously from globe to detailed local map as the person zooms in, with no visible break between two separate views.
- **FR-049**: System MUST show terrain and building detail at close zoom.
- **FR-050**: System MUST display summary travel statistics — countries visited and distance travelled.
- **FR-051**: System MUST show a purposeful empty state for a person with no trips yet.

**Privacy and sharing**

- **FR-052**: System MUST default every trip, note, and photo to private.
- **FR-053**: System MUST give each trip, note, and photo its own independent visibility setting, rather than one global switch.
- **FR-054**: System MUST enforce all visibility rules at the point where data is retrieved, so that a defect in the interface cannot expose private content.
- **FR-055**: System MUST present a public trip as a curated view — the route, cover image, cities, and only the explicitly public notes and photos — and never as a complete dump of the owner's records.
- **FR-056**: System MUST withhold a photo from public visibility until it has passed automated content screening, irrespective of the visibility its owner has set.
- **FR-057**: System MUST make previously public content unreachable once its visibility is revoked.

**Social**

- **FR-058**: Users MUST be able to follow another traveller; the follow MUST take effect immediately for public profiles and require approval for private ones.
- **FR-059**: Users MUST be able to view a feed of recent public trips from the travellers they follow.
- **FR-060**: Users MUST be able to browse public trips for a given city or country in order to plan their own visit.
- **FR-061**: Users MUST be able to block another traveller, after which that person cannot reach their content.
- **FR-062**: Users MUST be able to report a trip, note, photo, or traveller, and the report MUST be recorded for review.

**Planner**

- **FR-063**: Users MUST be able to request an itinerary for a city in plain language, describing duration and interests.
- **FR-064**: System MUST return a day-by-day itinerary of named places, each pinned at a verified real location.
- **FR-065**: System MUST omit any suggested place whose real location cannot be confirmed with reasonable confidence, rather than placing it at a guessed position.
- **FR-066**: System MUST connect each day's places with a walking route in an order that avoids obvious backtracking, while leaving the order editable.
- **FR-067**: Users MUST be able to move activities between days, remove them, and add their own, with the affected routes redrawing without regenerating the whole itinerary.
- **FR-068**: System MUST process itinerary requests without blocking the app, showing clear progress.
- **FR-069**: System MUST limit how many itinerary requests one person can make per day and communicate the limit clearly when reached.
- **FR-070**: System MUST avoid the full cost of regenerating a materially identical recent request.

**Cross-cutting**

- **FR-071**: System MUST limit the rate of sign-in and registration attempts to resist credential guessing.
- **FR-072**: System MUST return clear, human-readable messages on failure, without revealing internal detail.
- **FR-073**: System MUST report errors and crashes to the team automatically so that failures affecting travellers are visible.

**Trip allowance and subscription**

- **FR-074**: System MUST enforce a maximum number of trips an account may hold without an active paid entitlement. The number is a business-tunable value, set to 5 at launch.
- **FR-075**: System MUST NOT count deleted trips toward the allowance, and MUST free a slot immediately when a trip is deleted.
- **FR-076**: System MUST block only the _creation_ of a new trip when the allowance is reached. It MUST NOT delete, hide, lock, archive, degrade, or restrict access to any trip a traveller already holds, under any circumstance.
- **FR-077**: System MUST, when creation is blocked, tell the traveller how many trips they hold, what the allowance is, and present both routes forward — subscribe, or delete an existing trip.
- **FR-078**: Users MUST be able to take a paid subscription that removes the trip allowance.
- **FR-079**: System MUST create the trip the traveller was attempting immediately on successful subscription, without requiring them to re-enter anything they had already provided.
- **FR-080**: System MUST, when a subscription ends while the account holds more trips than the free allowance, keep every existing trip fully readable and editable, and block only the creation of further trips until the account is back under the allowance.
- **FR-081**: System MUST NOT handle, transmit, or store raw payment card details at any point; payment MUST be delegated to a payment provider and only that provider's references retained.
- **FR-082**: Users MUST be able to cancel a subscription without contacting support, and MUST be told plainly the date on which the change takes effect.
- **FR-083**: System MUST make a failed or declined payment recoverable without risk of a duplicate charge on retry.
- **FR-084**: System MUST show no reference to allowances or payment to a traveller who is below the free allowance.

**Forward compatibility**

- **FR-085**: System MUST model trip ownership such that introducing additional members on a trip later is an additive change, not a restructuring of existing trips, notes, photos, expenses, or documents. Multi-member trips are out of scope for this release; foreclosing them is not.

### Key Entities

- **Traveller**: A person with an account. Holds a display name, biography, avatar, home currency, and whether their profile is publicly visible. Owns everything below.
- **Trip**: A named journey belonging to one traveller. Has a lifecycle state (planning, active, past), a home currency, a cover image, and its own visibility setting.
- **Stop**: One city within a trip, with a position in the trip's order and arrival and departure dates. The route drawn on the globe is derived from consecutive stops.
- **Country / City**: Reference geography — a canonical, pre-loaded catalogue of countries and cities with coordinates, time zones, and relative prominence. Powers city selection and positions everything on the globe. Not user-created.
- **Note**: A written entry belonging to a trip, anchored to a country and optionally narrowed to a city. Has its own visibility setting.
- **Photo**: An image belonging to a trip, optionally associated with a city. Carries capture time and location where available, a content-screening status, and its own visibility setting.
- **Document**: A travel document belonging to a trip — boarding pass, booking, or similar. Permanently private, protected at rest, and may carry details extracted from a scanned barcode. Has no visibility setting by design.
- **Expense**: A recorded payment belonging to a trip, optionally to a city. Holds the amount as paid with its currency, the converted home-currency amount, the rate used, a date, and a category. Permanently private, with no visibility setting by design.
- **Expense Category**: A label for expenses. Either one of the system defaults or one created by a traveller and reusable across all of their trips.
- **Itinerary Day**: One planned day within a trip, for a specific city, holding an ordered list of activities.
- **Itinerary Item**: A single planned activity — a named place at a verified location, in order within its day, marked as either suggested by the planner or added by the traveller.
- **Follow**: A directed relationship between two travellers, either pending approval or accepted.
- **Block**: A directed relationship that makes one traveller's content unreachable by another.
- **Report**: A traveller's flag against a trip, note, photo, or traveller, with a reason and a review status.
- **Subscription**: A traveller's paid entitlement, if any. Records whether it is currently active and until when, plus a reference held by the payment provider. Its only effect in this release is to lift the trip allowance; it never affects the visibility, retention, or usability of anything already recorded.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

**Speed and responsiveness**

- **SC-001**: A traveller reaches an interactive globe within 3 seconds of opening the app from cold.
- **SC-002**: The globe stays visually smooth, with no perceptible stutter, while displaying at least 50 trip routes on a mid-range device.
- **SC-003**: 95% of everyday actions — opening a trip, saving a note, logging an expense — complete without a perceptible wait.
- **SC-004**: A generated itinerary for a two-day city request is delivered within 60 seconds of the request, with visible progress throughout.

**Task completion**

- **SC-005**: A new traveller can go from opening the app for the first time to having a two-stop trip saved in under 3 minutes.
- **SC-006**: A traveller can record an expense in under 15 seconds from opening the app.
- **SC-007**: 90% of travellers successfully create their first trip on their first attempt without assistance.
- **SC-008**: A traveller can publish a trip and confirm exactly what is visible to others in under 2 minutes.

**Offline reliability**

- **SC-009**: 100% of notes, expenses, photo captures, and documents created without connectivity survive an app restart and reach the server once connectivity returns.
- **SC-010**: Synchronisation completes within 30 seconds of connectivity returning for a typical day's captured content.
- **SC-011**: Zero records are lost, duplicated, or resurrected across a test suite covering interrupted synchronisation, two-device concurrent edits, and offline deletion.

**Privacy — the product's non-negotiable outcome**

- **SC-012**: Zero expense or document records are reachable by anyone other than their owner, demonstrated by an automated test suite that attempts access as a non-owner through every available route.
- **SC-013**: Zero private notes or photos appear in any public view, verified by automated tests running as a non-following, non-owner account.
- **SC-014**: 100% of photos are screened for prohibited content before becoming publicly visible.
- **SC-015**: An account deletion removes all of that person's records and stored files, verified by an automated check that finds no residue.

**Data integrity**

- **SC-016**: Spending totals reconcile exactly to the sum of individual expenses in every currency combination tested.
- **SC-017**: 100% of itinerary places shown to a traveller correspond to real, correctly located places — no fabricated or mislocated pins reach the map.

**Product**

- **SC-018**: A traveller who records one trip returns to record a second within 90 days at a rate of at least 40%.
- **SC-019**: At least 25% of travellers who complete a trip choose to make at least one trip public.
- **SC-020**: Backups are demonstrated restorable within 1 hour, with no more than 24 hours of data at risk.

**Trip allowance and subscription**

- **SC-021**: Zero trips are lost, hidden, or made unusable as a consequence of reaching the allowance or of a subscription ending, verified by an automated test that takes an over-allowance account through a full lapse and confirms every trip remains readable and editable.
- **SC-022**: A traveller who hits the allowance reaches either outcome — subscribed, or a trip deleted and the new one created — in under 90 seconds, without losing the trip details they had already entered.
- **SC-023**: At least 5% of travellers who reach the free allowance take a subscription rather than abandoning the attempt.
- **SC-024**: Fewer than 20% of travellers who reach the free allowance abandon trip creation entirely, taking neither route.
- **SC-025**: Zero duplicate charges occur across a test suite covering declined payments, lost confirmations, and retried attempts.

---

## Assumptions

**Resolved from the source documents** — decisions already made in the blueprint and technical specification, recorded here as settled rather than open:

- Trips are modelled as an ordered sequence of stops rather than an origin/destination pair, so multi-city journeys are the normal case, not a special one.
- A canonical, pre-imported geography catalogue supplies countries and cities; travellers never create geography themselves, and free-text place entry is out of scope.
- The globe is the home screen and therefore the product's primary weekly loop, taking precedence over the feed for screen real estate.
- Competing edits to the same record are resolved last-write-wins, decided in one place, rather than by a merge strategy. This is acceptable because the data is single-owner journal content where conflicts are rare and low-stakes. It would need revisiting if multiple people ever edit one trip.
- Offline synchronisation is a gating milestone before any social feature, not a later refinement.
- Expenses and documents are private by structural omission — they have no visibility setting to set incorrectly — rather than by a flag the system must remember to check.
- Currency conversion is captured at the moment of entry and frozen, so historical records never silently change value.
- Automated content screening applies to photos before public visibility. Human moderation tooling is deferred beyond this specification.
- Email verification and password reset flows are assumed necessary and in scope, though the source documents specify them only in passing.

**Defaults chosen here** where the source documents were silent:

- Target travellers are individual consumers on personal mobile devices; no organisational accounts, team billing, or administrative hierarchy.
- The product launches in English only; the geography catalogue's local place names are displayed but the interface is not localised.
- Standard consumer mobile expectations apply for performance and error handling. There is no formal availability commitment at this stage.
- Data is retained for the life of the account and removed on deletion, with a short grace window before permanently discarding deleted content so that a device which has not yet synchronised is not left with a broken reference.
- Accessibility follows platform defaults; no specific conformance level is committed to in this specification.
- Push notifications, the memories-resurfacing feature, packing lists, weather, flight status, and PDF photobook export are all explicitly out of scope — they are listed in the blueprint as later-phase ideas.
- Collaborative trips with multiple editors are out of scope for this release, but must not be foreclosed by the design (FR-085).
- The free trip allowance is set at 5. This is a business parameter expected to be tuned on evidence, not a product truth — nothing in the design should assume the specific number.
- The paid entitlement is a recurring monthly subscription that lifts the allowance entirely. A one-off "buy additional trips" purchase was raised as an alternative and is deliberately not specified here; the requirements are written in terms of an _entitlement_ rather than a subscription mechanism specifically, so adding one-off purchases later does not invalidate them.
- Subscription pricing, currency handling for payments, trial periods, refunds, promotional codes, and regional tax treatment are out of scope for this specification and need commercial decisions before launch.
- The allowance counts trips, not stops, notes, photos, expenses, or storage volume. No other resource is metered in this release.

**Dependencies**

- A geography catalogue must be sourced and imported before city selection or the globe can function.
- Third-party sign-in from Google and Apple must be registered and approved before those routes work.
- Currency conversion rates must come from an external source; the product must behave sensibly when that source is briefly unavailable.
- Map rendering, place verification, and route calculation rely on an external mapping provider whose usage is metered — cost scales with active travellers.
- Itinerary generation relies on an external language model whose usage is metered per request, which is why per-person daily limits and caching are requirements rather than optimisations.
- Automated content screening relies on an external or self-operated classification service.
- Transactional email delivery is required for verification and password reset.
- A payment provider is required for subscriptions, and must be one that keeps raw card details entirely outside this product.

---

## Resolved Decisions

Three questions were open when this specification was first drafted. All were decided on 2026-08-25 and are recorded here so the reasoning is not lost.

**1. Scope boundary — all stories in one specification.**
This specification carries every user story through to delivery rather than being split per phase. The sequencing constraint above, not a document boundary, is what governs build order.

**2. Trips are single-owner, with the seam for members left open.**
`travelappfullspec.md` models every trip as belonging to exactly one traveller, and both the privacy model and the last-write-wins conflict rule are justified by that assumption. A competing earlier decision favoured group trips joined by an invite code. The resolution is to ship single-owner — keeping the privacy and synchronisation models internally consistent, and avoiding the multi-editor case that last-write-wins genuinely cannot serve — while requiring that adding members later be an additive change rather than a restructuring (FR-085). Group travel is therefore deferred, not designed out.

**3. Free trips are capped; a subscription lifts the cap.**
The product is free up to 5 trips. Beyond that a traveller either subscribes monthly or deletes an existing trip to make room. The decisive constraint is that this must never cost a traveller anything they have already recorded: reaching the allowance, or letting a subscription lapse while over it, blocks _creating_ a new trip and nothing else (FR-076, FR-080). Everything already captured stays readable and editable indefinitely. Requirements are written against an _entitlement_ rather than a subscription specifically, so a one-off "buy more trips" purchase — raised as a possible alternative — can be added later without reopening them.
