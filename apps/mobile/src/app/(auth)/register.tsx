/**
 * Register — email, password, display name (T064, T065; FR-001).
 *
 * The rules are `RegisterRequest`'s: a twelve-character password floor and no
 * composition rule (contracts/api/auth.ts explains why). The confirmation
 * check is purely local and is said in words, not shown as a red border
 * alone (FR-010). API refusals — an email that already has an account, a
 * rate limit — become plain sentences through `describeAuthError`.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Colors, Spacing } from '@/constants/theme';
import { describeAuthError } from '@/features/auth/auth-errors';
import {
  hasErrors,
  validateRegister,
  type FieldErrors,
  type RegisterFields,
} from '@/features/auth/form-validation';
import { useRegister } from '@/features/auth/use-session';
import { useAppearance } from '@/hooks/use-appearance';

const MISMATCH = 'Passwords do not match';

export default function RegisterScreen() {
  const router = useRouter();
  const { theme } = useAppearance();
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
    <Screen testID="register-screen">
      <View style={styles.header}>
        <PressableSurface
          accessibilityLabel="Back"
          treatment="flat"
          onPress={() => router.back()}
          style={styles.back}>
          <ThemedText type="smallBold">Back</ThemedText>
        </PressableSurface>
        <ThemedText type="subtitle">Create account</ThemedText>
      </View>

      <TextField
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
      <TextField
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
      <TextField
        testID="register-password"
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="next"
        error={liveErrors.password}
      />
      <TextField
        testID="register-confirm-password"
        label="Confirm password"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={mismatch ? MISMATCH : undefined}
      />

      {register.error ? (
        <ThemedText
          testID="register-error"
          type="small"
          accessibilityRole="alert"
          style={{ color: Colors[theme].danger }}>
          {describeAuthError(register.error)}
        </ThemedText>
      ) : null}

      <PressableSurface
        testID="register-submit"
        accessibilityLabel="Create account"
        depth={2}
        busy={register.isPending}
        onPress={submit}
        style={styles.submit}>
        <ThemedText type="smallBold" style={styles.centred}>
          {register.isPending ? 'Creating your account…' : 'Create account'}
        </ThemedText>
      </PressableSurface>
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
