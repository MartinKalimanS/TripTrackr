/** A form's closing row — a flat "Cancel" beside the raised primary save. */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

export type FormActionsProps = {
  testIDPrefix: string;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
};

export function FormActions({
  testIDPrefix,
  saveLabel,
  onCancel,
  onSave,
  saveDisabled = false,
}: FormActionsProps) {
  return (
    <View style={styles.actions}>
      <PressableSurface
        testID={`${testIDPrefix}-cancel`}
        accessibilityLabel="Cancel"
        treatment="flat"
        onPress={onCancel}
        style={styles.action}>
        <ThemedText type="smallBold" style={styles.centred}>
          Cancel
        </ThemedText>
      </PressableSurface>
      <PressableSurface
        testID={`${testIDPrefix}-save`}
        accessibilityLabel={saveLabel}
        depth={2}
        disabled={saveDisabled}
        onPress={onSave}
        style={styles.action}>
        <ThemedText type="smallBold" style={styles.centred}>
          {saveLabel}
        </ThemedText>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  action: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
