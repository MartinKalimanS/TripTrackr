/**
 * Screen-capture protection for travel documents — tasks.md T119 (FR-034;
 * Acceptance Scenario 5.4; research D-05).
 *
 * `useScreenCaptureGuard` is called by every screen and component that shows
 * a document — the list, the viewer, the scanner's live preview, the image,
 * and the confirmation form. It is `usePreventScreenCapture` with a key of its
 * own per mounted instance: the library re-allows capture when the LAST key
 * is released, so two screens sharing one key would re-allow screenshots the
 * moment either closed, with a boarding pass still on screen
 * (https://docs.expo.dev/versions/v57.0.0/sdk/screen-capture.md, the `key`
 * argument). Android enforces it with FLAG_SECURE, which also blanks the
 * recents preview; iOS blocks screenshots (13+) and recordings (11+).
 *
 * `useAppSwitcherProtection` covers the leak D-05 found that the requirement
 * does not name: iOS snapshots the app for the app switcher, and prevention
 * does not cover that snapshot. `enableAppSwitcherProtectionAsync` blurs it
 * — at full strength, so a pass's name and barcode are not legible — for as
 * long as a traveller is signed in. iOS only: the API is iOS-only, and Android
 * gets the same from FLAG_SECURE. A refusal is reported, not thrown: it must
 * never take the signed-in shell down.
 */
import {
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  usePreventScreenCapture,
} from 'expo-screen-capture';
import { useEffect, useId } from 'react';
import { Platform } from 'react-native';

import { Sentry } from '@/lib/sentry';

/** 0.0 (none) to 1.0 (maximum), v57 reference; the default 0.5 can leave large text legible. */
const APP_SWITCHER_BLUR = 1;

/** Block screenshots and screen recording while the calling component is mounted. */
export function useScreenCaptureGuard(): void {
  usePreventScreenCapture(`document-${useId()}`);
}

function report(error: unknown): void {
  Sentry.captureException(error);
}

/** On iOS, blur the app-switcher snapshot while `signedIn` holds. */
export function useAppSwitcherProtection(signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn || Platform.OS !== 'ios') return undefined;
    enableAppSwitcherProtectionAsync(APP_SWITCHER_BLUR).catch(report);
    return () => {
      disableAppSwitcherProtectionAsync().catch(report);
    };
  }, [signedIn]);
}
