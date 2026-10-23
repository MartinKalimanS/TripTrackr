# F12 Welcome, sign in, create account: as built

Branch `feat/f12-auth` (from `feat/ui-stack`). Tasks T554 and T555. Owner decision Q-11 for this feature: the Welcome screen
is drawn with THREE buttons as pictured. Pictures: `screens/core/welcome.png`, `welcome-dark.png`, `screens/more/auth.png`,
`auth-dark.png`, `auth-long.png`, `auth-scale1.5.png`, `register.png`, `register-dark.png`. CSS: `prototype/styles.css`
(`.wl-sheet`, `.btn-auth`, `.btn-apple`, `.btn-google`, `.btn-email`, `.legal`, `.wordmark`), `extra/screens.css`
(`.errsum`, `.rules`, `.legal`), `extra/src/frames/auth.html`, `register.html`, and `build.py` `welcome()` (the frame the
picture was rendered from; `src/frames/welcome.html` is an older two-button variant).

## Files

New: `components/auth/pill-button.tsx` (`PillButton`, looks `apple`, `google`, `cream`), `welcome-globe.tsx`,
`welcome-mark.tsx`, `legal-line.tsx`, `error-summary.tsx`, `password-rule.tsx`, `privacy-promise.tsx`,
`auth-switch-link.tsx`; `theme/brand-artwork.ts` (Google "G" paths, `GoogleButton`, `AppleButton`: the brands' own colours,
in the token layer so no component writes a literal); `constants/legal-urls.ts`; `features/auth/welcome-globe-data.ts`
(GENERATED) and `scripts/build-welcome-globe.mjs` (its generator).
Changed: `app/(auth)/welcome.tsx` (rewritten), `login.tsx`, `register.tsx`, `_layout.tsx`; `components/auth/provider-button.tsx`
(on `PillButton`), `social-sign-in.tsx` (`useSocialSignIn`; Apple not drawn on Android); `components/ui/brand-glyph.tsx`
(Google four-colour "G" as SVG, Apple glyph inked per the Apple button); `components/ui/field.tsx` (additive: `inputRef`,
`labelAccessory`).
Untouched on purpose: `features/auth/use-session.ts`, `auth-errors.ts`, `form-validation.ts`, `session-store.ts`, the
Apple and Google sign-in flows (`apple-sign-in-button.tsx`, `google-sign-in-button.tsx`), every `secureTextEntry`,
`textContentType`, `autoComplete`, `autoCapitalize`, `autoCorrect` on the credential fields.

## Fidelity audit (picture and CSS against the code before this change)

