/**
 * Login — email and password (T064, T065; FR-001).
 *
 * Validation mirrors `LoginRequest` from the contracts; API refusals are
 * translated to plain language (`describeAuthError`) and shown as text under
 * the form, never as colour alone (FR-010). On success the session store
 * flips and the root gate swaps this group for the tabs — nothing to navigate.
 * Google and Apple (FR-002) are offered under the form (`SocialSignIn`).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SocialSignIn } from '@/components/auth/social-sign-in';
import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { describeAuthError } from '@/features/auth/auth-errors';
import {
  hasErrors,
  validateLogin,
  type FieldErrors,
  type LoginFields,
} from '@/features/auth/form-validation';
import { useLogin } from '@/features/auth/use-session';
import { useAppearance } from '@/hooks/use-appearance';

export default function LoginScreen() {
  const router = useRouter();
  const { theme } = useAppearance();
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
    <Screen testID="login-screen">
      <View style={styles.header}>
        <PressableSurface
          accessibilityLabel="Back"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.back}>
          <ThemedText type="smallBold">Back</ThemedText>
        </PressableSurface>
        <ThemedText type="subtitle">Sign in</ThemedText>
      </View>

      <TextField
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
      <TextField
        testID="login-password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={liveErrors.password}
      />

      {login.error ? (
        <ThemedText
          testID="login-error"
          type="small"
          accessibilityRole="alert"
          style={{ color: Colors[theme].danger }}>
          {describeAuthError(login.error)}
        </ThemedText>
      ) : null}

      <PressableSurface
        testID="login-submit"
        accessibilityLabel="Sign in"
        depth={2}
        busy={login.isPending}
        onPress={submit}
        style={styles.submit}>
        <ThemedText type="smallBold" style={styles.centred}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </ThemedText>
      </PressableSurface>

      <SocialSignIn disabled={login.isPending} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.three,
    marginBottom: Spacing.two,
  },
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  submit: {
    marginTop: Spacing.two,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
});
