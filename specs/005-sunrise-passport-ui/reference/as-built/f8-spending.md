# F8 Spending: as built

Branch `feat/f8-spending` (from `feat/f7-photos`). Task T550 (FR-047, FR-054; research D5-15; owner answer Q-11).
Pictures: `screens/more/expenses.png`, `expenses-dark.png`, `expenses-long.png`, `expenses-scale1.5.png`. CSS:
`prototype/extra/screens.css` (`.xhero`, `.xnum`, `.xmeta`, `.bars`, `.bcol`, `.catbar`, `.legend`, `.dgh`, `.xrow`, `.xic`),
`extra/extra.css` (`.nav`, `.pill`, `.fab`), `extra/src/frames/expenses.html`. The shared chrome of F7 (`AreaHeader`, `AreaFab`) is
reused unchanged (nothing added to either).

Files. New: `features/expenses/spending-summary.ts` (`deriveSpendingView`), `components/trip/spending-hero.tsx` (`SpendingHero`),
`day-bars.tsx` (`DayBars`), `category-bar.tsx` (`CategoryBar`), `category-look.ts`, `expense-day-group.tsx`, `spending-skeleton.tsx`.
Rewritten: `app/trip/[id]/expenses.tsx`, `components/trip/expenses-header.tsx`, `expense-row.tsx`, `spending-summary.tsx`. Additive:
`lib/locale.ts` (`formatMoneyTight`, `formatMoneyParts`, `formatWholeUnits`), `test/helpers/host-nodes.ts` (`containing` treats a no-break
space as a space). Small shared edit: `app/trip/[id]/_layout.tsx` (`expenses` has `headerShown: false`, like `photos`). The Add expense sheet
is untouched (the FAB opens it as before).

## Fidelity audit (picture and CSS against the code before this change)

| Rule (picture / prototype)                                                                  | Before                                           | Now                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Header: tonal Back disc, title, "Only you" chip, more disc                                  | native header "Spending", no chip, no more       | `AreaHeader` (native header hidden): "Spending", subtitle "Trip · N expenses", `PrivacyChip`, `coming-soon-expenses-more` (tonal)             |
| "Spent so far" + 56/60 numeral, currency sign raised                                        | `Total in CHF` caption + 32 dp figure in a card  | `SpendingHero`: label, numeral 56/60 (capped 1.3, shrinks before clipping), sign in `title` muted, zero fraction dropped ("842")              |
| Pill "€281 / day · Day 3 of 8" (calendar, cream, hairline)                                  | MISSING                                          | pill from `deriveSpendingView.average` (exact total / days gone, half up, 2 dp); absent when it cannot be computed                            |
| Rate line with an info icon                                                                 | a "Rates applied" section with rows              | `summary-rates`: info icon, `1 EUR = x CHF` per rate, the app's sentence and "Rates by <source>, as of <date>."; only with a foreign currency |
| PER DAY bars: cream + outline, today navy, future dotted, day and amount under              | a "By day" list                                  | `DayBars`: 96 dp plot, 32 dp columns (wider with the text size), today solid ink, dotted future, labels capped at 1.3, scrolls sideways       |
| "--- Budget €300" and the dashed line                                                       | MISSING                                          | "Budget" drawn as a coming-soon control WITHOUT an amount and without the line (Q-11)                                                         |
| Segmented category bar and legend with amounts                                              | a "By category" list                             | `CategoryBar`: 12 dp pill, 2 dp gaps, min 6 dp, rounded ends; legend swatch + name + bold total, one element each                             |
| Rows grouped by day: heading + day total, icon on a tint, title, "Category · place", amount | one grouped surface per day, Delete on every row | `ExpenseDayGroup` + `ExpenseRow`: hairline, "Wed 14 Oct · Today" and total; 40 dp tinted disc; note as title; place from the stop             |
| Row amounts: home figure over the foreign amount                                            | paid amount over the home amount                 | as pictured (home on top, paid muted under); pending: paid over "Awaiting a rate"                                                             |
| FAB "Add expense"                                                                           | a primary button at the top of the list          | `AreaFab` (`expenses-add`), in every state                                                                                                    |
| Skeleton mirrors content                                                                    | four row bones                                   | `SpendingSkeleton`: hero, bars, category bar and rows from the real dimensions; one `progressbar` "Loading expenses"                          |
| Empty "Nothing logged yet"                                                                  | summary of zero + empty state                    | the empty state alone (secondary "Add expense", words unchanged); a total of nothing is not drawn                                             |
| Error                                                                                       | words and icon                                   | unchanged ("Couldn’t read the expenses"; the error wins over loading)                                                                         |
| Pending conversions                                                                         | "Awaiting a rate" section                        | alert with an icon on the amber tint: amount and count per currency, "Not yet in the CHF total ..."; in no total, bar or average              |
| Dark, contrast, scales 1.5 and 2, Android                                                   | tokens                                           | palette keys only (`useColors`), the margin 16 on Android (`areaMargin`), the square FAB, labels capped at 1.3                                |

