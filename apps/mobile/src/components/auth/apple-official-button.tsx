/**
 * `AppleOfficialButton` - Sign in with Apple, drawn by Apple (feature 005, F12; owner decision
 * 2026-10-22, `docs/roadmap/DECISIONS.md`: wherever the Apple logo is drawn the app uses Apple's
 * OFFICIAL artwork, never a hand-made or icon-font glyph; App Store Review Guideline 4.8).
 *
 * It is the native `AppleAuthenticationButton` of `expo-apple-authentication` (iOS
 * `ASAuthorizationAppleIDButton`, https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md),
 * which draws Apple's own logo and its title in the device's language. The app chooses only what
 * Apple lets it choose (https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple):
 *
 * - The TITLE, one of Apple's three: `SIGN_IN` ("Sign in with Apple"), `SIGN_UP` ("Sign up with
 *   Apple") or `CONTINUE` ("Continue with Apple"), by the screen's `intent`: Sign in says sign
 *   in, Create account says sign up, Welcome (where the same button does either) says continue.
 *   The title is Apple's, localised, in the system font: the app sets no font and no colour.
 * - The STYLE: `BLACK` on a light ground (light and increased-contrast light) and `WHITE` on a
 *   dark one (dark and increased-contrast dark), the HIG's rule for each; `WHITE_OUTLINE` is
 *   for a LIGHT ground that gives a white fill too little contrast and is to be avoided on a dark
 *   or saturated one, and neither case is the app's: black on the light grounds and white on the
 *   dark ones both clear 3:1 against the canvas and the sheet in all four themes
 *   (`apple-official-button.test.tsx` measures them), so no outline is drawn.
 * - The CORNER RADIUS: half the height, which is Apple's capsule, as the 52 dp pill beside it.
 * - The FRAME: as wide as the column and as tall as the Google pill (`pillMinHeight`: 52 dp, or
 *   the touch target grown by the text size), far above Apple's minimum of 140 by 30 pt, with the
 *   12 dp the buttons are apart well above the margin of a tenth of the height. `style` never
 *   sets `backgroundColor` or `borderRadius`: Expo says that is against the App Store Guidelines
 *   and does not work. The frame's height is a fixed `height` because the native view has no
 *   content to size it (the docs: without width and height it does not appear), and it holds no
 *   text of the app's: the system sizes its title to the frame, so nothing can clip
 *   (`test/scale/fixed-heights.allowlist.json`).
 *
 * Accessibility: the system button names itself for VoiceOver in the device's language, so the
 * app gives it no label of its own while it works (the testID `apple-sign-in` is the native
 * button's, as the Apple button's always was; the frame is `apple-sign-in-frame`). While it is
 * busy (this sign-in is in flight) or disabled (another is), the frame becomes ONE accessible
 * button under the English title, announced unavailable (and busy), and swallows touches, as
 * `Tappable` does; a disabled one is dimmed with the kit's disabled opacity, a busy one is not
 * (the work stays readable). The frame is always there and the native button never remounts, so
 * nothing flashes when the state changes.
 *
 * Where there is no native sheet (Android, or an iOS device that says it is unavailable) this
 * is not drawn at all: a disabled copy would need Apple's logo drawn by the app
 * (`apple-sign-in-button.tsx`).
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

import { useAppearance } from '@/hooks/use-appearance';
import type { PaletteName } from '@/theme';

import { pillMinHeight } from './pill-button';

/** Which of Apple's three titles the screen says. */
export type AppleIntent = 'sign-in' | 'sign-up' | 'continue';

/** What the system button reads, in English: the name while the button is inert. */
export const APPLE_TITLE: Record<AppleIntent, string> = {
  'sign-in': 'Sign in with Apple',
  'sign-up': 'Sign up with Apple',
  continue: 'Continue with Apple',
};

function buttonTypeOf(
  intent: AppleIntent,
): AppleAuthentication.AppleAuthenticationButtonType {
  const Type = AppleAuthentication.AppleAuthenticationButtonType;
  return { 'sign-in': Type.SIGN_IN, 'sign-up': Type.SIGN_UP, continue: Type.CONTINUE }[
    intent
  ];
}

/** White on a dark ground, black on a light one (HIG, "Displaying buttons"). */
export function appleButtonStyleFor(
  themeName: PaletteName,
): AppleAuthentication.AppleAuthenticationButtonStyle {
  const Style = AppleAuthentication.AppleAuthenticationButtonStyle;
  return themeName.startsWith('dark') ? Style.WHITE : Style.BLACK;
}

export type AppleOfficialButtonProps = {
  intent: AppleIntent;
  onPress: () => void;
  /** This Apple sign-in is in flight. */
  busy?: boolean;
  /** Something else on the screen is in flight. */
  disabled?: boolean;
};

export function AppleOfficialButton({
  intent,
  onPress,
  busy = false,
  disabled = false,
}: AppleOfficialButtonProps) {
  const { themeName, fontScale } = useAppearance();
  const button = { alignSelf: 'stretch', height: pillMinHeight(fontScale) } as const;
  const inert = busy || disabled;
  const dimmed = disabled && !busy;

  return (
    <View
      testID="apple-sign-in-frame"
      accessible={inert}
      accessibilityRole={inert ? 'button' : undefined}
      accessibilityLabel={inert ? APPLE_TITLE[intent] : undefined}
      accessibilityState={inert ? { busy, disabled: true } : undefined}
      pointerEvents={inert ? 'none' : 'auto'}
      className={dimmed ? 'opacity-disabled' : undefined}
      style={styles.frame}>
      <AppleAuthentication.AppleAuthenticationButton
        testID="apple-sign-in"
        buttonType={buttonTypeOf(intent)}
        buttonStyle={appleButtonStyleFor(themeName)}
        cornerRadius={button.height / 2}
        style={button}
        onPress={() => {
          if (!inert) onPress();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignSelf: 'stretch' },
});
