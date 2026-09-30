/**
 * The documents list header — back, title, the privacy promise, "Add document".
 *
 * The privacy line is always there, not only when the list is empty: documents
 * are the one thing in the product with no visibility setting at all
 * (FR-032), and a traveller keeping a passport-adjacent scan should be able to
 * see that at a glance.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';

export type DocumentsHeaderProps = {
  tripTitle: string | null;
  onBack: () => void;
  onAdd: () => void;
};

export function DocumentsHeader({ tripTitle, onBack, onAdd }: DocumentsHeaderProps) {
  return (
    <View style={styles.header}>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={onBack}
        style={styles.button}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <ThemedText type="subtitle" testID="documents-title">
        {tripTitle ? `Documents · ${tripTitle}` : 'Documents'}
      </ThemedText>

      <ThemedText
        testID="documents-privacy"
        type="small"
        themeColor="textMuted"
        accessibilityRole="text">
        Only you can see your documents. They’re encrypted, and there’s no way to send
        them to anyone.
      </ThemedText>

      <PressableSurface
        testID="documents-add"
        accessibilityLabel="Add document"
        depth={2}
        onPress={onAdd}
        style={styles.button}>
        <ThemedText type="smallBold">Add document</ThemedText>
      </PressableSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.three },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
