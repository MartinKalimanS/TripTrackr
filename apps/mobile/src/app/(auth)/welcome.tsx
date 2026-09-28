/**
 * Welcome — the first screen a signed-out traveller sees (R009, T064; FR-001, FR-002).
 *
 * Two ways in: create an account, or sign in. Google and Apple (FR-002) are
 * offered inside both of those, under the email form (`SocialSignIn`), since
 * either creates an account transparently on first use (Acceptance Scenario 1.2).
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen testID="welcome-screen" style={styles.content}>
      <View style={styles.hero}>
        <ThemedText type="title" style={styles.centred}>
          TripTrackr
        </ThemedText>
        <ThemedText themeColor="textMuted" style={styles.centred}>
          Plan it. Live it. Share what you want.
        </ThemedText>
      </View>

      <View style={styles.actions}>
        <PressableSurface
          testID="welcome-create-account"
          accessibilityLabel="Create account"
          depth={2}
          onPress={() => router.push('/register')}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Create account
          </ThemedText>
        </PressableSurface>

        <PressableSurface
          testID="welcome-sign-in"
          accessibilityLabel="Sign in"
          depth={2}
          onPress={() => router.push('/login')}
          style={styles.action}>
          <ThemedText type="smallBold" style={styles.centred}>
            Sign in
          </ThemedText>
        </PressableSurface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
  // Grows into spare space but never collapses below its own content when the
  // text below it grows (FR-016) — see the Screen scaffold for the reasoning.
  hero: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  action: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
});
