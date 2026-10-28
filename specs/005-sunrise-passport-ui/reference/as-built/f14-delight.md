# F14 Delight (count-up policy, stamp landing, pulse, haptics): as built

Branch `feat/f14-delight` (from `feat/ui-stack`). Task T558. Spec FR-060, FR-061, FR-062 (and FR-073 for reduced motion); research D5-11 (count-up),
D5-14 (haptics, stamp landing); `UI-SPEC.md` "Motion" (line 115: press scale, sheet and capsule springs, count-up once per appearance, the live pin
pulse, stamp landing once per session; under reduced motion all of these are removed). No picture belongs to this task: it is behaviour. Visibility
posture: nothing here reads, stores or sends traveller data; the session set of landed stamps is memory only (D5-17).

## Audit (what existed on `feat/ui-stack` before this change)

| Delight rule                                                                       | Where it lived                                                                                                                              | Verdict before                                                                                                                    | Now                                                                                                                                   |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Count-up on the Home figures (countries, trips, distance), 80 ms stagger           | `home/stats-row.tsx` over `ui/animated-number.tsx` + `ui/count-up.ts` (T535)                                                                | Counted on mount, **and again on every new value** (a data refresh replayed it)                                                   | Trigger policy: once per appearance (see below); `stats-row.test` pins the refresh                                                    |
| Count-up on the passport card (four figures)                                       | `profile/passport-card.tsx` over the same engine (F13)                                                                                      | Same: a period switch re-counted                                                                                                  | Same policy; `passport-card.test` pins the period switch                                                                              |
| Accessible name is the FINAL value from the first render                           | `AnimatedNumber` (label = final text; keeper hidden; no live region), tile labels                                                           | Done and tested for a mount                                                                                                       | Also pinned for a refresh, late data and every frame (`count-up-policy.test`)                                                         |
| Nothing counts under reduced motion                                                | `AnimatedNumber` `Still`, `useCountUp({ enabled })`                                                                                         | Done                                                                                                                              | Also: a figure that appeared without motion does not count when motion comes back                                                     |
| Stamp landing component (scale 1.6 to 1, turn, 200 ms, heavy haptic when it lands) | `ui/stamp-in.tsx` (T523)                                                                                                                    | Done; reduced motion and `play=false` simply appear; timer cleared on unmount                                                     | Unchanged apart from `delayMs`                                                                                                        |
| Landing on the You stamps page, once per session, last 7 days                      | `profile/stamps-page.tsx` + `stamp-landing.ts` (F13, "the stamp parts of T558")                                                             | Done (`recent && !hasLanded`, in-memory set). **Several stamps landed at once: one buzz for three thuds**                         | Queue: `landingSlots`, newest first, `LANDING_STAGGER_MS` (120 ms) apart; extends F13, nothing duplicated                             |
| Live pin pulse                                                                     | `globe/active-callout.tsx` `Pulse` (Reanimated CSS animation, 2.4 s, scale 1 to 1.7)                                                        | Done: paused off screen and with the app away, a faint still ring under reduced motion (`active-callout.test`, `globe-view.test`) | Unchanged                                                                                                                             |
| Live dot (Now card, status chip, callout card)                                     | `home/now-card.tsx` `LiveDot`, callout card dot                                                                                             | Static: the prototype pulses only the pin (`.rpulse`); FR-060 says "the live pin MUST pulse"                                      | Unchanged, by design (not a gap)                                                                                                      |
| Semantic haptics, 80 ms debounce, silent under reduced motion                      | `hooks/use-haptics.ts` (`tap select sheetSnap tabChange success warning error stamp`)                                                       | Done                                                                                                                              | Unchanged                                                                                                                             |
| Haptic on a sheet detent                                                           | `ui/sheet-motion.ts` `finish`                                                                                                               | Played on **every** settle, also a drag that sprang back to the detent it began on                                                | Only when the detent changes (traveller, parent or tap)                                                                               |
| Haptic on a tab change                                                             | `navigation/tab-pill.tsx` via `tabPressHandlers`                                                                                            | Done: only a press that changes the tab; none on the focused tab or a vetoed press (`tab-pill-fidelity.test`)                     | Also run through the real hook (`delight-gate.test`)                                                                                  |
| Haptic on chip / segment / year selection                                          | `ui/chip.tsx` `ChipGroup`, `ui/segmented-pill.tsx`, `trip/year-scrubber.tsx`                                                                | Done: only when the selected key changes                                                                                          | Also run through the real hook (`delight-gate.test`)                                                                                  |
| One reduced-motion gate                                                            | `useAppearance().prefersLessMotion` (`appearance-store`): the count-up, `StampIn`, the pulse, the sheet spring and `useHaptics` all read it | One gate in practice, never asserted that nothing goes round it                                                                   | `delight-gate.test`: only `hooks/use-haptics.ts` imports `expo-haptics`; chip, segment, tab and stamp are silent under reduced motion |

