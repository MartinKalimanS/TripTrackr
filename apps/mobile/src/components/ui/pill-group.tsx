/** A radio group of pill buttons — one option selected, the rest raised. */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

export type PillOption = {
  key: string;
  label: string;
  testID: string;
  accessibilityLabel: string;
};

export type PillGroupProps = {
  options: readonly PillOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

export function PillGroup({ options, selectedKey, onSelect }: PillGroupProps) {
  return (
    <View style={styles.pills} accessibilityRole="radiogroup">
      {options.map((option) => {
        const selected = option.key === selectedKey;
        return (
          <PressableSurface
            key={option.key}
            testID={option.testID}
            accessibilityLabel={option.accessibilityLabel}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            treatment={selected ? 'recessed' : 'raised'}
            radius="pill"
            onPress={() => onSelect(option.key)}
            style={styles.pill}>
            <ThemedText type={selected ? 'smallBold' : 'small'}>
              {option.label}
            </ThemedText>
          </PressableSurface>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