| Rule (picture / prototype)                                                                           | Before                                    | Now                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Welcome sky (`sky` scrim, warm light / navy dark)                                                    | canvas                                    | `Scrim kind="sky"` full bleed                                                                                                                                           |
| Globe: sea, highlight, graticule, cream land, coral countries, arcs over a casing, three dots        | none                                      | `WelcomeGlobe`: static composed globe (approved fallback), `GlobeColors` / `GlobeStyle` tokens, disc radius 0.654 x width, top 73 below the status bar                  |
| Globe turns, static under reduced motion                                                             | none                                      | NOT turning: a still frame for everyone (see deviations); no timer, no frame loop                                                                                       |
| "FIRST STAMP" stamp over the globe, circle, coral, -10 degrees, 104 dp, right 20, top 128            | none                                      | `Stamp` adapter, spec spread (`shape` circle, `ink` coral, rotation -10), "TT", today's date; hidden from assistive technology                                          |
| Wordmark row: 32 dp mark + "TripTrackr" at the left 20, 6 below the status bar                       | centred title                             | `WelcomeMark` (SVG, ink + `accentLine`) + `callout` text                                                                                                                |
| Sheet 28 dp, padding 24 20 34 (bottom = home-indicator inset, at least 24), lift2                    | none                                      | `welcome-sheet`: `Radii.sheet` top corners, padding 24 / 20 / `max(inset, 24)`, `liftStyle(…, 'lift2')`, `bg-surface`                                                   |
| Eyebrow "YOUR TRAVEL PASSPORT" (coral text)                                                          | none                                      | `Text variant="eyebrow" tone="accent"` ("Your travel passport", upper-cased by the role)                                                                                |
| Headline 40/44 with one serif accent word                                                            | muted tagline under "TripTrackr"          | the app's tagline "Plan it. Live it. Share what you want." as `display`, ONE nested `accent` span ("want"); text unchanged (the flows assert it)                        |
| Lede "Trips, photos and notes on one globe, even offline. Expenses stay only yours."                 | none                                      | the picture's words (no flow or test asserted the old lede: there was none)                                                                                             |
| Three 52 dp pills, 12 apart: Apple (black / white in dark), Google (own light / dark), email (cream) | two Buttons (primary, secondary)          | `PillButton` x3; Apple and Google are `useSocialSignIn` (the same handlers as the forms); "Continue with email" is `welcome-create-account` -> `/register`              |
| Apple absent on Android                                                                              | disabled "coming soon" Apple on the forms | not drawn on Android anywhere (Welcome and the forms), never asked about, never "coming soon" there                                                                     |
| Legal line 12/16 "By continuing you accept the Terms and Privacy Policy." with underlined links      | none                                      | `LegalLine` + `constants/legal-urls.ts`; links are `Linking.openURL`, a failure is a no-op                                                                              |
| Returning travellers: not pictured                                                                   | `welcome-sign-in` was a secondary Button  | a quiet text link "Already have an account? Sign in" keeping `welcome-sign-in`; NOT PICTURED, a necessary addition                                                      |
| Sign in: heading "Welcome _back_" with one accent word                                               | title in the native header only           | `title` role heading with one nested accent word; the native header title stays                                                                                         |
| Sign in: "Create account" link at the header's right; register: "Sign in"                            | none                                      | `AuthSwitchLink` as `headerRight`; replaces the screen so Back still lands on Welcome                                                                                   |
| Error summary "Fix 2 things to sign in" with an icon and a link per problem                          | per-field messages and one refusal alert  | `ErrorSummary` above the fields once the traveller has tried; assertive alert, count in words, icon, underlined link lines that focus the field (`inputRef`)            |
| "Forgot password?" in the password label row                                                         | none                                      | `coming-soon-forgot-password`: a text Button, hint "Not available yet", one toast "Password reset is coming soon" (Q-11); `Field.labelAccessory`                        |
| Register: password rules as a visible checklist                                                      | none                                      | ONE rule, "At least 12 characters" (`PasswordRule`: word + icon, name says met / not met yet); the contract has no other rule, so none is invented                      |
| Register: legal line + "Expenses and documents stay private to you." with a lock                     | none                                      | `LegalLine` ("By creating an account you agree to the …") + `PrivacyPromise` (aqua ink), before the action                                                              |
| Social buttons: Apple navy pill + Google outline, equal weight                                       | outline pair, mono glyphs, Google first   | Apple first, black / white brand pill, Google its own light / dark button with the four-colour G, same 52 dp size, shape and type                                       |
| Primary in the thumb zone                                                                            | `mt-auto` actions                         | unchanged (`mt-auto` actions, keyboard-aware scroller, return key submits)                                                                                              |
| Text 1.5 and 2, long strings                                                                         | scrolling `Screen`                        | Welcome scrolls; the hero grows but never shrinks; from scale 1.3 the stamp is not drawn and the hero shrinks to the wordmark row; pills grow and wrap; forms unchanged |
| Dark, contrast, Android                                                                              | tokens                                    | tokens (`GlobeColors`/`GlobeStyle`, palette) plus the two brands' own button colours by scheme; Android: no Apple, Google first                                         |

## Deviations (and why)

