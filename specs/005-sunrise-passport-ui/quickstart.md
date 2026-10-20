# Quickstart: Validating the Sunrise Passport UI

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is a validation guide, not an implementation guide. It says how to prove, phase by phase, that the feature
works. Every command here already exists in the repository (see `AGENTS.md`); nothing below is run by the
documentation-only change that created this feature.

## 0. Prerequisites

- Node and npm as for the rest of the repository; Android SDK and Xcode (or EAS) for dev-client builds. The app
  cannot run in Expo Go.
- Always `npm ci` at the **repository root** (single lockfile). Never `npm install` inside a workspace. The one
  exception is T502, which runs `npm install` at the root to add the pinned packages.
- A real iPhone (ideally one on iOS 26 and one earlier) and a real Android phone (a mid-range one for the frame
  rates), and a second device for the offline gate (section 10).
- Windows note: filter Jest by a path **regex fragment**, not a slash path
  (`npx jest -- globe-fit`, per `AGENTS.md`).

## 1. Dependencies and the one rebuild (T502, T506)

1. Branch from the 004 tip (T500); confirm `npm run lint && npm run typecheck && npm run test:cov -w apps/mobile`
   are green there and tag `pre-005-baseline`.
2. Write the failing tests of T502, then one root install with the exact pins of research D5-19. Before it, for
   each package: `npm view <pkg>@<version> time --json` and confirm the publish date is at least seven days old.
3. `npm audit`; review install scripts; `npm run doctor -w apps/mobile`; `npm ci --dry-run` at the root.
4. Rebuild both dev clients **once** (`npm run android -w apps/mobile`, `npm run ios -w apps/mobile`, or
   `run-on-phone.cmd` on Windows). Nothing native is added after the first-slice review (SC-017).
5. `npx expo export --platform android` and `--platform ios` (T506): bundles build, the Sentry Debug ID is present.

## 2. Gates that run on every phase

From the repository root:

```bash
npm run lint && npm run typecheck
npm run test:cov -w apps/mobile       # 80% floor enforced by jest.config.js
npm run test -w packages/contracts
npm run format:check
npm run theme:check -w apps/mobile    # theme.css is a pure function of the palette; exit 0 when clean
```

Expect all green. The extended contrast gate (`test/theme/contrast-gate.test.ts`, `globe-contrast-gate.test.ts`),
the testID parity test and the globe-style key allow-list run inside `test:cov`. A failing pair names the token,
the theme and the pair class (P1 to P23); a missing identifier names the file. `test/theme/atlas-values.test.ts`
is **red by design from T517 until T564**; every other suite must be green.

## 3. Desk checks per area

| Area            | Command                                    | Expect                                                              |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Globe fit       | `npx jest -- globe-fit` (in `apps/mobile`) | free space at least 220 dp and 20 dp margins at peek, 640 to 932 dp |
| Stamps          | `npx jest -- stamp-spec`                   | 200 or more pairs, identical twice, rotation in range               |
| Trip list model | `npx jest -- trip-sections`                | hero, ticket, year rows, filters, no-stop group                     |
| Passport totals | `npx jest -- passport-totals`              | period membership, continents excluding Unknown                     |
| Spending        | `npx jest -- spending-summary`             | exact sums, pending counted and excluded                            |
| Sheet           | `npx jest -- sheet`                        | nearest detent, adjustable handle, back stepping, one settle        |
| Map keys        | `npx jest -- basemap-config-keys`          | only allow-listed keys                                              |
| Forms           | `npx jest -- keyboard`                     | Save above the keyboard in every form, valid and invalid            |

## 4. Device spikes (phase 1; each writes its result into `research.md`)

Run on throwaway branches `spike/005-<name>`; carry only findings and config worth keeping.

1. **V1 fonts (T507)**: open the gallery's type specimen. Check six faces load; `1111` and `0000` line up in the
   numeral role on iOS; compare "Portugal Road Trip" at 40 / 700 with the prototype's `home.png` (width within 3
   percent) and adjust the tracking constants; set the OS font size to its largest and check every role scales.
2. **V2 globe style (T508)**: with day and night presets, check the atmosphere, the sky showing through (or not),
   visited fills and keylines, gradient arcs, the pins on both sides of the globe, and the `view-shot` roundel
   capture. Decide roundels or dots.
3. **V3 sheet (T509)**: drag the throwaway sheet over the live globe with a long list inside; read the frame rate
   (Android Studio profiler or the performance monitor) on a mid Android phone; test the Android back gesture;
   check the planet is inside the free band at the smallest and largest phone heights.
4. **V4 glass and the pill (T510)**: iOS 26: glass renders and survives a hide with `translateY`; earlier iOS:
   blur; turn on Reduce Transparency and Increase Contrast: solid; Android: the bar's insets with gesture and
   three-button navigation.
5. **V5 stamps and zoom (T511)**: the mask on both platforms; a 120-stamp list; the zoom toolkit's gestures.
6. **V6 motion and images (T512)**: `Link.AppleZoom` latency; WEBP encode on iOS; flags at 20 by 14; haptics.

