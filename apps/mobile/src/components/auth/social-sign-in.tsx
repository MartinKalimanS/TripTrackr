/**
 * "Or continue with" Google and Apple — FR-002; spec Edge Cases (Accounts).
 *
 * The section under the email form on Sign in and Create account: a divider,
 * then one round logo button per provider (`ProviderButton`), Google first.
 * The provider routes create an account transparently on first use
 * (Acceptance Scenario 1.2), so both screens offer both.
 *
 * A provider that cannot work on this build or platform yet — Google with no
 * client id, Apple anywhere without a native sheet — shows disabled, and one
 * plain sentence under the buttons says which are coming soon. Failures (the
 * provider's own sheet, or the API refusing its token) are said in words
 * under the section, like the form's own errors (FR-010).
 *
 * On success nothing is navigated: the session store flips and the root
 * layout swaps the auth group for the tabs.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { describeAuthError } from '@/features/auth/auth-errors';
import { useAppleSignIn, useGoogleSignIn } from '@/features/auth/use-session';
import { useAppearance } from '@/hooks/use-appearance';

import { AppleSignInButton, useAppleSignInAvailability } from './apple-sign-in-button';
import { GoogleSignInButton, isGoogleSignInConfigured } from './google-sign-in-button';

/** "Google and Apple sign-in are coming soon." — or null when nothing is missing. */
export function comingSoonSentence(
  google: boolean,
  apple: boolean | null,
): string | null {
  const missing = [google ? null : 'Google', apple === false ? 'Apple' : null].filter(
    (name): name is string => name !== null,
  );
  if (missing.length === 0) return null;
  return missing.length === 1
    ? `${missing[0]} sign-in is coming soon.`
    : `${missing.join(' and ')} sign-in are coming soon.`;
}

export type SocialSignInProps = {
  /** The screen's own form is submitting. */
  disabled?: boolean;
};

export function SocialSignIn({ disabled = false }: SocialSignInProps) {
  const { theme } = useAppearance();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const [providerError, setProviderError] = useState<string | null>(null);

  const failed = (cause: unknown) => setProviderError(describeAuthError(cause));
  const appleAvailable = useAppleSignInAvailability(failed);
  // A provider failure (its sheet) or an API refusal — whichever is latest.
  const mutationError = apple.error ?? google.error;
  const error =
    providerError ?? (mutationError ? describeAuthError(mutationError) : null);
  const soon = comingSoonSentence(isGoogleSignInConfigured(), appleAvailable);

  return (
    <View testID="social-sign-in" style={styles.section}>
      <Divider />
      <View style={styles.row}>
        <GoogleSignInButton
          busy={google.isPending}
          disabled={disabled || apple.isPending}
          onIdToken={(idToken) => {
            setProviderError(null);
            google.mutate(idToken);
          }}
          onError={failed}
        />
        <AppleSignInButton
          available={appleAvailable}
          busy={apple.isPending}
          disabled={disabled || google.isPending}
          onCredential={(input) => {
            setProviderError(null);
            apple.mutate(input);
          }}
          onError={failed}
        />
      </View>
      {soon ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.centred}>
          {soon}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText
          testID="social-sign-in-error"
          type="small"
          accessibilityRole="alert"
          style={[styles.centred, { color: Colors[theme].danger }]}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A hairline either side of the words, in the palette's border ink. */
function Divider() {
  const { tokens } = useAppearance();
  const rule = [styles.rule, { backgroundColor: tokens.border }];
  return (
    <View style={styles.divider}>
      <View style={rule} />
      <ThemedText type="small" themeColor="textMuted">
        or continue with
      </ThemedText>
      <View style={rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  // The circles grow with text size (FR-016); at the largest settings they
  // wrap onto a second line rather than run off a narrow screen.
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  centred: {
    textAlign: 'center',
  },
});
