# F12 Apple: Sign in with Apple drawn by Apple, as built

Branch `feat/f12-apple` (from `feat/ui-stack`). Follows `f12-auth.md` (T554, T555), which drew the Apple logo as an Ionicons stand-in
and listed replacing it as a release item. **Owner decision 2026-10-22** (`docs/roadmap/DECISIONS.md`): wherever the Apple logo is
drawn the app uses Apple's OFFICIAL artwork, never a hand-made or icon-font glyph. The compliant way in Expo is the native
`AppleAuthenticationButton` of `expo-apple-authentication` (iOS `ASAuthorizationAppleIDButton`): Apple draws the logo and the title.

## Verified facts (read before coding; sources fetched 2026-10-22)

From the Expo SDK 57 reference, https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md (package `expo-apple-authentication`
57.0.2, installed), and Apple's HIG, https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple (read as
`.md`, the page itself needs JavaScript):

| Fact                                                                                                                                                                                                                                                                                                                                                                     | Source |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `AppleAuthenticationButton` is the native `ASAuthorizationAppleIDButton`: "automatically Apple-approved, localized, and accessible". iOS and tvOS only; there is no Android view.                                                                                                                                                                                        | Expo   |
| Button TYPES: `SIGN_IN` = 0 "Sign in with Apple", `CONTINUE` = 1 "Continue with Apple", `SIGN_UP` = 2 "Sign up with Apple" (`SIGN_UP`: iOS 13.2+; the app targets 15.1).                                                                                                                                                                                                 | Expo   |
| Button STYLES: `WHITE` = 0 (white, black text), `WHITE_OUTLINE` = 1 (white, black outline, black text), `BLACK` = 2 (black, white text).                                                                                                                                                                                                                                 | Expo   |
| `cornerRadius` is a number "similar to `style.borderRadius`". `style` is `Omit<ViewStyle, 'backgroundColor' \| 'borderRadius'>`: setting either "will not work and is against the App Store Guidelines".                                                                                                                                                                 | Expo   |
| "Make sure to attach height and width via the style props, since without them the button will not appear." (A fixed `height` is therefore needed; see the fixed-heights entry below.)                                                                                                                                                                                    | Expo   |
| Render it only if `isAvailableAsync()` is true; "this component will render nothing if it is not available" and warns in development. It has no `disabled` prop.                                                                                                                                                                                                         | Expo   |
| Localisation needs `CFBundleAllowMixedLocalizations = true`; the `expo-apple-authentication` config plugin (already in `app.config.ts`) sets it (`plugin/src/withAppleAuthIOS.ts`).                                                                                                                                                                                      | Expo   |
| System buttons give: an Apple-approved look, ideal proportions, "automatic translation of the button's title into the language specified by the device", a configurable corner radius, "a system-provided alternative text label that lets VoiceOver describe the button".                                                                                               | HIG    |
| Titles are Apple's three: choose "the variant that fits the terminology of your sign-in experience and use it consistently throughout your interfaces".                                                                                                                                                                                                                  | HIG    |
| White: "dark backgrounds that provide sufficient contrast". Black: "white or light-color backgrounds that provide sufficient contrast; don't use it on black or dark backgrounds". White with outline: white or light backgrounds that do not give the white fill enough contrast; **avoid it on a dark or saturated background** (the outline adds clutter; use white). | HIG    |
| Corner radius: default rounded; square to capsule ("maximum corner radius ... capsule-like") is allowed "to match the appearance of other buttons in your app".                                                                                                                                                                                                          | HIG    |
| Minimum size: **140 pt wide, 30 pt high, margin of 1/10 of the button's height** around it (iOS, macOS, web). "Make a Sign in with Apple button no smaller than other sign-in buttons."                                                                                                                                                                                  | HIG    |
| Custom buttons only may change the title font, weight, size and case; the logo and title stay black or white and "don't use custom colors". A system button has none of these: its title is Apple's, in the system font, and the app sets no font and no colour.                                                                                                         | HIG    |

## What changed

New: `components/auth/apple-official-button.tsx` (`AppleOfficialButton`, `appleButtonStyleFor`, `APPLE_TITLE`, `AppleIntent`);
`pillMinHeight(fontScale)` in `pill-button.tsx` (the one height rule of the three way-in buttons);
`test/mocks/expo-apple-authentication.tsx` (+ its contract test; installed by `jest.setup.ts`);
`test/no-handmade-apple-logo.test.ts` (source scan: no glyph, no icon font, one place draws the button, no Apple asset).

