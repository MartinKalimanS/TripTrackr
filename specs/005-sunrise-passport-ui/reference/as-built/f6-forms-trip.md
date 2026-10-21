# F6 Forms, objective 1 (the form sheet look, New trip, Add expense): as built

Branch `feat/f6-forms-trip` (from `feat/f6-forms`). Pictures: `screens/core/form.png`, `form-dark`,
`form-keyboard`, `form-keyboard-dark` (New trip) and `screens/more/add-expense.png`,
`add-expense-dark`, `add-expense-long`, `add-expense-scale1.5` (amount first). CSS: `prototype/styles.css`
(`.fsheet`, `.fbar`, `.fbody`, `.sheet`, `.grab`, `.field`, `.input`, `.chip`, `.btn`),
`extra/extra.css` (`.sheet-head`, `.sheet-foot`, `.lab`, `.btn-text`), `extra/screens.css` (`.xnum`,
`.aamt`, `.aeq`, `.disc`, `.kbpad`), `extra/src/frames/add-expense.html`. The stop editor, the city
picker, the date pieces, the route preview and the nights stepper are the other objective.

## Audit (picture and CSS against the code before this change)

| Rule                                                                                                 | Before                                                       | Now                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Header: Cancel (ink, left), title centred (`callout`), trailing chip right, 56 dp                    | title `title` 28/32 in the scrolling body; Cancel in footer  | `FormSheet` header (`<id>-header`): `FormCancel`, centred `callout` heading, `headerTrailing`; outside the body  |
| "Only you" chip in the Add expense header, dropped at big text                                       | MISSING                                                      | `PrivacyChip` as `headerTrailing`; from text scale 1.5 the chip is dropped (`data-bigtext`)                      |
| Content padded 20; body top 8; 24 dp between New trip groups, 16 between Add expense's               | 24 side padding (`Atlas`), 16 gap, title in the flow         | `Space[5]`; `gap` prop (24 on New trip); body top 8                                                              |
| Sticky primary: Save alone, full width, 56 dp, hairline above on New trip                            | Cancel + Save in one wrapping row, 48 dp                     | `FormActions` draws Save only (`size="lg"`, `self-stretch`); `footerRule` on New trip; bottom padding unchanged  |
| Handle 36 x 5 `grab` (iOS page sheet), 32 x 4 on Android                                             | 32 x 4 `border` on both                                      | `FormModal` iOS handle 36 x 5 `bg-grab`; Android router-sheet handle 32 x 4 `bg-grab`                            |
| Sheet 28 dp top radius, fits to contents                                                             | platform sheet, `fitToContents`                              | unchanged (`formSheetOptions`); radius and grabber are the platform's: DEVICE check                              |
| New trip: name field                                                                                 | right                                                        | unchanged (`add-trip-title`)                                                                                     |
| New trip: "Where to?" + "Cities or countries" + search row                                           | MISSING                                                      | coming-soon row `coming-soon-trip-destination` (one toast)                                                       |
| New trip: "Cover" with three photographs and the dashed "Photos" tile                                | MISSING                                                      | dashed 76 dp "Photos" tile only, `coming-soon-trip-cover`; the pictured photographs are not drawn (no data)      |
| New trip: "Dates" capsule "12 Oct ... 7 nights ... 19 Oct 2026"                                      | MISSING                                                      | capsule "Add dates" with a chevron, `coming-soon-trip-dates`; no date, no night count                            |
| New trip: currency row, selected EUR, dashed "+" chip                                                | chips right, "Other" solid, no glyph                         | "Other" is the dashed chip with a plus (`ChipOption.leading`, `dashed`); label stays "Home currency"             |
| New trip: lock + "Expenses are only visible to you."                                                 | MISSING                                                      | `add-trip-privacy`: lock (`aquaInk`) + `caption` muted under the chips                                           |
| Add expense: amount first, display ~56, tabular, symbol 28 muted, centred, caret `focus`, decimal pad | a labelled `Field` below the title                           | `AmountInput` (`ui/amount-input.tsx`): 56/60 Bricolage 700, -.03em, tabular, 1.3 cap, `add-expense-amount`      |
| Add expense: "≈ $26.62 at today's rate"                                                              | MISSING                                                      | `add-expense-rate`, only when the cached snapshot quotes both currencies (`ratePreview`, decimal.js); else none  |
| Category chips with glyphs (check when selected), one row                                            | no glyphs, "callout" label                                   | `categoryIconName` glyph per chip; `label` 600 heading; dashed "New" chip opens the new-category field           |
| Currency chips, label "Currency"                                                                     | labelled "Home currency" on an expense (wrong word)          | `CurrencyPicker label="Currency"` on Add expense; New trip keeps "Home currency"                                 |
| Note, date, place collapsed in one row "Add note, date or place" + summary "Today, 14 Oct . Lisbon"  | day, city and note always open                               | `ExpenseExtras` disclosure (`add-expense-more`), opens by itself on a refusal; summary from the form's values    |
| Keyboard: Save above the keypad, `keyboardShouldPersistTaps="handled"`                                | right                                                        | unchanged and re-tested for each form (`expectActionAboveKeyboard`)                                              |
| Dark, contrast, scales 1.5 and 2, Android                                                            | semantic classes only                                        | no colour literal added; header drops the chip at 1.5; Save and rows grow (minimums only); Android handle 32 x 4 |

