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
 * Pictured by F12 (T555; `more/register.png`): the heading "Create your passport" with one serif
 * accent word, an error summary (the mismatch included), the one visible password rule
 * ("At least 12 characters", a word and an icon: the contract has no other rule), the legal
 * line with real Terms and Privacy Policy links, the privacy promise, and in the native header
 * the link to Sign in. NOT drawn: the show-password eye, the valid-email tick, and a disabled
 * primary (the action stays pressable so a refusal can be said in words).
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
import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { ErrorSummary } from '@/components/auth/error-summary';
import { LegalLine } from '@/components/auth/legal-line';
import { PasswordRule } from '@/components/auth/password-rule';
import { PrivacyPromise } from '@/components/auth/privacy-promise';
import { SocialSignIn } from '@/components/auth/social-sign-in';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { describeAuthError } from '@/features/auth/auth-errors';
import {
  hasErrors,
  validateRegister,
  type FieldErrors,
  type RegisterFields,
} from '@/features/auth/form-validation';
import { useRegister } from '@/features/auth/use-session';

const MISMATCH = 'Passwords do not match';
/** The contract's floor (`RegisterRequest`: `min(12)`), said as the one visible rule. */
const PASSWORD_FLOOR = 12;

export default function RegisterScreen() {
  const register = useRegister();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<FieldErrors<RegisterFields>>({});
  const [submitted, setSubmitted] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  const values = { email, password, display_name: displayName };
  const liveErrors = submitted ? validateRegister(values) : errors;
  // Only once the traveller has typed a confirmation: flagging an empty field
  // as "not matching" would be shouting before they have had a chance to answer.
  const mismatch = (confirmation.length > 0 || submitted) && confirmation !== password;
  const summary = [
    { key: 'display_name', label: 'Name', message: liveErrors.display_name },
    { key: 'email', label: 'Email', message: liveErrors.email },
    { key: 'password', label: 'Password', message: liveErrors.password },
    {
      key: 'confirmation',
      label: 'Confirm password',
      message: mismatch ? MISMATCH : undefined,
    },
  ].flatMap(({ message, ...item }) => (message ? [{ ...item, message }] : []));

  const focusField = (key: string) => {
    const target = { display_name: nameRef, email: emailRef, password: passwordRef }[key];
    (target ?? confirmationRef).current?.focus();
  };

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
        <Text variant="title">
          Create your{' '}
          <Text variant="accent" tone="accent">
            passport
          </Text>
        </Text>
        <ErrorSummary goal="create your account" items={summary} onSelect={focusField} />
        <Field
          testID="register-display-name"
          inputRef={nameRef}
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
          testID="register-password"
          inputRef={passwordRef}
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
        <View className="-mt-2">
          <PasswordRule
            met={password.length >= PASSWORD_FLOOR}
            text={`At least ${PASSWORD_FLOOR} characters`}
          />
        </View>
        <Field
          testID="register-confirm-password"
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
          error={mismatch ? MISMATCH : undefined}
        />
        <View className="gap-2">
          <LegalLine lead="By creating an account you agree to the" size="callout" />
          <View className="items-center">
            <PrivacyPromise />
          </View>
        </View>
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
        <SocialSignIn appleIntent="sign-up" disabled={register.isPending} />
      </View>
    </Screen>
  );
}
