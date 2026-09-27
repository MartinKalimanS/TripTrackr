/**
 * Where a note belongs — tasks.md T084, T085 (FR-017, FR-018).
 *
 * The three levels as pills: the whole trip (or each country of a multi-
 * country trip), then each city the trip stops in. Selection is conveyed by
 * treatment AND by the `accessibilityState`, never by hue alone (FR-010).
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';
import type { AnchorTarget } from '@/features/notes/use-move-note';

export type AnchorPickerProps = {
  label: string;
  targets: readonly AnchorTarget[];
  /** `AnchorTarget.key` of the current choice, or '' for none. */
  value: string;
  onChange: (key: string) => void;
  error?: string;
  testID?: string;
};

export function AnchorPicker({
  label,
  targets,
  value,
  onChange,
  error,
  testID,
}: AnchorPickerProps) {
  return (
    <View style={styles.container} testID={testID}>
      <ThemedText type="small">{label}</ThemedText>
      {targets.length === 0 ? (
        <ThemedText type="small" themeColor="textMuted">
          Add a stop to this trip first — notes are filed under its countries and cities.
        </ThemedText>
      ) : (
        <View style={styles.pills} accessibilityRole="radiogroup">
          {targets.map((target) => {
            const selected = target.key === value;
            return (
              <PressableSurface
                key={target.key}
                testID={`anchor-${target.key}`}
                accessibilityLabel={target.label}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                treatment={selected ? 'recessed' : 'raised'}
                radius="pill"
                onPress={() => onChange(target.key)}
                style={styles.pill}>
                <ThemedText type={selected ? 'smallBold' : 'small'}>
                  {target.label}
                </ThemedText>
              </PressableSurface>
            );
          })}
        </View>
      )}
      {error ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