## 5. First slice on a phone (T547, SC-013)

Build a dev client against the API over the network (LAN address, or `10.0.2.2` on an emulator), never through
`adb reverse` (see `apps/mobile/e2e/offline/README.md`). On **one iOS and one Android** device, in **light and
dark**:

| Scenario                                                              | Expected                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Home with trips, sheet at half                                        | Warm sky, tinted countries, pins with photos, one pin ringed and called out, three figures counting up once, the live trip     |
| Drag the sheet to peek, back to half, then to full                    | Whole planet visible at peek with 20 dp margins and the camera following; the Countries list at full; the button hides at full |
| Choose a country in the list                                          | The sheet drops to half and the globe flies to the country                                                                     |
| Leave the globe alone for 8 seconds; touch it                         | It turns slowly; it stops at the first touch; nothing turns under reduced motion                                               |
| Home with no trips, loading, offline with changes waiting, sync error | Invitation with empty frames; skeleton; amber banner and chip; crimson chip with Retry                                         |
| Trips with an active, a planned and past trips, some without photos   | Hero card with "Active · Day N of M"; ticket with the countdown; rows by year; generated covers; filter works                  |
| Trips with 200 or more trips                                          | Smooth scroll, year headers stay, the year strip jumps                                                                         |
| Open a trip; scroll; Back                                             | Title on the picture; collapses to a solid header; day chips pinned; stops as a spine with distances; "Back" returns           |
| Trip with no stops; with a very long title                            | Ghost stamp and "Add stop"; the title grows upward, never behind the sheet                                                     |
| Largest text size, then increased contrast, then reduced motion       | Every first-slice screen complete, nothing clipped, boundaries explicit, nothing turns, nothing translucent                    |
| Toggle system dark mode with the app open                             | Sky, globe lighting, sheet, pill, headers and status bar switch together                                                       |

The owner approves, or lists changes, before Phases 7 and 8 start.

## 6. End-to-end flows (Maestro)

```bash
npm run e2e -w apps/mobile            # runs apps/mobile/e2e/ (needs a booted device with the dev client)
```

Run after Phases 4, 5, 6, 7 and 8 for the flows named in `contracts/screens.md`, and fully in T566. Expect every
flow to pass. A flow may be edited only where visible text legitimately changed; each edit is listed in
`tasks.md`, "Maestro flow edits". `assertScreenshot` baselines live in `apps/mobile/e2e/__baselines__/`; record
them on one pinned emulator and one simulator, cropped on a test identifier; a changed baseline needs a reason in
the commit.

## 7. Appearance matrix (T561, T562)

For each of: light, dark, increased contrast (light and dark), largest text size (iOS accessibility sizes,
Android 200 percent), reduced motion, reduced transparency (iOS), visit every route and confirm: complete,
operable, nothing clipped, nothing left in the previous theme, nothing translucent, no rotation, pulse, count-up
or stamp landing, no haptic. Record any exception as a bug, never as an accepted gap.

## 8. Accessibility spot-checks (T560)

- VoiceOver (iOS) and TalkBack (Android): Home announces the figures once, with final values; the sheet handle
  offers more and less; the Countries list is reachable without dragging and each row reads "Portugal, 3 trips,
  first visited 2021"; the globe offers next trip, previous trip, recentre and open countries; a trip card reads
  "title, status, N stops"; stop rows offer move up, move down, edit and remove; stamps read "Stamp: Portugal, 12
  October 2026"; Back and the header title are announced once.
- Switch access or a keyboard: every control reachable, visible focus ring at 3:1.

## 9. Performance and size (T500, T563)

Before screens move, record on the oldest supported test device: scroll frame rate for 200 trips, 1,000 expense
rows and a 1,000-photo grid; release JS bundle size; font asset size. After Phase 9, repeat and also record the
Home sheet drag with the globe rendering: no sustained drop below 45 frames per second and no regression against
the baselines (SC-006); report the size delta (over 1 MB is reviewed, SC-011).

## 10. Offline-synchronisation gate (release, SC-010)

Re-run the 15 phases in `apps/mobile/e2e/offline/README.md` on two real devices and record the result in
`apps/mobile/e2e/offline/gate-evidence.md`. Nothing counts as passing until that record exists.

## 11. Retirement check (T564, SC-001)

```bash
npx jest -- atlas-values no-neumorphism
grep -rniE "neumorph|surfaceStyle|PressableSurface|elevationProfile|treatment=" apps/mobile/src
# expected: the tests pass and grep prints nothing
```

The Atlas palette literals listed in `test/theme/atlas-values.ts` occur nowhere in `apps/mobile/src`; the
`pre-005-baseline` tag and git history keep them.

## 12. Dev gallery (T524)

With a development build, open `/(dev)/gallery` (a `__DEV__` route guarded by `Stack.Protected`). It renders every
adapter in four themes at font scale 1 and 2, the numerals row, skeletons, the sheet detents, the stamps and the
scrims over a white photograph; the Maestro screenshot flow captures it. Use it before and after any change to a
shared component.
