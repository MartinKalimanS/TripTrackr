/**
 * Login — placeholder form (R009).
 *
 * The fields are real and composed from `<TextField>` so the screen reads as a
 * form before it is touched (Acceptance Scenario 1.3); the submit action is
 * present but inert. Wiring it to `POST /auth/login` is US1's job:
 *
 * TODO(US1 T064, T065): enable the action, call the sign-in mutation, write the
 * session through `useSessionStore`, and surface API errors via the field
 * `error` prop (FR-010).
 */
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
        textContentType="password"
        autoComplete="current-password"
      />

      <PressableSurface accessibilityLabel="Sign in" disabled style={styles.submit}>
        <ThemedText type="smallBold" style={styles.centred}>
          Sign in
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
