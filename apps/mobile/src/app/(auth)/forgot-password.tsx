/**
 * Forgot password - ask for a reset link by email (spec 015 User Story 6; FR-015; T1511).
 *
 * One field and one primary action. Whatever the server knows about the address, the
 * traveller reads the SAME sentence afterwards (`SENT_MESSAGE`): the screen cannot tell a known
 * address from an unknown one, because the API answers both alike and the copy never changes.
 * A request that did not reach the server is said in words instead, and can be sent again.
 *
 * The title and "Back" are the native header's (`(auth)/_layout.tsx`). The form is a
 * keyboard-aware scroller like Sign in, and the return key sends. The screen holds only what
 * the traveller typed, in its own state, and the mutation drops it with the screen
 * (`gcTime: 0`).
 *
 * Visibility posture: nothing here is shown to anyone but the traveller; nothing is stored.
 */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  describeRecoveryFailure,
  useRequestPasswordReset,
  validateResetEmail,
} from '@/features/auth/account-recovery';

/** Identical for a known and an unknown address (FR-015). */
export const SENT_MESSAGE =
  'If an account uses that address, we have sent it a link to choose a new password. Look for the email; the link works for one hour.';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const emailRef = useRef<TextInput>(null);

  const submit = () => {
    const found = validateResetEmail(email);
    setError(found.email);
    if (found.email) return;
    request.mutate({ email });
  };

  return (
    <Screen testID="forgot-password-screen" underHeader keyboardAware>
      <View className="gap-4">
        <Text variant="title">
          Reset your{' '}
          <Text variant="accent" tone="accent">
            password
          </Text>
        </Text>
        <Text variant="body" tone="muted">
          Enter the email you signed up with and we will send you a link to choose a new
          password.
        </Text>
        <Field
          testID="forgot-password-email"
          inputRef={emailRef}
          label="Email"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(undefined);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        {request.isSuccess ? (
          <View
            testID="forgot-password-sent"
            accessible
            accessibilityRole="alert"
            className="rounded-2xl border border-border bg-surface-secondary p-3">
            <Text variant="label">{SENT_MESSAGE}</Text>
          </View>
        ) : null}
      </View>

      <View testID="forgot-password-actions" className="mt-auto gap-3">
        <InlineError
          testID="forgot-password-error"
          message={request.error ? describeRecoveryFailure(request.error).message : null}
        />
        <Button
          testID="forgot-password-submit"
          variant={request.isSuccess ? 'secondary' : 'primary'}
          size="lg"
          accessibilityLabel={
            request.isSuccess ? 'Send the link again' : 'Send reset link'
          }
          busy={request.isPending}
          onPress={submit}>
          {request.isPending
            ? 'Sending…'
            : request.isSuccess
              ? 'Send the link again'
              : 'Send reset link'}
        </Button>
        <Button
          testID="forgot-password-back"
          variant="text"
          accessibilityLabel="Back to sign in"
          onPress={() => router.replace('/login')}>
          Back to sign in
        </Button>
      </View>
    </Screen>
  );
}
