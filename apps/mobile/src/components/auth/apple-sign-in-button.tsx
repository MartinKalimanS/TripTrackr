/**
 * Sign in with Apple — tasks.md T064 (FR-002).
 *
 * Verified against https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication.md:
 *   - iOS only; offer it only after `isAvailableAsync()` resolves true.
 *   - `signInAsync` rejects with `ERR_REQUEST_CANCELED` when the traveller
 *     dismisses the sheet; that is not an error to show.
 *   - The name arrives only on the FIRST authorisation; it is forwarded so the
 *     server can use it when creating the account (contracts `AppleOAuthRequest`).
 *
 * The capability itself is `ios.usesAppleSignIn: true` + the config plugin in
 * app.config.ts.
 *
 * The button is the app's round logo button (`ProviderButton`) rather than
 * the native `AppleAuthenticationButton`, which cannot be round or take the
 * app's palette. `signInAsync` starts the same sheet either way. Apple's
 * rules for custom buttons still apply before release
 * (docs/release/store-readiness.md).
 *
 * Where there is no native sheet — Android, or an iOS device that says it is
 * unavailable — the button shows disabled, as coming soon. While iOS is still
 * being asked, a spacer holds its place, so nothing flashes or jumps.
 */
import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { AppleSignInInput } from '@/features/auth/use-session';

import { ProviderButton, ProviderButtonSpacer } from './provider-button';

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

/**
 * Can this device offer Sign in with Apple? `null` while iOS is being asked;
 * elsewhere the answer is already no. A failed probe counts as no, and is
 * handed to `onError`.
 */
export function useAppleSignInAvailability(onError: (error: unknown) => void) {
  const [available, setAvailable] = useState<boolean | null>(
    Platform.OS === 'ios' ? null : false,
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((result) => {
        if (active) setAvailable(result);
      })
      .catch((error: unknown) => {
        if (active) setAvailable(false);
        onError(error);
      });
    return () => {
      active = false;
    };
    // `onError` is a stable parent callback; re-probing on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return available;
}

export type AppleSignInButtonProps = {
  /** From `useAppleSignInAvailability`. */
  available: boolean | null;
  onCredential: (input: AppleSignInInput) => void;
  onError: (error: unknown) => void;
  /** The Apple sign-in mutation is in flight. */
  busy?: boolean;
  /** Something else on the screen is in flight. */
  disabled?: boolean;
};

export function AppleSignInButton({
  available,
  onCredential,
  onError,
  busy,
  disabled,
}: AppleSignInButtonProps) {
  if (available === null) return <ProviderButtonSpacer />;
  if (!available) return <ProviderButton provider="apple" />;

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
    <ProviderButton
      provider="apple"
      busy={busy}
      disabled={disabled}
      onPress={() => void signIn()}
    />
  );
}
