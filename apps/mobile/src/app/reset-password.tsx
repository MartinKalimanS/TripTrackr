/**
 * Reset password - the screen the emailed link opens (`triptrackr://reset-password?token=`;
 * spec 015 User Story 6; FR-016, FR-017; T1511).
 *
 * An UNPROTECTED root route (`_layout.tsx` names it outside both `Stack.Protected` groups): the
 * traveller of a reset link cannot sign in, and a traveller who is signed in can still use one.
 *
 * The token: read once from the route, checked for shape (`readRecoveryToken`), kept in this
 * component's state only and REMOVED from the route's parameters at once, so the address the
 * app keeps never holds it. It is never displayed, logged or reported. A link that is absent,
 * malformed, expired or already used says so in words and offers a new request (nothing was
 * changed); a failed attempt that is not the link's fault (offline) keeps the form for another try.
 *
 * Success sends the traveller to sign in (signed in on this device: back to the app).
 *
 * Visibility posture: only the traveller who holds the link sees this; nothing is stored.
 */
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { ErrorSummary } from '@/components/auth/error-summary';
import { PasswordRule } from '@/components/auth/password-rule';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import {
  describeRecoveryFailure,
  useConfirmPasswordReset,
  validateNewPassword,
  PASSWORD_MISMATCH,
} from '@/features/auth/account-recovery';
import { useSessionStore } from '@/features/auth/session-store';
import { useLinkToken } from '@/features/auth/use-link-token';

const PASSWORD_FLOOR = 12;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const token = useLinkToken();
  const signedIn = useSessionStore((session) => session.status === 'signed-in');
  const confirm = useConfirmPasswordReset();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  const failure = confirm.error ? describeRecoveryFailure(confirm.error) : null;
  const linkIsBad = token === null || failure?.kind === 'invalid-link';
  const leave = () => router.replace(signedIn ? '/' : '/login');

  if (linkIsBad) {
    return (
      <Screen testID="reset-password-screen">
        <View className="gap-4">
          <Text variant="title">This link no longer works</Text>
          <Text testID="reset-password-invalid" variant="body" tone="muted">
            This link has expired, was already used, or is not valid. Nothing was changed.
          </Text>
        </View>
        <View className="mt-auto gap-3">
          {signedIn ? (
            <Button
              testID="reset-password-close"
              variant="primary"
              size="lg"
              accessibilityLabel="Close"
              onPress={leave}>
              Close
            </Button>
          ) : (
            <Button
              testID="reset-password-new-link"
              variant="primary"
              size="lg"
              accessibilityLabel="Ask for a new link"
              onPress={() => router.replace('/forgot-password')}>
              Ask for a new link
            </Button>
          )}
        </View>
      </Screen>
    );
  }

  const errors = submitted ? validateNewPassword(password, confirmation) : {};
  const summary = [
    { key: 'password', label: 'New password', message: errors.password },
    { key: 'confirmation', label: 'Confirm password', message: errors.confirmation },
  ].flatMap(({ message, ...item }) => (message ? [{ ...item, message }] : []));

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(validateNewPassword(password, confirmation)).length > 0) return;
    confirm.mutate({ token, password }, { onSuccess: leave });
  };

  return (
    <Screen testID="reset-password-screen" keyboardAware>
      <View className="gap-4">
        <Text variant="title">
          Choose a new{' '}
          <Text variant="accent" tone="accent">
            password
          </Text>
        </Text>
        <ErrorSummary
          goal="change your password"
          items={summary}
          onSelect={(key) =>
            (key === 'password' ? passwordRef : confirmationRef).current?.focus()
          }
        />
        <Field
          testID="reset-password-new"
          inputRef={passwordRef}
          label="New password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          error={errors.password}
        />
        <View className="-mt-2">
          <PasswordRule
            met={password.length >= PASSWORD_FLOOR}
            text={`At least ${PASSWORD_FLOOR} characters`}
          />
        </View>
        <Field
          testID="reset-password-confirm"
          inputRef={confirmationRef}
          label="Confirm password"
          value={confirmation}
          onChangeText={setConfirmation}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={
            errors.confirmation === PASSWORD_MISMATCH ? PASSWORD_MISMATCH : undefined
          }
        />
      </View>

      <View testID="reset-password-actions" className="mt-auto gap-3">
        <InlineError testID="reset-password-error" message={failure?.message ?? null} />
        <Button
          testID="reset-password-submit"
          variant="primary"
          size="lg"
          accessibilityLabel="Save new password"
          busy={confirm.isPending}
          onPress={submit}>
          {confirm.isPending ? 'Saving…' : 'Save new password'}
        </Button>
      </View>
    </Screen>
  );
}