## Changes

- `ui/form-sheet.tsx`: header (Cancel, centred title, `headerTrailing`), `gap`, `footerRule`, 20 dp
  gutters, Android handle on `grab`. `ui/form-actions.tsx`: `FormCancel` (header) and `FormActions`
  (Save only; still accepts `onCancel` so one `actions` object serves the sheet). `ui/form-modal.tsx`:
  iOS handle 36 x 5 `grab`. Every `FormSheet` user (the note editor, the stop editor, the document
  confirm form) gets the header.
- `ui/amount-input.tsx` (new), `ui/chip.tsx` (additive: `ChipOption.leading`, `.dashed`).
- `trip/pictured-rows.tsx` (new: destination, cover, dates coming-soon rows), `trip/expense-extras.tsx`
  (new: the collapsed row), `trip/currency-picker.tsx` (`label`, dashed Other), `trip/category-picker.tsx`
  (glyphs, "New" chip).
- `features/expenses/amount-preview.ts` (new: `currencySymbol`, `ratePreview`, `extrasSummary`),
  `use-expenses.ts` (additive: `useFxSnapshot`).
- `app/modal/add-trip.tsx`, `app/modal/add-expense.tsx`.
- New ids (additive): `<sheet>-header`, `coming-soon-trip-destination`, `coming-soon-trip-cover`,
  `coming-soon-trip-dates`, `trip-destination`, `trip-cover`, `trip-dates`, `add-trip-privacy`,
  `add-expense-more`, `add-expense-more-summary`, `add-expense-extras`, `add-expense-rate`,
  `add-expense-amount-row`, `category-new-toggle`. Every existing id and accessible name is kept.

## Deviations (and why)

- **Reading order changed**: Cancel moves from the footer to the header (the picture); the tests that
  pinned "title, fields, Cancel, Save" now pin "Cancel, title, fields, Save". The stop editor and the
  note editor tests were adapted the same way (one-line moves from `-footer` to `-header`).
- **Words**: the app's words win: the title stays "New expense", the category is "Lodging" (picture
  "Stay"), the row is "Home currency" on a trip (picture "Currency"), "Planning/Active" untouched.
  Add expense's currency row now says "Currency" because "Home currency" was wrong for an expense.
- **Add expense: city, day and note moved behind the collapsed row** (picture). They are all still
  there: a flow that taps `add-expense-note` or `add-expense-date` must open the row first (the
  Maestro flows `01` and `02` do not touch them: `02` taps `add-expense-amount`, types `5.50`, taps the
  text "Transport", `currency-EUR` and `add-expense-save`, all visible without the row).
- **Category "New"**: the new-category field is behind a dashed "New" chip (the picture shows no
  field); creating a category closes the field.
- **Rate line**: shown only with a cached snapshot, only for a currency other than the trip's home
  one, and says "at today's rate" only when the snapshot is of today (else its date). `Intl` writes
  "US$" for USD in some locales; the figure is formatted by `formatMoney`, not by `Number`.
- **Pictured cover photographs and dates are not drawn** (invented data). The cover is the dashed
  "Photos" tile alone; the dates row says "Add dates".
- **Amount symbol** is the `title` role (28/32, 700); the prototype's is 600. Same size.
- **Sheet height on the smallest phone**: with the pictured rows New trip no longer fits 360 x 640;
  its body scrolls with the header and Save pinned (the old desk budget test now pins 390 x 844 fits
  and 360 x 640 scrolls).

## DEVICE checks (the owner)

1. iOS: the sheet radius (28), the native grabber over the header (the header starts 8 dp below the
   top), the header centring at 390 dp and with "Only you", Cancel's tap area.
2. iOS and Android: New trip fits 844 dp with the keyboard down and, with it up, the name field and Save
   stay visible; the Maestro flows `01` to `05` still tap `currency-EUR` without scrolling (the chips sit
   below the three pictured rows: on a short phone `tapOn` may need a scroll).
3. The coming-soon toast appears INSIDE the form sheet (iOS draws it in a full-window overlay; Android
   draws it in the root and may sit behind a form sheet).
4. Add expense: the decimal pad's separator, the 56 dp figure at text scale 1.3 and 2 (capped at 1.3,
   one line), the caret colour, Save above the keypad on iOS and Android.
5. Dark and contrast: the dashed chips and the cover tile edge (`border`), the footer hairline.
6. The "Add note, date or place" row: expanding scrolls the day, city and note into view above the keypad.
