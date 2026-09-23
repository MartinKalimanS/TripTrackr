/**
 * Register — placeholder form (R009).
 *
 * The one piece of behaviour already here is the confirmation check, because
 * it is purely local and FR-010 requires the mismatch to be said in words, not
 * shown as a red border alone. Everything that talks to the API is US1's:
 *
 * TODO(US1 T064, T065): enable the action, call the register mutation, write
 * the session through `useSessionStore`, and surface API errors via the field
 * `error` prop.
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  // Only once the traveller has typed a confirmation: flagging an empty field
  // as "not matching" would be shouting before they have had a chance to answer.
  const mismatch = confirmation.length > 0 && confirmation !== password;

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
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <TextField
        label="Confirm password"
        value={confirmation}
        onChangeText={setConfirmation}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
        error={mismatch ? 'Passwords do not match' : undefined}
      />

      <PressableSurface
        accessibilityLabel="Create account"
        disabled
        style={styles.submit}>
        <ThemedText type="smallBold" style={styles.centred}>
          Create account
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
