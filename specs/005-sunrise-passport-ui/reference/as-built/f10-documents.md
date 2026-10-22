# F10 Documents, the list, the viewer and the capture screens: as built

Branch `feat/f10-documents` (from `feat/f7-photos`). Task T552. Pictures: `screens/more/documents.png`, `documents-dark.png`,
`document-view.png`, `document-view-dark.png`. CSS: `prototype/extra/screens.css` (`.privnote`, `.tkt`, `.tmain`, `.tic`, `.ttx`,
`.tsub`, `.nt`, `.scan`, `.sc-top`, `.qr`, `.bright`, `.dv-foot`), `extra/extra.css` (`.nav`, `.lt`, `.fab`, `.ibtn`, `.group`, `.lrow`,
`.btn-danger-text`), `extra/src/frames/documents.html`, `document-view.html`.

Reused from F7 (API unchanged, nothing extended): `components/ui/area-header.tsx` (`AreaHeader`: `privacy`, `actions`, `titleTestID`,
`subtitleTestID`), `area-fab.tsx` (`AreaFab`, `areaFabClearance`), `PrivacyChip`, `ComingSoonButton`, `useComingSoon`.

## Files

New: `features/documents/document-ticket.ts` (`KIND_ICON`, `documentCount`, `documentsSubtitle`, `ticketModel`), `components/trip/document-ticket.tsx`
(`DocumentTicket`), `barcode-plate.tsx` (`BarcodePlate`), `document-hero.tsx` (`DocumentHero`), `brightness-boost.tsx`,
`documents-skeleton.tsx`, each with a test (`document-ticket.test.tsx`, `document-hero.test.tsx`, `test/features/document-ticket.test.ts`).
Rewritten: `app/trip/[id]/documents.tsx`, `document-view.tsx`, `components/trip/documents-header.tsx`, `document-list-item.tsx`,
`document-details.tsx`. Edited: `document-image.tsx` (the hero), `document-capture.tsx` (the shared bar), `document-camera-permission.tsx`
and `document-confirm-form.tsx` (cream tile cards), `app/trip/[id]/_layout.tsx` (`documents` and `document-view` have `headerShown: false`),
`icon-registry.ts` (`scan`, `sun`: 68 icons). Untouched: `use-screen-capture-guard.ts` and every `useScreenCaptureGuard()` call (screen
capture protection is unchanged), the capture flow, the vault, upload and sync.

## Fidelity audit (picture and CSS against the code before this change)

