/**
 * Sign in with Apple — tasks.md T064 (FR-002).
 *
 * Verified against https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md:
 *   - iOS only; render the native `AppleAuthenticationButton` only after
 *     `isAvailableAsync()` resolves true (the page: "You should only attempt
 *     to render this if isAvailableAsync() resolves to true").
 *   - `style` must carry height and width or the button does not appear; it
 *     must NOT set `backgroundColor` or `borderRadius` — `buttonStyle` and
 *     `cornerRadius` are the sanctioned knobs (App Store Guidelines).
 *   - `signInAsync` rejects with `ERR_REQUEST_CANCELED` when the traveller
 *     dismisses the sheet; that is not an error to show.
 *   - The name arrives only on the FIRST authorisation; it is forwarded so the
 *     server can use it when creating the account (contracts `AppleOAuthRequest`).
 *
 * The capability itself is `ios.usesAppleSignIn: true` + the config plugin in
 * app.config.ts.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { MinTouchTarget, Radius } from '@/constants/theme';
import type { AppleSignInInput } from '@/features/auth/use-session';
import { useAppearance } from '@/hooks/use-appearance';

export type AppleSignInButtonProps = {
  onCredential: (input: AppleSignInInput) => void;
  onError: (error: unknown) => void;
};

function isCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

/** Apple hands over name parts; the account wants one display name. */
export function displayNameFrom(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): string | undefined {
  if (!fullName) return undefined;
  const joined = [fullName.givenName, fullName.familyName]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim();
  return joined.length > 0 ? joined : undefined;
}

export function AppleSignInButton({ onCredential, onError }: AppleSignInButtonProps) {
  const { theme, fontScale } = useAppearance();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((result) => {
        if (active) setAvailable(result);
      })
      .catch(onError);
    return () => {
      active = false;
    };
    // `onError` is a stable parent callback; re-probing on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!available) return null;

  const signIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('Apple returned no identity token.');
      }
      onCredential({
        identityToken: credential.identityToken,
        displayName: displayNameFrom(credential.fullName),
      });
    } catch (error) {
      if (isCancellation(error)) return;
      onError(error);
    }
  };

  return (
    <AppleAuthentication.AppleAuthenticationButton
      testID="welcome-apple-sign-in"
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={
        theme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={Radius.md}
      style={[styles.button, { height: MinTouchTarget * fontScale }]}
      onPress={() => void signIn()}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: '100%' },
});
