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
 * Pictured by F12 (T555; `more/auth.png`): the heading "Welcome back" with one serif accent
 * word, an error summary above the fields once the traveller has tried ("Fix 2 things to sign
 * in": the count in words, an icon, each problem a link that moves focus to its field),
 * "Forgot password?" in the password label row (a coming-soon control: one toast, nothing else)
 * and, in the native header, the link to Create account. NOT drawn, on purpose: the pictured
 * show-password eye (T447 keeps the credential fields as they are: no reveal toggle), and the
 * provider buttons above the form (UI-SPEC 7 puts them under it, the primary stays in the
 * thumb zone).
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
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { ErrorSummary } from '@/components/auth/error-summary';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import { Button } from '@/components/ui/button';
import { COMING_SOON_HINT, useComingSoon } from '@/components/ui/coming-soon-button';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { describeAuthError } from '@/features/auth/auth-errors';
import {
  hasErrors,
  validateLogin,
  type FieldErrors,
  type LoginFields,
} from '@/features/auth/form-validation';
import { useLogin } from '@/features/auth/use-session';

/** "Forgot password?" in the password label row: pictured, with no capability behind it yet. */
function ForgotPassword() {
  const onPress = useComingSoon('Password reset');
  return (
    <Button
      testID="coming-soon-forgot-password"
      variant="text"
      size="sm"
      accessibilityLabel="Forgot password?"
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}>
      Forgot password?
    </Button>
  );
}

export default function LoginScreen() {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<LoginFields>>({});
  const [submitted, setSubmitted] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const values = { email, password };
  // Once the traveller has tried, keep the messages live so fixing a field
  // clears its message without another press.
  const liveErrors = submitted ? validateLogin(values) : errors;
  const summary = [
    { key: 'email', label: 'Email', message: liveErrors.email },
    { key: 'password', label: 'Password', message: liveErrors.password },
  ].flatMap(({ message, ...item }) => (message ? [{ ...item, message }] : []));
  const focusField = (key: string) =>
    (key === 'email' ? emailRef : passwordRef).current?.focus();

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
        <Text variant="title">
          Welcome{' '}
          <Text variant="accent" tone="accent">
            back
          </Text>
        </Text>
        <ErrorSummary goal="sign in" items={summary} onSelect={focusField} />
        <Field
          testID="login-email"
          inputRef={emailRef}
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
          inputRef={passwordRef}
          labelAccessory={<ForgotPassword />}
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
        <SocialSignIn appleIntent="sign-in" disabled={login.isPending} />
      </View>
    </Screen>
  );
}