Changed: `apple-sign-in-button.tsx` draws `AppleOfficialButton` instead of the pill (the `signInAsync` flow, cancellation, the
first-name handling and `useAppleSignInAvailability` are as they were; a new `intent` prop and "unavailable draws nothing");
`social-sign-in.tsx` (`useSocialSignIn(disabled, appleIntent)`, a `status` line, `SocialSignIn appleIntent`, `ProviderStatus`);
`welcome.tsx` (draws `status`), `login.tsx` (`appleIntent="sign-in"`), `register.tsx` (`appleIntent="sign-up"`).
The handlers (`apple.mutate`, `google.mutate`, `describeAuthError`) are unchanged.

Removed (grep proof in the "Dead code" section): the Ionicons `logo-apple` glyph, the `PillButton` `apple` look and its ring
feedback, `AppleButton` (`theme/brand-artwork.ts`), the Apple branch of `ProviderButton` and `BrandGlyph`, the Ionicons font load
in `app/_layout.tsx`, and the Ionicons stand-ins of ten suites.

## Decisions

- **Type per screen.** Welcome says `CONTINUE` (it does either, and its neighbours say "Continue with"); Sign in says `SIGN_IN`;
  Create account says `SIGN_UP`. The owner asked for `SIGN_IN` and `SIGN_UP` on the two form screens. The HIG asks to use one
  variant "consistently throughout your interfaces": see Open items.
- **Style per theme.** `BLACK` in `light` and `light-contrast`, `WHITE` in `dark` and `dark-contrast`; `WHITE_OUTLINE` is not used.
  Why: the HIG offers the outline only for a LIGHT ground that gives a white fill too little contrast, and tells us to avoid it on a
  dark one. The app never needs it: on the light grounds it uses the black fill (21:1 on the `#FFFFFF` canvas and sheet, also in
  increased contrast, where the grounds are the same white), and on the dark grounds the white fill (18.2:1 on the `#0A1626` canvas,
  16.4:1 on the `#0F2037` sheet, also in increased contrast). The test measures both grounds in all four themes against the
  non-text floor (3:1, FR-024). This is also what the pictures draw (`welcome.png` black, `welcome-dark.png` white, no outline).
- **Corner radius** = height / 2, Apple's capsule, as the 52 dp pill beside it.
- **Size.** `height` = `pillMinHeight(fontScale)` = max(52, touch target x font scale): the Google pill's own minimum, so Apple is as
  tall at text scales 1, 1.15, 1.5 and 2, and `alignSelf: 'stretch'` makes it as wide (Guideline 4.8, same prominence; the HIG's
  "no smaller than other sign-in buttons"). Far above Apple's 140 x 30 pt minimum; the 12 dp gap is at least a tenth of the height up
  to scale 2 (8.8 dp). `style` carries only `alignSelf` and `height`: never a background or radius.
- **Unavailable device draws nothing** (and Android never draws it, as before). The old disabled "coming soon" copy would need the
  app to draw Apple's logo, which the decision forbids; the native button cannot be shown disabled; Expo says to render it only
  when `isAvailableAsync()` is true. On iOS the module's `isAvailableAsync` returns `true` unconditionally
  (`ios/AppleAuthenticationModule.swift`) and the app targets iOS 15.1 (`app.config.ts`), so "unavailable" is only a missing native
  module or a probe that throws (then the failure is shown in words, as before): a state a traveller should never see. The `soon` sentence is unchanged, so "Apple sign-in is coming soon." still tells a
  traveller on such a device why there is no Apple button. While the probe runs, the spacer still holds the place (nothing jumps).
- **Busy and disabled** keep the `Tappable` contract on a frame (`apple-sign-in-frame`) that is always mounted around the native
  button (so it never remounts): inert (`pointerEvents="none"` and the press is ignored), ONE accessible button under the English
  title announced unavailable (and busy); a disabled one is dimmed with the kit's `opacity-disabled`, a busy one is not. Apple's title
  cannot become "Signing in...", so a polite live line "Signing in with Apple..." (`status`) says it in words (FR-025).
