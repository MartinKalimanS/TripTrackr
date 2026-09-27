/**
 * Welcome — the first screen a signed-out traveller sees (R009, T064; FR-001, FR-002).
 *
 * Four ways in: create an account, sign in with email, Sign in with Apple
 * (iOS, when available), Continue with Google (when a client id is
 * configured). The OAuth routes create an account transparently on first use
 * (Acceptance Scenario 1.2), so they sit here rather than behind "Sign in".
 *
 * On success nothing is navigated: the session store flips and the root
 * layout's `Stack.Protected` swaps this group for the tabs
 * (https://docs.expo.dev/router/reference/authentication.md).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppleSignInButton } from '@/components/auth/apple-sign-in-button';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { Colors, Spacing } from '@/constants/theme';
import { describeAuthError } from '@/features/auth/auth-errors';
import { useAppleSignIn, useGoogleSignIn } from '@/features/auth/use-session';
import { useAppearance } from '@/hooks/use-appearance';

export default function WelcomeScreen() {
  const router = useRouter();
  const { theme } = useAppearance();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const [providerError, setProviderError] = useState<string | null>(null);

  const busy = apple.isPending || google.isPending;
  // A provider failure (the sheet itself) or an API refusal — whichever is latest.
  const mutationError = apple.error ?? google.error;
  const error =
    providerError ?? (mutationError ? describeAuthError(mutationError) : null);

  const failed = (cause: unknown) => setProviderError(describeAuthError(cause));

  return (
    <Screen testID="welcome-screen" style={styles.content}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.centred}>
          TripTrackr
        </ThemedText>
        <ThemedText themeColor="textMuted" style={styles.centred}>
          Plan it. Live it. Share what you want.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <PressableSurface
          testID="welcome-create-account"
          accessibilityLabel="Create account"
          depth={2}
          disabled={busy}
          onPress={() => router.push('/register')}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Create account
          </ThemedText>
        </PressableSurface>

        <PressableSurface
          testID="welcome-sign-in"
          accessibilityLabel="Sign in"
          depth={2}
          disabled={busy}
          onPress={() => router.push('/login')}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Sign in
          </ThemedText>
        </PressableSurface>

        <AppleSignInButton
          onCredential={(input) => {
            setProviderError(null);
            apple.mutate(input);
          }}
          onError={failed}
        />

        <GoogleSignInButton
          busy={google.isPending}
          onIdToken={(idToken) => {
            setProviderError(null);
            google.mutate(idToken);
          }}
          onError={failed}
        />

        {error ? (
          <ThemedText
            testID="welcome-error"
            type="small"
            accessibilityRole="alert"
            style={[styles.centred, { color: Colors[theme].danger }]}>
            {error}
          </ThemedText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
  // Grows into spare space but never collapses below its own content when the
  // text below it grows (FR-016) — see the Screen scaffold for the reasoning.
  hero: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  action: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
