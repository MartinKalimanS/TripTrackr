/**
 * Continue with Google — tasks.md T064 (FR-002).
 *
 * Uses `expo-auth-session/providers/google` `useIdTokenAuthRequest`
 * (https://docs.expo.dev/versions/v57.0.0/sdk/auth-session.md,
 * `GoogleAuthRequestConfig`: `iosClientId` / `androidClientId`). On a device
 * the hook runs the PKCE code flow through `expo-web-browser`, exchanges the
 * code itself, and exposes the result as `response.params.id_token`, which
 * the server verifies against Google's certificates (`POST /auth/oauth/google`).
 *
 * The v57 page marks this provider deprecated in favour of the native
 * Google Sign-In libraries (https://docs.expo.dev/guides/google-authentication.md);
 * neither native library is a dependency of this app, so the browser flow is
 * what ships in this story. Swapping later touches only this file.
 *
 * Redirect: the provider builds `<applicationId>:/oauthredirect`. iOS gets the
 * bundle id registered as a URL scheme by prebuild; Android needs
 * `android.scheme` in app.config.ts (added there).
 *
 * Client ids are public identifiers, read from `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`
 * — written out in full each time, as https://docs.expo.dev/guides/environment-variables.md
 * requires for build-time inlining. When the current platform's id is absent
 * a disabled "Coming soon" placeholder stands in (`UnavailableSignInButton`):
 * the hook throws on a missing client id, so the check must happen BEFORE the
 * hook is called (hence two components).
 */
import * as Google from 'expo-auth-session/providers/google';
import { useEffect, useRef } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

import { UnavailableSignInButton } from './unavailable-sign-in-button';

function clientIds(): {
  iosClientId: string | undefined;
  androidClientId: string | undefined;
} {
  return {
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  };
}

/** Is a Google client id configured for THIS platform? */
export function isGoogleSignInConfigured(): boolean {
  const ids = clientIds();
  const id = Platform.select({ ios: ids.iosClientId, android: ids.androidClientId });
  return typeof id === 'string' && id.length > 0;
}

export type GoogleSignInButtonProps = {
  onIdToken: (idToken: string) => void;
  onError: (error: unknown) => void;
  /** The parent's mutation is in flight. */
  busy?: boolean;
};

function ConfiguredGoogleSignInButton({
  onIdToken,
  onError,
  busy = false,
}: GoogleSignInButtonProps) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(clientIds());
  const handled = useRef<typeof response>(null);

  useEffect(() => {
    if (!response || handled.current === response) return;
    handled.current = response;

    if (response.type === 'success') {
      const idToken = response.params.id_token;
      if (idToken) onIdToken(idToken);
      else onError(new Error('Google returned no id_token.'));
    } else if (response.type === 'error') {
      onError(response.error ?? new Error('Google sign-in failed.'));
    }
    // 'cancel' / 'dismiss' / 'locked' / 'opened' are not outcomes to report.
  }, [response, onIdToken, onError]);

  return (
    <PressableSurface
      testID="welcome-google-sign-in"
      accessibilityLabel="Continue with Google"
      depth={2}
      busy={busy || request === null}
      onPress={() => void promptAsync()}
      style={styles.action}>
      <ThemedText type="smallBold" style={styles.centred}>
        Continue with Google
      </ThemedText>
    </PressableSurface>
  );
}

export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  if (!isGoogleSignInConfigured()) return <UnavailableSignInButton provider="google" />;
  return <ConfiguredGoogleSignInButton {...props} />;
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
