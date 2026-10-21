# F9 Notes, the area and the editor sheet: as built

Branch `feat/f9-notes` (from `feat/f7-photos`). Task T551. Pictures: `screens/more/notes.png`, `notes-dark.png`,
`notes-long.png`, `notes-scale1.5.png`, `note-editor.png`, `note-editor-dark.png`. CSS: `prototype/extra/screens.css`
(`.ngh`, `.note`, `.nb`, `.nrow`, `.nth`, `.nm`, `.sync`, `.hsync`, `.ne-body`, `.ntitle`, `.nmeta`, `.fmt`),
`extra/extra.css` (`.nav`, `.lt`, `.fab`, `.sheet-head`, `.sg`), `extra/src/frames/notes.html`, `note-editor.html`.
Reuses F7's `AreaHeader` and `AreaFab` unchanged, and F6's `FormSheet` (extended additively).

## Files

New: `components/trip/note-day.tsx` (`NoteDaySection`), `note-format-bar.tsx` (`NoteFormatBar`), `notes-skeleton.tsx`,
`features/notes/note-days.ts` (grouping, time, place, excerpt, per-record sync state, counts; tested in
`test/features/note-days.test.ts`). Rewritten: `app/trip/[id]/notes.tsx`, `note-card.tsx`, `notes-header.tsx`.
Extended: `note-editor.tsx` (state line, date chip, format strip), `anchor-picker.tsx` (flag on a chip),
`features/notes/use-move-note.ts` (`AnchorTarget.iso2?`), `db/repositories/notes.ts` (`NoteWithPlace.country_iso?`, one extra
selected column), `components/ui/form-sheet.tsx` (`headerSubtitle`, `footerAccessory`, both optional), `icon-registry.ts`
(`bold`, `list`, `list-checks`), `app/trip/[id]/_layout.tsx` (`notes` has `headerShown: false`).
`private-note.tsx` is untouched (it is the Photos privacy line; a note has no visibility control).

## Fidelity audit (picture and CSS against the code before this change)

| Rule (picture / prototype)                                                                   | Before                                                      | Now                                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header: tonal Back disc, title, "Trip · N notes", search disc at the end                     | native header "Notes"; no trip line, no count, no search    | `AreaHeader` (native header hidden for the route); `notes-subtitle`; `ComingSoonButton` `coming-soon-notes-search` "Search notes" (Q-11)                       |
| Subtitle count                                                                               | none                                                        | count of the notes the list shows; none while loading or after a failed read (no invented number)                                                              |
| Day groups, `callout` heading "Today" / "Tue 13 Oct", 8 above and 12 below                   | one flat newest-first list                                  | `groupNotesByDay` (device local day, newest first, undated last) and `NoteDaySection`; the heading is an announced header with the full date                   |
| Card: cream tile, hairline, radius 16, padding 16, 12 between, no shadow                     | raised paper card (radius 24, shadow), dashed edge if dirty | `Card variant="tile"`; no dashed edge; days 20 apart (12 + the heading's 8)                                                                                    |
| Title `callout` 1 line (2 at big text), excerpt `body` muted, 3 lines                        | headline title, body cut at 160 characters, no clamp        | `numberOfLines` 1 (2 from scale 1.5) and 3; the excerpt carries 240 characters so a long note never lays out 20,000                                            |
| Foot row: time, dot, flag, place at the start; sync at the end; wraps at large text          | anchor caption on top, badge, Edit and Delete buttons       | `FootPlace` + `SyncMark`; the row wraps (`notes-scale1.5`)                                                                                                     |
| Sync: "On this device" amber with an upload cloud, or a synced tick                          | `SyncBadge` "Not yet synced" capsule                        | `noteSync`: `is_dirty` is "On this device" + `cloud-upload` (name "On this device, not yet synced"); clean is `cloud-check` named "Synced"                     |
| 72 dp thumbnail at the top right when the note has a photograph                              | none                                                        | NOT drawn: the data model has no photograph on a note (see deviations)                                                                                         |
| Tap the card to edit                                                                         | Edit and Delete buttons                                     | the body is `note-edit-<id>` ("Edit <title>"); a quiet trash is `note-remove-<id>` ("Delete <title>"); the card keeps its one-element name and the two actions |
| FAB "New note" with a pencil, bottom end, hides with the keyboard                            | a primary button in the list header                         | `AreaFab` `notes-add`, icon `pencil`; drawn with no notes too (Maestro writes the first note from it); list leaves room under the last card                    |
| Skeleton mirrors content                                                                     | `ListSkeleton variant="card"`                               | `NotesSkeleton`: a heading bone and two tiles with the card's padding and radius; one `progressbar` "Loading notes"                                            |
| Empty "No notes yet", error, filters                                                         | as built                                                    | unchanged words and ids (`notes-empty-add`, `notes-filter-*`, `notes-write-error`); filters sit fixed under the header                                         |
| Editor sheet: Cancel / title / Save, sync under the title, date chip, place chip, format bar | `FormSheet host="modal"` with anchor chips, two fields      | same sheet; edit shows the state line (`note-editor-sync`) and the date chip (`note-editor-date`); anchor chips lead with the flag; `NoteFormatBar`            |
| Keyboard                                                                                     | Save in the sticky footer                                   | unchanged, and the format strip rides in the same footer (`footerAccessory`); keyboard-visibility tests kept and extended                                      |
| Dark, contrast, scales 1.5 and 2, Android                                                    | tokens                                                      | tokens only (classes and `Space`); margin 16 and square FAB on Android through `areaMargin` / `AreaFab`; no fixed heights                                      |

## Deviations (and why)

- **"New note", not "Add note".** The app's words are "New note" (the old button, the editor title, `us2-screens` and the Maestro
  flows) and the picture says "New note" too; the brief's "Add note" does not exist in the app. Kept as is.