## The count-up trigger policy

`useCountUp` (`ui/count-up.ts`) is now a three-phase machine per appearance (a mount of the figure): `fresh` (nothing to count yet, target 0),
`counting`, `spent`.

- **Appearance**: the figure counts from 0 to its value once, in `Motion.countUpMs` (700 ms), staggered by the caller (80 ms per figure).
- **Refresh**: a new value after the count is drawn **at once**, with no timer. A data refresh, a period switch or a re-render is not a new appearance.
- **In flight**: a new value while it counts is counted on to from the figure drawn (one count, replaced, never stacked or restarted from 0).
- **Late data**: a figure that appeared as 0 (the store has not answered) counts when its first real value arrives; that is its one count.
- **Reduced motion**: the final text on the first render, no timer; the appearance is then spent, so motion coming back does not start a count;
  asking for reduced motion mid-count settles on the final value in that render.
- **Name**: `AnimatedNumber`'s label is the final formatted value from the first render in every phase; the visible frame is never the name.

The phase changes are made while rendering (derived state), so no frame shows the final figure before a count that is about to start.

## Changes

| File                                  | Change                                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ui/count-up.ts`           | `useCountUp` trigger policy (phases)                                                                                                     |
| `components/ui/animated-number.tsx`   | header comment only                                                                                                                      |
| `components/ui/stamp-in.tsx`          | `delayMs` (keyframe `.delay` and the thud follow it); nothing changes at 0                                                               |
| `components/profile/stamp-landing.ts` | `LANDING_STAGGER_MS`, `landingSlots` (a pure read of the session set)                                                                    |
| `components/profile/stamps-page.tsx`  | each cell keeps the slot it had when first drawn; `play` and `delayMs` come from it                                                      |
| `components/ui/sheet-motion.ts`       | the settle haptic only when the detent changed (`restedRef`)                                                                             |
| Tests (new)                           | `ui/count-up-policy.test.tsx` (14, fake timers), `profile/__tests__/stamp-landing.test.ts` (8), `test/ui-kit/delight-gate.test.tsx` (14) |
| Tests (extended)                      | `count-up` (the refresh test changed, see below), `animated-number`, `stats-row`, `passport-card`, `stamp-in`, `stamps-page`, `sheet`    |

No new dependency, no token, no testID, no accessible name changed (parity holds).

## Deviations and decisions

1. **"Appearance" is the figure's mount.** The Home figures live in the half detent's body, which mounts each time the sheet reaches half, so they
   count each time the sheet is brought up to half. The You tab stays mounted, so returning to it does not replay the passport (a tab's focus is
   not an appearance of a figure). If the owner wants a replay on every focus of You, it is `useIsFocused` + a `key` on the card.
2. **Two existing expectations changed, because FR-060 says "once per appearance"**: `count-up.test` "a new target after it has finished counts from
   the old one" is now "is drawn at once", and `animated-number.test` "counts on from where it was when the value changes" is split into the
   in-flight case (kept) and the after-the-count case (at once).
3. **Stagger 120 ms is a local constant** (`LANDING_STAGGER_MS`), not a `Motion` token: it is not a number of the spec, and `MotionDurationNames`
   (every duration zero under reduced motion) is a contract. Under reduced motion the queue is irrelevant: nothing animates.
4. **The landing is decided at mount, not at scroll-into-view.** The You `Screen` is a scroller that gives its children no offset, so a stamp
   below the first screenful lands (and thuds) as the page mounts. Newest stamps are first in the page, so on most phones they are on screen; on a
   small phone they may not be. Not built: it would need scroll-offset plumbing in `Screen`, which other work is changing.
5. **Under reduced motion a recent stamp still counts as landed** for the session (it appeared), so switching Reduce Motion off later in the same
   session does not make it fall.
6. **Fake timers**: the new policy suite uses Jest's fake clock (`jest.useFakeTimers`, `act(async)` + `advanceTimersByTime`), which works in a file of
   its own; the older count-up suites keep the captured-interval helper, which they were written with.
7. **Android haptic constants** (stamp is `Long_Press`, there is no heavy constant) are V6's to tune on a phone, unchanged.

## Device checks for the owner

1. Home: pull the sheet to half: the three figures count one after another in under a second; pull to peek and back to half: they count again; with
   a trip added or synced while the sheet is at half they change without a replay. VoiceOver / TalkBack reads "14 of 195 countries" once, never
   "3, 17, 42".
2. You: open the tab: the four passport figures count once; switch the period: the figures change at once; leave the tab and return: no replay.
3. A country first arrived in the last 7 days (and a second and third): the stamps come down newest first about 120 ms apart, each with its own firm
   thud, once per launch; the second visit and a period switch do not play them; kill and reopen the app: they fall again.
4. The live pin pulses slowly on Home (iOS, Android), pauses with the app in the background.
5. Haptics, iOS and Android: the sheet gives one tick per change of detent and none when a drag springs back; one tick per tab change and none on the
   current tab; one per chip, segment or year change and none on the selected one; nothing during a scroll.
6. Reduce Motion (iOS) / Remove animations (Android): no count, no pulse (a faint still ring), no stamp animation, no haptic anywhere above.

## Evidence of each small step

| Step                                                                                                           | Tests                                                                                        | Commit      |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------- |
| Count-up trigger policy (test first: 4 of 14 policy tests failed on the old engine because a refresh replayed) | `count-up-policy` 14, `count-up`, `animated-number`, `stats-row`, `passport-card`; tsc clean | `2077710`   |
| Stamps queue: `landingSlots`, `StampIn delayMs`, page slots (test first: module and prop missing)              | `stamp-landing` 8, `stamp-in` 4 new, `stamps-page` 3 new (19); tsc clean                     | `4d08786`   |
| Sheet haptic only on a change of detent (test first: 2 of 4 new sheet tests failed, the settle always buzzed)  | `sheet.test` 57 (4 new), `sheet-shell`, `home-sheet`, `countries-list-sheet`                 | `6b4ed3b`   |
| One reduced-motion gate for chip, segment, tab and stamp, no direct `expo-haptics` import                      | `delight-gate` 14                                                                            | `8dbde08`   |
| This note                                                                                                      | none (documentation)                                                                         | see git log |

Gates on the final tree (`apps/mobile`): `npx jest --ci --maxWorkers=2` 379 suites, 9,115 passed, 3 skipped (9,118) after 3 new suites over the
376 / 9,066 of the F13 merge; `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx prettier --check` on the touched files,
`node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json` ("Parity holds: 205 testIDs and 64 accessibility labels") and
`node scripts/build-theme-css.mjs --check` ("theme.css is up to date") are green.
