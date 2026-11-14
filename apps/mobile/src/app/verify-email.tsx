/**
 * Verify email - the screen the emailed link opens (`triptrackr://verify-email?token=`; spec 015
 * User Story 6; FR-016, FR-017; T1511).
 *
 * An UNPROTECTED root route: it confirms the address whether the traveller is signed in or not.
 * The token is read once, checked for shape, sent, and removed from the route's parameters; it
 * is never displayed, logged or reported. The result is said in words: confirmed, or "this link
 * is no longer valid" (expired, used or malformed), or, when the request did not get through,
 * a retry.
 *
 * Visibility posture: only the holder of the link sees the result; nothing is stored here.
 */
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  describeRecoveryFailure,
  useVerifyEmail,
} from '@/features/auth/account-recovery';
import { useSessionStore } from '@/features/auth/session-store';
import { useLinkToken } from '@/features/auth/use-link-token';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const signedIn = useSessionStore((session) => session.status === 'signed-in');
  const verify = useVerifyEmail();
  const token = useLinkToken();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || !token) return;
    sent.current = true;
    verify.mutate({ token });
  }, [token, verify]);

  const failure = verify.error ? describeRecoveryFailure(verify.error) : null;
  const linkIsBad = token === null || failure?.kind === 'invalid-link';
  const done = () => router.replace(signedIn ? '/' : '/login');

  let heading = 'Confirming your email';
  let body = 'One moment.';
  if (verify.isSuccess) {
    heading = 'Email confirmed';
    body = 'Thank you. Your email address is confirmed.';
  } else if (linkIsBad) {
    heading = 'This link is no longer valid';
    body = 'It has expired, was already used, or is not valid. Nothing was changed.';
  } else if (failure) {
    heading = 'We could not confirm it';
    body = failure.message;
  }

  const retry = () => {
    if (!token) return;
    verify.reset();
    verify.mutate({ token });
  };

  return (
    <Screen testID="verify-email-screen">
      <View className="gap-4" accessibilityLiveRegion="polite">
        <Text variant="title">{heading}</Text>
        <Text testID="verify-email-message" variant="body" tone="muted">
          {body}
        </Text>
      </View>
      <View className="mt-auto gap-3">
        {failure && !linkIsBad ? (
          <Button
            testID="verify-email-retry"
            variant="primary"
            size="lg"
            accessibilityLabel="Try again"
            busy={verify.isPending}
            onPress={retry}>
            Try again
          </Button>
        ) : null}
        {verify.isSuccess || linkIsBad ? (
          <Button
            testID="verify-email-done"
            variant="primary"
            size="lg"
            accessibilityLabel={signedIn ? 'Continue' : 'Go to sign in'}
            onPress={done}>
            {signedIn ? 'Continue' : 'Go to sign in'}
          </Button>
        ) : null}
      </View>
    </Screen>
  );
}
