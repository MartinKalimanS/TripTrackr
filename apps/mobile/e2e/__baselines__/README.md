# Screenshot baselines (feature 005, T524; research D5-18)

This directory holds the reference images that `assertScreenshot` compares the dev gallery
against. **There are none yet, on purpose.** A baseline is an image recorded on a device and
approved by the owner; it is never generated, copied from a design tool or invented, because a
baseline that was not seen on a phone proves nothing about a phone.

## What is compared

`e2e/gallery.yaml` opens the gallery (`/gallery`, development builds only) and, for each of the
four themes at text scale 1 and 2, compares one screenshot, **cropped on the test identifier
`gallery`** so the status bar clock and battery are not in it:

| Baseline file                   | Theme            | Text scale |
| ------------------------------- | ---------------- | ---------- |
| `gallery-light-x1.png`          | `light`          | 1          |
| `gallery-dark-x1.png`           | `dark`           | 1          |
| `gallery-light-contrast-x1.png` | `light-contrast` | 1          |
| `gallery-dark-contrast-x1.png`  | `dark-contrast`  | 1          |
| `gallery-light-x2.png`          | `light`          | 2          |
| `gallery-dark-x2.png`           | `dark`           | 2          |
| `gallery-light-contrast-x2.png` | `light-contrast` | 2          |
| `gallery-dark-contrast-x2.png`  | `dark-contrast`  | 2          |

Maestro's default threshold is 95 percent (`THRESHOLD` changes it). Per-section crops are one
line each: `scrollUntilVisible` to `gallery-<section>`, then the helper with `CROP` set to it.

## Recording a baseline

One pinned device per platform (research D5-18: one Android emulator and one iOS simulator;
keep its model, OS version, density and locale fixed, and write them in the commit message).

1. Start Metro, open the development client on the project so the bundle is loaded.
2. For the scale 2 images, make the phone's text really large first. The gallery's `2x` switch is
   a LAYOUT scale (the adapters take their minimum heights and reflow from it); glyph size
   follows the system text size, so both must agree:
   - Android: `adb shell settings put system font_scale 2.0`
   - iOS Simulator: `xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`
3. `maestro test -e MODE=record e2e/gallery.yaml`. Each image is written to Maestro's output
   folder (`takeScreenshot/`); copy the eight PNGs here.
4. **Look at every one on the device and in the image.** Recording is not approving: the owner's
   review of the phone (tasks T547 and T570) is what makes a baseline a baseline.
5. Commit them. Record the second platform under its own folder (`ios/`, `android/`) and pass
   `-e BASELINES=../__baselines__/ios` when comparing.

## Comparing

`maestro test e2e/gallery.yaml`. A missing baseline fails the run (Maestro: the assertion fails
if the comparison image does not exist), which is how a missing one is noticed. A failing
comparison writes a diff image next to the run's artifacts.

## Open points that only a device settles

- Whether Maestro resolves `path` relative to the subflow (`e2e/gallery/assert-screenshot.yaml`,
  as written: `../__baselines__`) or to the top-level flow. If a first compare cannot find an
  image that is here, pass `-e BASELINES=__baselines__`.
- The numerals count up for 700 ms and the skeletons shimmer: `waitForAnimationToEnd` is asked for
  before each shot, and the shimmer may still cost a few percent; turn Reduce Motion on for the
  baselines if it does (the shimmer is then still).
- Maestro's `assertScreenshot` threshold had a parse bug for dynamic values
  (github.com/mobile-dev-inc/Maestro/issues/3337); `THRESHOLD` is passed as a plain number.