- **Static composed globe, not turning.** The approved fallback of the brief: a second live Mapbox map is forbidden
  (AGENTS.md: ONE `MapView`), and a map on the first screen would depend on `useMapboxReady()` and a token. The composition is
  Natural Earth 110m (public domain, from the prototype's `world.js`) projected once by `scripts/build-welcome-globe.mjs`
  (orthographic, lon 8, lat 15; about 50 KB of path text). Because nothing moves, "static under reduced motion" holds for
  everyone and there is nothing for `useIdleSpin` to gate. A turning globe would need a second live map or a per-step
  re-projection and is a follow-up for the owner to ask for. Lisbon, London, Reykjavik and New York are an illustration,
  not a traveller's trip.
- **The three buttons replace the two** (UI-SPEC 7's "two buttons: not built" and section 10's "Three-button Welcome" row are
  superseded by Q-11 for this feature). "Continue with email" is named by its visible words (WCAG 2.5.3), so the accessible
  name of `welcome-create-account` is now "Continue with email", not "Create account"; the ids are unchanged, the flows tap
  by id, and the "Create account" / "Sign in" assertions happen on the next screens.
- **"Already have an account? Sign in"** is not in the picture. Without it a returning traveller has no way to the sign-in form
  except through the Create account screen's header link. It is a text-variant button, not a pill, in the muted ink.
- **Social buttons stay UNDER the form** on Sign in and Create account (UI-SPEC 7 and the brief), not above it as pictured;
  the primary stays in the thumb zone. The divider keeps "or continue with" (it reads correctly under the form).
- **No show-password eye** (pictured). T447 pins `secureTextEntry` with no reveal toggle, and the brief keeps the credential
  props unchanged. No valid-email tick either (the field adapter has no trailing slot). The native header title ("Sign in" /
  "Create account") stays, beside the pictured heading.
- **Password rules:** the picture lists "8 characters, one number, not a common password". The contract is `min(12)` with no
  composition rule (`contracts/api/auth.ts`), so only "At least 12 characters" is listed. The primary is not disabled until the
  form is valid (the picture shows it disabled): a disabled button hides why, and a refusal is said in words.
- **The stamp's date is today's**, not 14 Oct 2026: a fixed future date would be made up. It is decoration, hidden from assistive
  technology.
- **Legal URLs are a placeholder host** (`https://triptrackr.app/terms`, `/privacy`) in `constants/legal-urls.ts`. No About /
  legal module exists on this branch. The owner publishes the documents (store-readiness rows B, roadmap S32); change the
  two strings and nothing else.
- **Apple logo** is the Ionicons glyph in white / black, not Apple's downloaded artwork; Google's "G" is its own artwork.
  Replacing the Apple glyph is the release checklist item "Branded sign-in buttons" and touches `brand-glyph.tsx` only.
  **Superseded (owner decision 2026-10-22):** Apple's own `AppleAuthenticationButton` now draws the Apple logo and title on Welcome,
  Sign in and Create account, and the glyph, the `apple` pill look and `AppleButton` are gone: see `f12-apple.md`.
- **`testid-unresolved-count.json` 98 / 76 -> 99 / 77**: `PillButton` forwards its `testID` and `accessibilityLabel` (an
  intended adapter; every id is a literal at its call site and in the tests). Regenerated with `--write-unresolved`.
- **Base repair:** `test/components/us2-components.test.tsx` lost its `glyphNamesIn` import in the f8/f9 merge into
  `feat/ui-stack` (tsc failed on the base); restored in its own commit.

## Security review (light, of this diff)

- Sign-in logic, `describeAuthError`, `use-session.ts`, the Apple / Google flows and the session store are not edited. Welcome
  reuses the same hooks through `useSocialSignIn`, which only moved the existing handlers into a hook.
- `secureTextEntry`, `textContentType`, `autoComplete`, `autoCapitalize`, `autoCorrect` unchanged on every credential field
  (pinned again in `auth-pictured.test.tsx` and still by `auth-security.test.tsx`); no reveal toggle; nothing a field holds
  is logged, put in a route, or echoed: the error summary repeats the validation sentences, which never contain the input.
- The only new external call is `Linking.openURL` on two constant `https` URLs; no user input reaches a URL; a failure is a
  silent no-op. No new dependency, no secret, no network from Welcome. Provider failures still show the mapped sentence
  (`Something went wrong. Please try again.`), never the raw error (tested on Welcome).
- Apple is neither drawn nor probed on Android (`isAvailableAsync` is not called there), so the Android build never asks a
  native module that does not exist.
- The brand colours are literals only in `theme/brand-artwork.ts` (the token layer the lint rule exempts); no screen or
  component writes one.

## Evidence of each small step

| Step                                                                                           | Tests                                                                                                 | Commit    |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| Base repair: `glyphNamesIn` import                                                             | `tsc --noEmit`                                                                                        | `bc592a3` |
| Provider buttons as 52 dp brand pills, Apple first, Apple absent on Android                    | `pill-button` (7, new), `brand-glyph` (5), `provider-button` (17), `social-sign-in`, auth real-render | `70d5036` |
| Legal line with real links + URL constants                                                     | `legal-line` (6, new)                                                                                 | `fb9da53` |
| Welcome: sky, static globe, stamp, wordmark, sheet, three buttons, link, legal                 | `welcome-pictured` (new), `welcome-globe-data` (new), testid parity, Maestro selectors                | `15e0ce7` |
| Sign in / Create account: heading, summary, forgot, rule, legal, privacy, switch link          | `auth-pictured` (15, new), `auth-form-parts` (12, new), `field` (+2), `auth-layout` (+3), auth suites | `00131bb` |
| Google's own button colours by scheme                                                          | `pill-button`, `provider-button`, `welcome-pictured`                                                  | `7cfe3fb` |
| The Welcome decoration yields from text scale 1.3                                              | `welcome-pictured` (+1)                                                                               | `9aa1ad7` |
| Type fixes found by tsc: the mark reads its colours through `useColors`, the lock is `aquaInk` | `tsc --noEmit`, `welcome-pictured`, `auth-pictured`                                                   | `149059d` |

Final gates on the final tree: `npx jest --ci --maxWorkers=2` all suites green (361 suites, 8840 passed, 3 skipped, run before the last
two small commits and run again after them: see the final report), `npx tsc --noEmit` clean, `npx eslint . --max-warnings=0` clean,
`prettier --check` on every touched file clean, `node scripts/testid-baseline.mjs --check` parity holds, `node scripts/build-theme-css.mjs
--check` up to date.

## DEVICE checks the owner must do (Jest renders no styles, no fonts and no real SVG paint)

1. **Welcome, light and dark, iOS and Android:** compare with `welcome.png` / `welcome-dark.png`: sky, globe size and position
   (disc top 73 dp below the status bar, radius 0.654 x width), coral countries and arcs, the stamp (does `TextPath` draw
   "FIRST STAMP" and the date on a device, as `Stamp` device check V5), the sheet's top corners and lift, the wordmark mark.
2. **Brand buttons:** Apple black / white and Google light / dark against Apple's HIG and Google's branding guidelines; swap the
   Apple glyph for Apple's artwork before release (store-readiness "Branded sign-in buttons"). **Done in code, see `f12-apple.md`
   (its DEVICE checks replace this one for Apple).**
3. **Sign in with Apple on a real iOS device and Google on both platforms, started from Welcome**, including a cancelled sheet
   and a refusal (error shown inline under the buttons).
4. **Text scale 1.3, 1.5 and 2 on Android** (`01-appearance`): Welcome scrolls; `assertVisible` on `welcome-sign-in` and
   `welcome-create-account` needs them on screen. If a flow run fails at the largest scale, add a `scrollUntilVisible` to the
   flow (not edited here) rather than removing the link. Run `01-account-and-trip`, `01-appearance`, `02` to `05`, `00-smoke`
   and `offline/00-a-setup-account` (tap by id, unchanged).
5. **Increased contrast:** the Apple / Google buttons are the brands' fixed colours; confirm the lines read on both grounds.
6. **Keyboard:** the forms are unchanged (keyboard-aware scroller, return key submits); confirm the summary, then the focused
   field, scrolls above the keyboard after tapping a summary link.
7. **TalkBack / VoiceOver:** the summary is announced once (assertive live region on Android, `announceForAccessibility` on iOS);
   the globe, mark and stamp are skipped; the legal links read as links; "Forgot password?" reads "Not available yet".
8. **Owner decisions left open:** the real Terms and Privacy URLs; whether a turning globe is wanted; whether the pictured
   "or with email" order (social above the form) should replace UI-SPEC 7's "under the form".
