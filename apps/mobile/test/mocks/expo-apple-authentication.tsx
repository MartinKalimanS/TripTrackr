/**
 * The Jest stand-in for `expo-apple-authentication` (feature 005, F12; owner decision
 * 2026-10-22: Apple's own button wherever the Apple logo is drawn).
 *
 * `jest.setup.ts` installs it for every suite with
 * `jest.mock('expo-apple-authentication', () => require('./test/mocks/expo-apple-authentication'))`.
 * A suite that wants another availability answer spreads it:
 *
 *   jest.mock('expo-apple-authentication', () => ({
 *     ...require('../mocks/expo-apple-authentication'),
 *     isAvailableAsync: jest.fn(async () => false),
 *   }));
 *
 * The real module needs a native view manager (`ASAuthorizationAppleIDButton`) and a native
 * module (`signInAsync`), neither of which exists under Jest. What the stand-in keeps is the
 * contract of the real package (typings and sources in `node_modules`, pinned by
 * `test/mocks/expo-apple-authentication.test.tsx`):
 *
 * - the enum VALUES: `AppleAuthenticationButtonType` (`SIGN_IN` 0, `CONTINUE` 1, `SIGN_UP` 2),
 *   `AppleAuthenticationButtonStyle` (`WHITE` 0, `WHITE_OUTLINE` 1, `BLACK` 2) and
 *   `AppleAuthenticationScope` (`FULL_NAME` 0, `EMAIL` 1), so a suite that asks for a type or a
 *   style reads back what a device would be given;
 * - `AppleAuthenticationButton` takes `buttonType`, `buttonStyle`, `cornerRadius`, `style` and
 *   `onPress` (the real component renames it `onButtonPress` for the native view), and a
 *   caller's other `View` props (`testID`) reach the host node;
 * - `isAvailableAsync` answers `true` (iOS 13 and later) and `signInAsync` is a bare
 *   `jest.fn()`: a suite says what the sheet returns.
 *
 * What it does NOT do: draw Apple's logo, colours or corners, or localise anything. The system
 * button draws its own title (localised) and logo inside the frame it is given and VoiceOver reads
 * the title; the stand-in has no pixels, so it carries that title as the node's
 * `accessibilityLabel` (English, as an English device reads it) and renders no `Text`. How the
 * button looks at text scales 1.5 and 2, in the dark and in increased contrast, is a device
 * check (`reference/as-built/f12-apple.md`).
 */
import { createElement, type ComponentType } from 'react';
import { Pressable } from 'react-native';

export const AppleAuthenticationScope = { FULL_NAME: 0, EMAIL: 1 } as const;
export const AppleAuthenticationButtonType = {
  SIGN_IN: 0,
  CONTINUE: 1,
  SIGN_UP: 2,
} as const;
export const AppleAuthenticationButtonStyle = {
  WHITE: 0,
  WHITE_OUTLINE: 1,
  BLACK: 2,
} as const;

/** What VoiceOver reads for each button type on a device set to English. */
const SYSTEM_TITLE: Record<number, string> = {
  [AppleAuthenticationButtonType.SIGN_IN]: 'Sign in with Apple',
  [AppleAuthenticationButtonType.CONTINUE]: 'Continue with Apple',
  [AppleAuthenticationButtonType.SIGN_UP]: 'Sign up with Apple',
};

type StandInProps = Record<string, unknown> & { buttonType?: number };
const Host = Pressable as unknown as ComponentType<StandInProps>;

export function AppleAuthenticationButton({ buttonType = 0, ...props }: StandInProps) {
  return createElement(Host, {
    ...props,
    buttonType,
    accessibilityRole: 'button',
    accessibilityLabel: SYSTEM_TITLE[buttonType],
  });
}

export const isAvailableAsync = jest.fn(async () => true);
export const signInAsync = jest.fn();
