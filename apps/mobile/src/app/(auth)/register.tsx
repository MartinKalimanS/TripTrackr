/**
 * Register — email, password, display name (T064, T065; FR-001; restyled for Atlas by
 * T446; FR-005, FR-017; contract C4-11 "Welcome, Login, Register").
 *
 * The rules are `RegisterRequest`'s: a twelve-character password floor and no
 * composition rule (contracts/api/auth.ts explains why). The confirmation
 * check is purely local and is said in words, not shown as a red border
 * alone (FR-010, FR-025). API refusals — an email that already has an account, a
 * rate limit — become plain sentences through `describeAuthError`. Google and
 * Apple (FR-002) are offered under the action (`SocialSignIn`).
 *
 * The title ("Create account") and "Back" are the NATIVE header's (`(auth)/_layout.tsx`),
 * so the screen draws neither. The four fields sit at the top; the one primary action,
 * "Create account", and the secondary provider buttons sit in the lower part (`mt-auto`
 * takes the spare room). The form is a keyboard-aware scroller (`Screen keyboardAware`):
 * the focused field is scrolled above the keyboard, taps on the action are kept, and the
 * confirmation field's return key submits, so the action is never out of reach with the
 * keyboard up.
 *
 * What a credential field is told (T447, pinned by `test/app/auth-security.test.tsx`):
 * `secureTextEntry` on both password fields with no reveal toggle, `newPassword` and
 * `new-password` so a password manager offers to generate and save one, no capitalisation
 * or correction on the email or the passwords, and nothing that blocks paste. Nothing a
 * field holds is logged, reported or put in a route.
 *
 * Visibility posture: the screen holds only what the traveller types, in this component's
 * state, until the screen is gone; the mutation drops it with the screen (`gcTime: 0`).
 */
import { useState } from 'react';
import { View } from 'react-native';

import { SocialSignIn } from '@/components/auth/social-sign-in';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { describeAuthError } from '@/features/auth/auth-errors';
import {
  hasErrors,
  validateRegister,
  type FieldErrors,
  type RegisterFields,
} from '@/features/auth/form-validation';
import { useRegister } from '@/features/auth/use-session';

const MISMATCH = 'Passwords do not match';

export default function RegisterScreen() {
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<FieldErrors<RegisterFields>>({});
  const [submitted, setSubmitted] = useState(false);

  const values = { email, password, display_name: displayName };
  const liveErrors = submitted ? validateRegister(values) : errors;
  // Only once the traveller has typed a confirmation: flagging an empty field
  // as "not matching" would be shouting before they have had a chance to answer.
  const mismatch = (confirmation.length > 0 || submitted) && confirmation !== password;

  const submit = () => {
    const found = validateRegister(values);
    setSubmitted(true);
    setErrors(found);
    if (hasErrors(found) || confirmation !== password) return;
    register.mutate(values);
  };

  return (
    <Screen testID="register-screen" underHeader keyboardAware>
      <View className="gap-4">
        <Field
          testID="register-display-name"
          label="Name"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          textContentType="name"
          autoComplete="name"
          returnKeyType="next"
          error={liveErrors.display_name}
        />
        <Field
          testID="register-email"
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          returnKeyType="next"
          error={liveErrors.email}
        />
        <Field
          testID="register-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          autoComplete="new-password"
          returnKeyType="next"
          error={liveErrors.password}
        />
        <Field
          testID="register-confirm-password"
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
          error={mismatch ? MISMATCH : undefined}
        />
      </View>

      <View testID="register-actions" className="mt-auto gap-3">
        <InlineError
          testID="register-error"
          message={register.error ? describeAuthError(register.error) : null}
        />
        <Button
          testID="register-submit"
          variant="primary"
          size="lg"
          accessibilityLabel="Create account"
          busy={register.isPending}
          onPress={submit}>
          {register.isPending ? 'Creating your account…' : 'Create account'}
        </Button>
        <SocialSignIn disabled={register.isPending} />
      </View>
    </Screen>
  );
}