- **Accessible name.** Apple's system button names itself for VoiceOver in the device language (HIG), so the app sets no label on it
  while it works. Welcome's name is unchanged ("Continue with Apple"); Sign in's is now "Sign in with Apple" and Create account's
  "Sign up with Apple" (the old pill said "Continue with Apple" everywhere).
- **testIDs.** `apple-sign-in` is kept, now on the native button (the id parity check holds: 205 ids and 64 labels, unresolved count
  unchanged). Removed: `apple-sign-in-unavailable` (no disabled copy), `brand-glyph` inside the Apple pill. Added:
  `apple-sign-in-frame`. **Maestro:** no flow in `e2e/*.yaml` taps Apple (grep: no match for "apple" in `e2e/`); the sheet is system UI
  that a flow cannot drive. If one is added: `tapOn: { id: 'apple-sign-in' }` (React `testID` becomes `accessibilityIdentifier` on the
  native view's container; to be confirmed on a device, check 4), or by text on Welcome only ("Continue with Apple", Apple's own
  label), never by "Continue with Apple" on the form screens.
- **Fixed height, listed.** The native view has no content to size it, so `height` cannot be a `minHeight`: one entry in
  `test/scale/fixed-heights.allowlist.json` (count 1) with the reason; `reflow-screens.test.tsx` asserts the frame equals the pill
  minimum at all four scales and holds no text of the app's.

## Deviations from the picture (not defects)

- The title and logo are Apple's: the **system font** (SF), not DM Sans, at about 43% of the height (about 22 pt in a 52 pt button; the
  picture's label is 17 dp), the logo Apple's artwork at Apple's proportions and padding, the content centred as the system does.
- Apple's button is not a `Tappable`: no focus ring, no pressed fill from the kit (the system draws its own highlight).
- On Sign in and Create account the title reads "Sign in with Apple" / "Sign up with Apple"; Google beside it still reads "Continue
  with Google" (the picture has "Continue with" on both).
- An unavailable iOS device shows no Apple button (the picture has no such state; the old disabled copy is gone).

## Tests (test-first: the new suites failed on the missing module before the code)

- `apple-official-button.test.tsx` (new, 29 tests): type per intent, title read by the system, style per theme and 3:1 contrast on
  canvas and sheet, never `WHITE_OUTLINE`, theme change live, height = pill minimum and capsule radius at scales 1 / 1.15 / 1.5 / 2,
  stretch, 12 dp gap vs a tenth of the height, no background / radius in `style`, busy / disabled frame state and inert press, no
  remount, `testID`.
- `test/mocks/expo-apple-authentication.test.tsx` (new, 4): the stand-in's enum values equal the package's own.
- `test/no-handmade-apple-logo.test.ts` (new, 4): the source scan.
- Updated: `social-sign-in` (Apple's button and Google's pill, titles by intent, unavailable and probe-failure draw nothing, busy and
  disabled frame, status line), `welcome-pictured` (CONTINUE, four themes, equal height and width at four scales, unavailable,
  Android), `auth-screens` (SIGN_IN, SIGN_UP), `auth-screens-real-render`, `reflow-screens`, `provider-button` and `pill-button`
  (Google only), `brand-glyph` (Google only), `root-layout` (no icon font), appearance `allow-list` (no Apple colours).
- Shared stand-in: `jest.setup.ts` installs `test/mocks/expo-apple-authentication.tsx` (enums with the real values,
  `AppleAuthenticationButton` as a pressable host that carries `buttonType`, `buttonStyle`, `cornerRadius`, `style`, the system title
  as its `accessibilityLabel`, `isAvailableAsync` true, `signInAsync` a bare `jest.fn()`); five suites that need "unavailable" spread it.

## Dead code (grep proof, run on the final tree)

`grep -rnE "logo-apple|Ionicons|\bAppleButton\b|look=\"apple\"|vector-icons" src test app.config.ts jest.setup.ts scripts e2e` finds only
the two guards that assert absence (`test/no-handmade-apple-logo.test.ts` and one line of `test/app/root-layout.test.tsx`).
`grep -rn "apple-sign-in-unavailable" src test e2e` finds only `queryByTestId(...).toBeNull()` assertions. **`@expo/vector-icons` is
no longer imported by the app** (it stays in `apps/mobile/package.json`, which this branch does not edit): the owner may remove it
with `npm uninstall @expo/vector-icons -w apps/mobile` at the root after checking that nothing else needs it.

