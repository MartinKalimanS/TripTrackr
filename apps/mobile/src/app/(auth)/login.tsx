/**
 * Login — email and password (T064, T065; FR-001; restyled for Atlas by T446; FR-005,
 * FR-017; contract C4-11 "Welcome, Login, Register").
 *
 * Validation mirrors `LoginRequest` from the contracts; API refusals are
 * translated to plain language (`describeAuthError`) and shown as text above
 * the action, never as colour alone (FR-010, FR-025). On success the session
 * store flips and the root gate swaps this group for the tabs — nothing to
 * navigate. Google and Apple (FR-002) are offered under the action (`SocialSignIn`).
 *
 * The title ("Sign in") and "Back" are the NATIVE header's (`(auth)/_layout.tsx`), so the
 * screen draws neither. The fields sit at the top; the one primary action, "Sign in", and
 * the secondary provider buttons sit in the lower part (`mt-auto` takes the spare room, so
 * they are at the bottom of a tall screen and follow the fields on a short one). The form
 * is a keyboard-aware scroller (`Screen keyboardAware`): the focused field is scrolled
 * above the keyboard, taps on the action are kept, and the password field's return key
 * submits, so the action is never out of reach with the keyboard up.
 *
 * What a credential field is told (T447, pinned by `test/app/auth-security.test.tsx`):
 * `secureTextEntry` with no reveal toggle, the `textContentType` and `autoComplete` a
 * password manager reads, no capitalisation or correction on the email or the password,
 * and nothing that blocks paste. Nothing a field holds is logged, reported or put in a
 * route.
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
  validateLogin,
  type FieldErrors,
  type LoginFields,
} from '@/features/auth/form-validation';
import { useLogin } from '@/features/auth/use-session';

export default function LoginScreen() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<LoginFields>>({});
  const [submitted, setSubmitted] = useState(false);

  const values = { email, password };
  // Once the traveller has tried, keep the messages live so fixing a field
  // clears its message without another press.
  const liveErrors = submitted ? validateLogin(values) : errors;

  const submit = () => {
    const found = validateLogin(values);
    setSubmitted(true);
    setErrors(found);
    if (hasErrors(found)) return;
    login.mutate(values);
  };

  return (
    <Screen testID="login-screen" underHeader keyboardAware>
      <View className="gap-4">
        <Field
          testID="login-email"
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
          testID="login-password"
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={submit}
          error={liveErrors.password}
        />
      </View>

      <View testID="login-actions" className="mt-auto gap-3">
        <InlineError
          testID="login-error"
          message={login.error ? describeAuthError(login.error) : null}
        />
        <Button
          testID="login-submit"
          variant="primary"
          size="lg"
          accessibilityLabel="Sign in"
          busy={login.isPending}
          onPress={submit}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
        <SocialSignIn disabled={login.isPending} />
      </View>
    </Screen>
  );
}
