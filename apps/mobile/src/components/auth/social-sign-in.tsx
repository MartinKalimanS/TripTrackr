/**
 * "Or continue with" Google and Apple — FR-002; spec Edge Cases (Accounts).
 *
 * The section under the email form on Sign in and Create account: a divider,
 * then one pill per provider (`ProviderButton`), Apple first as pictured, stacked
 * in one column at the same width (Atlas, T446; FR-005, FR-017: they are the
 * secondary controls under the screen's one primary action).
 * The provider routes create an account transparently on first use
 * (Acceptance Scenario 1.2), so both screens offer both.
 *
 * The Welcome screen (F12, owner decision Q-11) draws the same two buttons above its
 * "Continue with email": `useSocialSignIn` is the one place the handlers, the in-flight
 * state and the error live, so Apple and Google start the SAME flows there as here.
 * Apple is not drawn on Android, where Sign in with Apple has no native sheet (Apple's rule
 * is that it is offered wherever Google is on iOS); nothing says "coming soon" for it there.
 *
 * A provider that cannot work on this build or platform yet — Google with no
 * client id, Apple on an iOS device that says it is unavailable — shows disabled, and one
 * plain sentence under the buttons says which are coming soon. Failures (the
 * provider's own sheet, or the API refusing its token) are said in words
 * under the section, like the form's own errors (FR-010): an alert with an
 * icon (`InlineError`), never colour alone (FR-025).
 *
 * On success nothing is navigated: the session store flips and the root
 * layout swaps the auth group for the tabs.
 */
import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import { describeAuthError } from '@/features/auth/auth-errors';
import { useAppleSignIn, useGoogleSignIn } from '@/features/auth/use-session';

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

export interface SocialSignInParts {
  /** Sign in with Apple; null on Android, where it is not drawn. */
  apple: ReactNode;
  google: ReactNode;
  /** One quiet sentence naming what is coming soon, or null. */
  soon: string | null;
  /** A provider failure or an API refusal, in plain words, or null. */
  error: string | null;
}

/**
 * The two provider buttons with their handlers, the in-flight state and the error, for a
 * screen to place (the form screens under their form, Welcome above "Continue with email").
 * The handlers are the ones the buttons always had: the session mutations are untouched.
 */
export function useSocialSignIn(disabled = false): SocialSignInParts {
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const [providerError, setProviderError] = useState<string | null>(null);

  const failed = (cause: unknown) => setProviderError(describeAuthError(cause));
  const appleAvailable = useAppleSignInAvailability(failed);
  // A provider failure (its sheet) or an API refusal — whichever is latest.
  const mutationError = apple.error ?? google.error;
  const error =
    providerError ?? (mutationError ? describeAuthError(mutationError) : null);
  const appleDrawn = Platform.OS !== 'android';
  const soon = comingSoonSentence(
    isGoogleSignInConfigured(),
    appleDrawn ? appleAvailable : true,
  );

  return {
    apple: appleDrawn ? (
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
    ) : null,
    google: (
      <GoogleSignInButton
        busy={google.isPending}
        disabled={disabled || apple.isPending}
        onIdToken={(idToken) => {
          setProviderError(null);
          google.mutate(idToken);
        }}
        onError={failed}
      />
    ),
    soon,
    error,
  };
}

export function SocialSignIn({ disabled = false }: SocialSignInProps) {
  const { apple, google, soon, error } = useSocialSignIn(disabled);

  return (
    <View testID="social-sign-in" className="mt-3 gap-3">
      <Divider />
      <View testID="social-sign-in-buttons" className="gap-3">
        {apple}
        {google}
      </View>
      {soon ? (
        <Text type="callout" tone="muted" className="text-center">
          {soon}
        </Text>
      ) : null}
      <InlineError testID="social-sign-in-error" message={error} />
    </View>
  );
}

/** A hairline either side of the words, in the border ink. */
function Divider() {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 bg-border" style={styles.rule} />
      <Text type="callout" tone="muted">
        or continue with
      </Text>
      <View className="flex-1 bg-border" style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { height: StyleSheet.hairlineWidth },
});