## DEVICE checks the owner must do (Jest has no pixels, no Apple logo and no VoiceOver: none of these is claimed)

1. **Welcome, light and dark, iOS:** the native button against `welcome.png` / `welcome-dark.png`: black / white, 52 dp, capsule, the
   same width as Google, the logo and title Apple's (system font, larger than the picture's 17 dp label), no outline.
2. **Text scale 1.5 and 2 (and 1.15):** the frame grows with `pillMinHeight` (66 dp, 88 dp); the title and logo scale with it and the title
   still fits ("Continue with Apple" in about 350 dp at 88 dp high may be shrunk or truncated by the system: confirm it is not clipped
   badly). At scale 2 Google's label may wrap to two lines and be taller than Apple's frame: confirm the pair still reads as equal.
3. **Increased contrast (both) and Android:** black on white and white on navy read; Android shows Google and email only, no Apple.
4. **Maestro / testID:** on a device build, `tapOn: { id: 'apple-sign-in' }` (iOS) finds the native button, and `assertVisible` works.
5. **Device language:** set the device to another language (for example German or Portuguese); Apple's title is translated on all three
   screens (needs `CFBundleAllowMixedLocalizations`, which the config plugin writes; check the built `Info.plist`).
6. **VoiceOver:** the button is read in the device language as a button; while a sign-in is in flight VoiceOver reads the English
   title as unavailable and busy, and "Signing in with Apple..." is announced once; Google stays reachable.
7. **Sign in with Apple end to end** on a real device from Welcome, Sign in and Create account: the sheet, a cancelled sheet (says
   nothing), a refusal (said inline), and a first sign-in with a name.
8. **Busy look:** the busy button is not dimmed (the work stays readable) and the disabled one (another sign-in under way, or the
   form submitting) is; confirm both read.

## Open items and risks

- **One title, consistently?** The HIG says to use one variant "consistently throughout your interfaces". Three variants by screen
  follow each screen's own words and the owner's request, but App Review could ask for one. Changing it is one prop per screen
  (`appleIntent`).
- **Stale references elsewhere** (not edited here: shared docs, other branches): `specs/005-sunrise-passport-ui/contracts/components.md`
  line 42 ("Brand glyphs (Google, Apple) stay in `brand-glyph.tsx`"), `specs/004-app-ui-redesign/{research,tasks}.md` (Ionicons for the
  brand glyphs), `docs/roadmap/STEP-BY-STEP.md` line 129 ("Apple artwork black or white"), and `f12-auth.md` (which now points here).
- Google's "G" was not part of this change; its guidelines check stays on the store-readiness row.

## Evidence of each small step

| Step                                                                                                                       | Tests                                                                                                                                                                     | Commit             |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| One shared `expo-apple-authentication` stand-in with the button, enums held to the package                                 | `expo-apple-authentication` (4, new); the 13 auth suites it touches unchanged in behaviour (14 suites, 279 tests)                                                         | `8929487`          |
| Failing tests first, then `AppleOfficialButton`, `pillMinHeight`, the wiring, the status line, the fixed-height entry      | `apple-official-button` (new), `social-sign-in`, `welcome-pictured`, `auth-screens`, real-render, `reflow-screens`, `fixed-heights`; 99 suites, 1997 tests; testid parity | `770fd67`          |
| Remove the glyph, the `apple` pill look, `AppleButton`, the Apple branch of `BrandGlyph`, the Ionicons font load and mocks | `no-handmade-apple-logo` (new), `pill-button`, `provider-button`, `brand-glyph`, `root-layout`, appearance gates; 127 suites, 3471 tests                                  | `d2f855e`          |
| Store-readiness row, this note, the pointer in `f12-auth.md`                                                               | prettier                                                                                                                                                                  | this commit (docs) |

Final gates on the final tree (`apps/mobile`): `npx jest --ci --maxWorkers=2` 422 suites, 9779 passed, 3 skipped, 0 failed;
`npx tsc --noEmit` clean; `npx eslint . --max-warnings=0` clean; `prettier --check` clean on every touched file;
`node scripts/testid-baseline.mjs --check test/fixtures/testid-baseline.json` parity holds (205 ids, 64 labels; the unresolved count
file was NOT regenerated, nothing moved); `node scripts/build-theme-css.mjs --check` up to date; `test/scale/fixed-heights.test.ts`
green with the one new allow-list entry.