## Money (SC-016)

`deriveSpendingView` reads the wire summary (`summariseExpenses`: `decimal.js` sums of converted rows) and the trip dates. Pending rows
are counted and in no total, bar, slice or average. The average is `total / days` in `decimal.js`, half up to 2 dp. The whole-unit labels under
the bars are `Decimal.toDecimalPlaces(0, ROUND_HALF_UP)` on the string. The only `number`s are ratios (a bar's height, a slice's
percentage); a test fails if the module contains `Number(`, `parseFloat`, `parseInt` or `Math.round`. Tests cover 0.10 + 0.20, the column
maximum + 0.01, refunds, EUR/CHF, USD/JPY, JPY/EUR and GBP/GBP.

## Deviations (and why)

- **Title and header form.** The picture's centred "Expenses" in the bar is the prototype's; the app's word is "Spending" and the area
  header puts the title under the bar with a subtitle (UI-SPEC 9.2).
- **"Stay" and "Other" colours.** The app's categories are Food, Lodging, Transport, Activities, Shopping and Other (plus the traveller's
  own): the legend uses those names. Shopping takes the muted ink and a custom category the subtle ink (not pictured; the legend names them).
- **Rate line.** "Converted at today's rate · as of 14 Oct, 09:00" would be untrue (each expense keeps the rate it was recorded at, FR-021), so the
  line carries the existing disclosure (FR-026) in the app's words, with the info icon. It is absent when no foreign currency is in play.
- **Average.** Shown with two decimals ("280.67 / day"), not rounded to whole units as the picture does, so a small trip is not rounded
  to nothing. "Day N of M" is drawn only while the trip (from its stops) is on; "N days" once it is over or with no dates (days from the first to the last
  expense); nothing before it starts or without converted spending. "Spent in total" replaces "Spent so far" for a trip that is over.
- **Whole amounts drop ".00" in the hero, legend, day totals and pill** (as pictured); rows show the full amount (the offline-gate flows read
  `20.00`). The hero's accessible name carries every digit (`summary-total` is read as "Spent so far, CHF 1,100.00": flow 10-b matches it).
- **The summary toggle** (`expenses-toggle-summary`, "Hide summary" / "Show summary") is not pictured; it is the control the app had. It sits at the end of
  the "Spent so far" row and folds all but that row.
- **Delete** is not pictured. A tap on a row shows it under the row (`expense-remove-<id>`, same name); the row also keeps the accessibility
  action "Delete expense". The row is now a button (hint "Shows the delete button", expanded state).
- **Row amounts and the pending marker.** The pending sync marker ("Not yet synced", icon) stays beside "Category · place" where a row is only on this device.
- **Bars with no budget.** The plot is scaled to the tallest day, not to a budget; no budget amount or line anywhere. A day with nothing or a
  refund has a 4 dp stub and its amount ("0", "-4").
- **A long trip** (more than 120 days) draws only the days with spending; fewer days that do not fit scroll sideways and open on today.

## Tests

`features/expenses/__tests__/spending-summary.test.ts` (27: view, days, average, pending, exactness, tones, source guard),
`test/lib/locale-money-tight.test.ts`, `test/components/spending-pictured.test.tsx` (43: hero, summary, bars, category bar, row, day group,
header, skeleton), `test/app/us2-screens.test.tsx` (the `ExpensesScreen` block rewritten), updated: `us2-components.test.tsx` (the summary and row
blocks moved to the new suite), `notes-spending-real-render.test.tsx`, `trip-layout.test.tsx` (`expenses` hidden header; the notes
suite keeps the native-header rules), `testid-parity.allowlist.json` (`expenses-title` is back, now the `AreaHeader` title id),
`testid-unresolved-count.json` regenerated (accessibility labels 70 to 73: `describeChart`, `describeShares` and the pill's sentence are computed names).

## Device checks for the owner

1. iPhone and Android: header as in `expenses.png` (Back, chip, more), hero numeral with the sign raised, pill, bars with today in navy, category
   bar and legend; the FAB over the last row.
2. Maestro `02-notes-and-expenses` and `10-b-large-snapshot-resume`: `summary-total` text `1.?100.00` is matched through the accessible name on iOS and
   Android; `20.00` in rows; Delete is reached by a tap on the row first (no flow does it).
3. Text size 1.5 and 2: pill wraps, legend wraps over lines, bar columns widen and the chart scrolls; the numeral stops at 1.3.
4. Dark and both contrast themes: the Shopping and custom colours (muted, subtle inks) against the canvas as bar segments (not gated yet).
5. TalkBack and VoiceOver: the chart and the category bar are one image each with a sentence; each day heading names the day and its total.
