# Mobile assets

Every file in `images/` is a **placeholder inherited from the create-expo-app template**. It
exists so that `npx expo prebuild` and the development-client build succeed; none of it is
TripTrackr brand art. Expo's own artwork (`react-logo*`, `expo-logo`, `expo-badge*`, `logo-glow`,
`tutorial-web`, `tabIcons/`, and the `expo.icon` Icon Composer bundle) was deleted with the
template (tasks.md R008, research D-14).

## Files that MUST be replaced before store submission

| File                                 | Referenced from                          | Required                                                                                                                                                                                                                                                                                                       | Current placeholder                                    |
| ------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `images/icon.png`                    | `icon` and `ios.icon` in `app.config.ts` | **1024×1024 PNG, no alpha channel.** App Store Connect rejects an app icon with transparency. Square corners — iOS masks the shape itself.                                                                                                                                                                     | 1024×1024 **RGBA** — has alpha, will be rejected as-is |
| `images/android-icon-foreground.png` | `android.adaptiveIcon.foregroundImage`   | **1024×1024 PNG with transparency.** The launcher masks the outer ring; keep the artwork inside the central 66% (≈ 676×676 px) safe zone.                                                                                                                                                                      | 512×512                                                |
| `images/android-icon-background.png` | `android.adaptiveIcon.backgroundImage`   | Same dimensions as the foreground (1024×1024), opaque. Must match `adaptiveIcon.backgroundColor` if the artwork does not fill the canvas.                                                                                                                                                                      | 512×512                                                |
| `images/android-icon-monochrome.png` | `android.adaptiveIcon.monochromeImage`   | **1024×1024 PNG**, single colour on transparent, same safe zone as the foreground. Used for Android 13+ themed icons.                                                                                                                                                                                          | 432×432                                                |
| `images/splash-icon.png`             | `expo-splash-screen` plugin `image`      | Logo on a transparent background; rendered at `imageWidth` (currently 76 dp) so supply at least 3× that (≥ 228 px wide) — the current file is at the minimum. The plugin's `backgroundColor` (`#208AEF`) MUST stay equal to `SplashBackground` in `src/constants/theme.ts`, or the launch flashes two colours. | 228×213                                                |
| `images/favicon.png`                 | nothing (web target removed, D-14)       | Kept only so an accidental `--platform web` export does not fail on a missing file. Safe to delete once the toolchain no longer references it.                                                                                                                                                                 | 48×48                                                  |

Dimension requirements are taken from the v57 app config reference
(<https://docs.expo.dev/versions/v57.0.0/config/app.md> — `icon`, `ios.icon`, `android.adaptiveIcon`)
and the splash screen guide (<https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen.md>).

## Icon Composer bundle (optional, later)

`ios.icon` accepts a path to an Icon Composer `.icon` directory (pattern `\.icon$` in the v57
schema) for the iOS 26 layered/liquid-glass icon. The template's `assets/expo.icon` was Expo's own
artwork and was deleted. When TripTrackr has a designed icon, export it from Icon Composer as
`assets/triptrackr.icon` and point `ios.icon` at that directory instead of `images/icon.png`; the
flat PNG remains the Android and fallback icon.

## Check before submitting

```sh
# From apps/mobile — prints the resolved paths so a typo fails here, not on EAS.
npx expo config --type introspect | grep -i "icon\|splash"
```
