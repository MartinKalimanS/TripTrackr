/**
 * Not found — a designed state, not the router's default (FR-027, R009).
 *
 * Reached from a stale deep link or a share URL for a trip that has since been
 * removed. It sits outside both `Stack.Protected` groups so that it renders for
 * signed-in and signed-out travellers alike; the link home then lands wherever
 * the gate says it should.
 */
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { EmptyState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <Screen testID="not-found-screen" style={styles.content}>
      <View style={styles.body}>
        <EmptyState
          title="This page does not exist"
          detail="The link may be out of date, or the trip may have been removed."
        />
        <Link href="/" asChild>
          <PressableSurface
            accessibilityLabel="Back to your globe"
            depth={2}
            style={styles.action}>
            <ThemedText type="smallBold" style={styles.centred}>
              Back to your globe
            </ThemedText>
          </PressableSurface>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: 'center',
  },
  body: {
    gap: Spacing.four,
  },
  action: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  centred: {
    textAlign: 'center',
  },
});
