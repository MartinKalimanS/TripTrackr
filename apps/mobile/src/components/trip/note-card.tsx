/**
 * One note in the trip's list — tasks.md T084 (FR-017).
 *
 * Shows the level it is filed under (trip, country, or city) in words, the
 * title when there is one, a preview of the body, and the sync state. Edit
 * and remove are explicit controls and also `accessibilityActions`.
 */
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
import type { NoteWithPlace } from '@/db/repositories/notes';

export type NoteCardProps = {
  note: NoteWithPlace;
  onEdit: () => void;
  onRemove: () => void;
};

/** "Firenze, Italy" / "Italy" / "Whole trip" — where the note is filed. */
export function describeAnchor(note: NoteWithPlace): string {
  if (note.city_id !== null) {
    const city = note.city_name ?? `City #${note.city_id}`;
    return note.country_name ? `${city}, ${note.country_name}` : city;
  }
  return (
    note.country_name ??
    (note.country_id !== null ? `Country #${note.country_id}` : 'Trip')
  );
}

const PREVIEW_LENGTH = 160;

export function NoteCard({ note, onEdit, onRemove }: NoteCardProps) {
  const anchor = describeAnchor(note);
  const preview =
    note.body.length > PREVIEW_LENGTH
      ? `${note.body.slice(0, PREVIEW_LENGTH).trimEnd()}…`
      : note.body;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'edit') onEdit();
    if (event.nativeEvent.actionName === 'delete') onRemove();
  };

  return (
    <Surface
      treatment="raised"
      depth={1}
      radius="lg"
      testID={`note-card-${note.id}`}
      accessible
      accessibilityLabel={`${note.title ?? 'Note'}, filed under ${anchor}. ${preview}`}
      accessibilityActions={[
        { name: 'edit', label: 'Edit note' },
        { name: 'delete', label: 'Delete note' },
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.card}>
      <View style={styles.heading}>
        <ThemedText type="small" themeColor="textMuted" testID={`note-anchor-${note.id}`}>
          {anchor}
        </ThemedText>
        {note.is_dirty ? <SyncBadge state="pending" /> : null}
      </View>
      {note.title ? <ThemedText type="smallBold">{note.title}</ThemedText> : null}
      <ThemedText testID={`note-body-${note.id}`}>{preview}</ThemedText>
      <View style={styles.actions}>
        <PressableSurface
          testID={`note-edit-${note.id}`}
          accessibilityLabel={`Edit ${note.title ?? 'note'}`}
          treatment="flat"
          radius="sm"
          onPress={onEdit}
          style={styles.action}>
          <ThemedText type="smallBold">Edit</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID={`note-remove-${note.id}`}
          accessibilityLabel={`Delete ${note.title ?? 'note'}`}
          treatment="flat"
          radius="sm"
          onPress={onRemove}
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="danger">
            Delete
          </ThemedText>
        </PressableSurface>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});
