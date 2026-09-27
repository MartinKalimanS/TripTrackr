/** The notes list header: back, title, level filter pills, "New note", write error. */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InlineError } from '@/components/ui/inline-error';
import { PillGroup, type PillOption } from '@/components/ui/pill-group';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';
import type { AnchorTarget } from '@/features/notes/use-move-note';

export type NotesHeaderProps = {
  tripTitle: string | null;
  targets: readonly AnchorTarget[];
  filterKey: string;
  writeError: string | null;
  onBack: () => void;
  onFilter: (key: string) => void;
  onAdd: () => void;
};

const ALL_KEY = 'all';

export function NotesHeader({
  tripTitle,
  targets,
  filterKey,
  writeError,
  onBack,
  onFilter,
  onAdd,
}: NotesHeaderProps) {
  const options: PillOption[] = [{ key: ALL_KEY, label: 'All' }, ...targets].map(
    (target) => ({
      key: target.key,
      label: target.label,
      testID: `notes-filter-${target.key}`,
      accessibilityLabel: `Show ${target.label}`,
    }),
  );

  return (
    <View style={styles.header}>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={onBack}
        style={styles.button}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <ThemedText type="subtitle" testID="notes-title">
        {tripTitle ? `Notes · ${tripTitle}` : 'Notes'}
      </ThemedText>

      <PillGroup options={options} selectedKey={filterKey} onSelect={onFilter} />

      <PressableSurface
        testID="notes-add"
        accessibilityLabel="New note"
        depth={2}
        onPress={onAdd}
        style={styles.button}>
        <ThemedText type="smallBold">New note</ThemedText>
      </PressableSurface>

      <InlineError testID="notes-write-error" message={writeError} />
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
