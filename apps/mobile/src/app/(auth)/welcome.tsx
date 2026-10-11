/**
 * Welcome — the first screen a signed-out traveller sees (R009, T064; FR-001, FR-002;
 * restyled for Atlas by T446; FR-005, FR-017; contract C4-11 "Welcome, Login, Register").
 *
 * Two ways in: create an account, or sign in. Google and Apple (FR-002) are
 * offered inside both of those, under the email form (`SocialSignIn`), since
 * either creates an account transparently on first use (Acceptance Scenario 1.2).
 *
 * There is no header (the `(auth)` layout hides it): the product name is the screen's own
 * heading, in the display face. The one primary action, "Create account", and the secondary
 * one, "Sign in", sit together in the lower part of the screen where the thumb rests,
 * under a hero that takes the spare room. The hero grows but never shrinks below its own
 * content, so at the largest text size the screen scrolls instead of squeezing it (FR-029,
 * and see `Screen`). Both actions keep their ids, names and order.
 *
 * Visibility posture: nothing traveller-owned is shown here; the screen holds no data.
 */
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen testID="welcome-screen">
      <View
        testID="welcome-hero"
        className="grow shrink-0 basis-auto items-center justify-center gap-3">
        <Text type="largeTitle" className="text-center">
          TripTrackr
        </Text>
        <Text tone="muted" className="text-center">
          Plan it. Live it. Share what you want.
        </Text>
      </View>

      <View testID="welcome-actions" className="gap-3 pb-4">
        <Button
          testID="welcome-create-account"
          variant="primary"
          size="lg"
          accessibilityLabel="Create account"
          onPress={() => router.push('/register')}>
          Create account
        </Button>
        <Button
          testID="welcome-sign-in"
          variant="secondary"
          size="lg"
          accessibilityLabel="Sign in"
          onPress={() => router.push('/login')}>
          Sign in
        </Button>
      </View>
    </Screen>
  );
}