| Rule (picture / prototype)                                                            | Before                                                     | Now                                                                                                                             |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Header: tonal Back, "Only you" chip and "more" disc at the end, title 28/32, subtitle | native header "Documents"; a muted "Documents · trip" line | `AreaHeader` (native header hidden); `documents-title` is "Documents"; subtitle "Trip · N documents" (`documents-subtitle`)     |
| "more" (...) disc                                                                     | MISSING                                                    | `ComingSoonButton` `coming-soon-documents-more`, tonal (Q-11)                                                                   |
| Privacy line with an aqua lock under the title                                        | a notice card with a muted lock                            | lock in `aquaInk` and the label text, the words and `documents-privacy` unchanged                                               |
| Ticket: cream, hairline, 24 dp, min 104, disc 44, kind, title, reference, stub 88     | a lifted `Card` row with a chevron and a bare icon         | `DocumentTicket`: cream `surfaceSecondary`, hairline, 24 dp, min 104, 44 dp paper disc, stub 88, no chevron                     |
| Perforation: 2 dp dashed `sand`, inset 24 dp top and bottom                           | MISSING                                                    | absolute dashed edge on the stub                                                                                                |
| Notches: 20 dp circles of the canvas colour, half clipped, no mask                    | MISSING                                                    | two `bg-background` circles with a hairline, centred on the perforation (`right: 77`), clipped by the card                      |
| Kind icons: plane / bed / document for the three real types                           | plane / ticket / file-text                                 | `KIND_ICON`: plane, bed, file-text                                                                                              |
| Date stub: day over month                                                             | none                                                       | a confirmed pass: its flight day; anything else: the day it was added (never an unconfirmed proposal); the name says which      |
| Pending: only on this device                                                          | dashed amber edge + badge                                  | unchanged shape (dashed amber edge), badge and words kept                                                                       |
| Text scale 1.5 / 2                                                                    | wrapped                                                    | at >= 1.15 the ticket stacks (stub as a row under a dashed top edge, notches gone), as the trips' ticket does                   |
| Skeleton mirrors content                                                              | row bones                                                  | `DocumentsSkeleton`: three 104 dp, 24 dp-radius blocks, one `progressbar` "Loading documents"                                   |
| Empty "No documents yet"                                                              | words, the primary above the list                          | `EmptyState` with the one primary "Scan document" (name "Add document", `documents-add`); the FAB is not drawn then             |
| FAB "Scan document", bottom end                                                       | a primary button at the top of the list                    | `AreaFab` `documents-add`, named "Add document", icon `scan`, hides with the keyboard                                           |
| Viewer bar: close disc, centred kind, "Only you" chip                                 | native header "Document" + a title in the body             | own bar: cross disc named "Back", kind centred (`document-view-title`, a header), `PrivacyChip`; drawn in every state           |
| Hero: scan card, 16 dp, second lift, tilt -1 deg, navy band                           | the picture in a hairline frame                            | `DocumentHero`: band (`accentInk`, white label: kind, and the flight once CONFIRMED) over the plate                             |
| Barcode on a white plate                                                              | picture on the page                                        | `BarcodePlate`: opaque `onPhoto` white in all four themes, 16 dp quiet zone, nothing across it                                  |
| Brightness line                                                                       | MISSING                                                    | `BrightnessBoost`: sun + "Brightness boost", a coming-soon control `coming-soon-document-brightness`                            |
| Details group: cream, hairlines, label over value, cloud tick                         | a lifted card for the fields; a badge and a sentence below | `DocumentInfoGroup`: the pass's fields, then "Added <day>" with the cloud tick when uploaded; the badge and sentence stay below |
| Share a copy, Reference with copy, Linked to                                          | MISSING                                                    | NOT DRAWN (see deviations)                                                                                                      |
| Delete                                                                                | destructive button "Delete document", at the start         | centred destructive button, visible word "Delete", name "Delete document", confirmation unchanged                               |
| Capture and confirm screens                                                           | text Back + title; flat and lifted cards                   | `AreaHeader` (tonal Back, title, chip); permission and confirm cards are cream tiles                                            |

## Deviations (and why)

- **Share a copy is omitted, not drawn.** A document is never shareable (constitution I, D-05; `expo-screen-capture` stays). A button
  that looks like it exports a document is not allowed even as a coming-soon control, and Maestro `05` asserts that nothing named
  share/export/copy/send/download/print is visible. For the same reason **"Reference" with its copy control** is omitted: copying a
  document's value out is an export, and the data has no reference field. **"Linked to"** is omitted: documents have no stop link.
- **Five kinds are three.** Flight, Stay, Car rental, Insurance and Passport cannot be stored (UI-SPEC 10). The three real types keep
  their words ("Boarding pass", "Booking", "Other document") as the ticket's title, with the plane, bed and document glyphs. There is
  no kind caption above the title (the pictured "Flight") because the app's word is already the title. No data is invented: the
  pictured route, times, gate, seat, reference and "scan, 1 page" are NOT shown. The hero's route, gate and seat are the scan's own
  content, inside the traveller's picture.
- **The stub is a real date.** Confirmed pass: the flight day; otherwise the day it was added (a proposal is never dressed as fact).
  The screen-reader name carries "Flight date ..." or "Added ...", so the two are never confused.
- **Subtitle "N documents", not "N saved".** A document is not saved until its bytes are uploaded (AGENTS.md), so the count is of
  documents, which is true offline too.
- **The close disc is named "Back"**, not "Close": Maestro `05` taps `Back` on the viewer, and the app's words win over the picture's.
  The glyph is the picture's cross.