- **No thumbnail.** UI-SPEC 9.2 draws a thumbnail for a note with a photograph. A note has no photograph link in the schema, the
  wire or the store, so drawing one would be invented data. The `Add photo` control of the editor's strip is coming-soon.
- **Thumbnail size** (when the capability exists): the prototype CSS says 64 (`.nth`), UI-SPEC says 72; CSS decides (README).
- **No autosave, no Done, no header trash.** The picture's editor autosaves with Done and a trash. This editor keeps Cancel and
  Save (a note is not saved until Save; Cancel writes nothing; a failed save keeps the typed note). A new note shows no state
  line because nothing is saved yet. Delete stays on the card (a 20 dp trash with a 44 dp target through `hitSlop`) because the
  parity guard keeps `note-remove-<id>`, and it is not pictured there.
- **Sync wording.** The visible "On this device" is the picture's; the announced name adds "not yet synced" so the name contains
  the visible words. The tick has no visible words (as pictured) and is named "Synced". There is no per-record failure state for a
  note, so none is drawn. A dirty note that was synced before and then edited also says "On this device": its latest words are only
  here.
- **The old dashed edge is gone** from a pending note (the picture has a hairline); the glyph and the words carry the state.
- **Place in the foot row** is the city (else the country, else "Trip"), as pictured; "Firenze, Italy" remains in the announced name.
- **Day heading** has no "Yesterday": the picture shows "Tue 13 Oct". The year is added for another year. Word order is the
  picture's (weekday day month), not the locale's.
- **Count under the title** follows the filter chips (the notes shown), not the trip's total.
- **Format strip** (Bold, Bulleted list, Checklist, Add photo, Tag place) is five coming-soon buttons (a note is plain text); Dismiss
  keyboard is real. Add photo uses the `image` glyph (Phosphor has no image-plus).
- **Place chip** of the picture is the anchor chooser's chips (with the country flag); the chosen chip shows its check instead of
  the flag (the `Chip` rule). **Date chip** is read-only and only for an edit: the creation date, which a move never changes.
- **Filters** are the app's and not pictured; they stay, fixed under the header.

## Tests

`test/features/note-days.test.ts` (days, labels, year, undated, time, place, excerpt, sync state, no PluralRules),
`anchor-targets-flags.test.ts`; `test/app/notes-pictured.test.tsx` (header, search toast, days, foot row, clamps at scale 1.5, sync
glyphs, no thumbnail, FAB incl. empty and keyboard, states, no autosave, editor state line); `test/components/note-editor.test.tsx`
(format strip in the footer with the keyboard up, five coming-soon controls, Dismiss keyboard, Cancel and Save only, state line,
flag chip), `notes-skeleton.test.tsx`; `form-sheet.test.tsx` (subtitle, accessory); updated: `us2-screens`, `us2-components`,
`notes-spending-real-render` (new look), `trip-layout` (`notes` is hidden-header like `photos`), `icon-registry`,
`repositories-us2` (`country_iso`). `testid-unresolved-count.json`: accessibility labels 70 to 73 (three labels built from view-model
strings: the two sync names and the day's spoken date); test ids unchanged at 98. No baseline id was dropped (`notes-title` stays
retired under its allowlist entry; the header title is `notes-header-title`).

## Device checks for the owner

1. iPhone and Android: header as `notes.png` (Back disc, search disc, title, trip line), cards as pictured, "Today" and dates.
2. Write a note offline: the card says "On this device" with the cloud; online it becomes the tick. Edit one: the sheet shows the
   state under the title and the date chip.
3. Keyboard: with the editor open on a small phone, the format strip and Save sit above the keyboard; the body scrolls; Dismiss
   keyboard works.
4. The coming-soon toast for the five strip controls appears above the editor's modal (the stop editor has the same question).
5. Text scale 1.5 and 2: the title takes two lines, the foot row wraps, nothing clips; the FAB label stops at 1.3.
6. TalkBack and VoiceOver: each day is one header; a card reads title, place, preview and offers Edit and Delete; the sync
   glyph has its name.
7. Dark and both contrast themes: amber ink on the cream tile, the tick, the trash.
8. Maestro `02-notes-and-expenses`: `notes-add`, `note-editor-*`, "Edit Cheese" and the filter chips still resolve (not run here).
