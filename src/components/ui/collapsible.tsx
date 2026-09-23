import { SymbolView } from 'expo-symbols';
import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Collapsible({
  children,
  title,
  testID,
}: PropsWithChildren & {
  title: string;
  /**
   * Identifies the header as an action for the parity registry (T059). Placed
   * on the header rather than the wrapper because the header is the control —
   * the wrapper is not pressable and would register an action that cannot be
   * performed.
   */
  testID?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useTheme();

  return (
    <ThemedView>
      <Pressable
        testID={testID}
        // FR-017. Without these the header is announced as plain text: a
        // VoiceOver/TalkBack user gets no indication the section opens at all,
        // because the chevron is the only other affordance and it is precisely
        // the cue they cannot see. `expanded` then reports which way it is —
        // "collapsed" tells the traveller there is more to find, where silence
        // tells them nothing.
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: isOpen }}
        style={({ pressed }) => [styles.heading, pressed && styles.pressedHeading]}
        onPress={() => setIsOpen((value) => !value)}>
        <ThemedView treatment="raised" radius="sm" style={styles.button}>
          <SymbolView
            name={{
              ios: 'chevron.right',
              android: 'chevron_right',
              web: 'chevron_right',
            }}
            size={14}
            weight="bold"
            tintColor={theme.textPrimary}
            style={{ transform: [{ rotate: isOpen ? '-90deg' : '90deg' }] }}
          />
        </ThemedView>

        <ThemedText type="small">{title}</ThemedText>
      </Pressable>
      {isOpen && (
        <Animated.View entering={FadeIn.duration(200)}>
          <ThemedView treatment="recessed" radius="md" style={styles.content}>
            {children}
          </ThemedView>
        </Animated.View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pressedHeading: {
    opacity: 0.7,
  },
  button: {
    width: Spacing.four,
    height: Spacing.four,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    marginTop: Spacing.three,
    marginLeft: Spacing.four,
    padding: Spacing.four,
  },
});