- **The privacy line keeps the app's words** ("Only you can see your documents. They're encrypted, and there's no way to send them to
  anyone."); the picture's "Encrypted on this phone and in your account. Never shared with anyone." is not used.
- **Brightness boost** is a coming-soon control, and its caption does not claim the screen is brighter (nothing changes the brightness).
- **Delete** is the kit's `danger-soft` button (tint fill), not the picture's bare danger text: the adapter has no bare danger variant.
- **The band's navy** is `accentInk` (one value per theme), not the prototype's fixed `#12355E`; white `onPhoto` text on it.
- **The tilt** (-1 deg) is the picture's; it is static, so reduced motion has nothing to remove.
- **Unresolved test ids.** `DocumentTicket` names its control from `spoken` (`accessibilityLabel={spoken}`) and `DocumentsSkeleton`
  does not forward an id, so `test/fixtures/testid-unresolved-count.json` is unchanged (98 / 70).

## Tests

`test/features/document-ticket.test.ts` (icons, count and subtitle without PluralRules, stub source, no passenger name),
`components/trip/document-ticket.test.tsx` (one control, geometry, disc, perforation, notches, pending edge, stacked at 1.15 / 1.5 / 2),
`document-hero.test.tsx` (plate white in four themes, hero tilt and band, brightness coming-soon, skeleton geometry);
`test/app/document-screens.test.tsx` ("as pictured" blocks for the list, the viewer and the capture bar; no share control, no
passenger name in the list, Delete), updated: `document-screens-edges.test.tsx`, `test/app/trip-layout.test.tsx` (the document routes hide
the navigator header), `test/ui-kit/document-screens-real-render.test.tsx`, `icon-registry.test.tsx` (`scan`, `sun`).

## Device checks for the owner

1. iPhone and Android: the list and viewer sit under the status bar as in `documents.png` and `document-view.png`; Android margins are 16 dp.
2. The notches: half circles on the perforation at the top and bottom of each ticket, the canvas colour in light AND dark (no visible
   seam); on Android the dashed perforation stays dashed (a one-sided dashed border can draw solid on some devices).
3. The hero over a real boarding-pass photo: the barcode sits on pure white in dark mode, is not blurred by the -1 deg tilt, and a
   second phone can scan it from the screen.
4. Text size 1.5 and 2: tickets stack, nothing clips; the FAB label stops at 1.3.
5. Screen capture is still blocked on the list, the viewer and the capture screen (a screenshot is black on Android).
6. Maestro `05-photos-and-documents`: "No documents yet", the `documents-add` tap, the confirm form, "Uploaded to your account.",
   `Back` on the viewer, "Boarding pass" and "AC834 · ..." on the list.
7. VoiceOver / TalkBack: a ticket reads "Boarding pass. AC834 · date. Check these details. Not yet synced. Added date" as one button.

## Steps finished (evidence)

Resumed after an interrupted session: the 26 uncommitted files were reviewed, found coherent (tsc, eslint, parity, theme check and
the full Jest all green), and committed in four steps. The one console warning ("invalid" colour) comes from
`test/ui-kit/photo-screen-real-render.test.tsx` (F7), not from F10.

| Step                                                                           | Tests                                                                 | Commit    |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------- |
| Kind icons, count and subtitle without PluralRules, ticket model, `scan`/`sun` | `test/features/document-ticket.test.ts`, `icon-registry.test.tsx`     | `e694412` |
| List: `DocumentTicket`, notches, header, FAB, skeleton, empty state, layout    | `document-ticket.test.tsx`, `trip-layout.test.tsx`                    | `475cd8c` |
| Viewer: hero, barcode plate, brightness coming-soon, details group, no share   | `document-hero.test.tsx`                                              | `ca51348` |
| Capture and confirm screens, screen tests                                      | `document-screens*.test.tsx`, `document-screens-real-render.test.tsx` | `1c4c6cb` |

Gates on the final tree: full Jest 351 suites, 8710 passed, 3 skipped; `tsc --noEmit`, `eslint . --max-warnings=0`, prettier
(route files with character classes), testid parity (205 ids, 64 labels), `build-theme-css --check`: all green.
