/**
 * One note in the trip's list — tasks.md T084 (FR-017), 004 T440 (FR-002, FR-005, FR-006,
 * FR-013, FR-025, FR-029, FR-030, FR-034).
 *
 * A raised `Card`: where the note is filed, in words (a muted caption), the title when
 * there is one, a preview of the body, and the two controls. While the note only exists on
 * this device the card has the dashed edge AND the `SyncBadge` (words and icon), so the
 * state is never a line alone. Edit is a quiet `text` button and Delete the `destructive`
 * one, each an icon and a word, so the danger is a label and a glyph as well as a colour;
 * the row wraps them onto a second line at large text instead of clipping.
 *
 * What did not change for assistive technology (FR-030): the card is ONE element named
 * `<title or "Note">, filed under <place>. <preview>` with the same two actions (Edit note,
 * Delete note), and the two controls keep their ids and names. The element is an outer
 * `View` because a plain `Card` announces nothing of its own and has no `accessible` or
 * action props (the stop row does the same).
 */
import { View, type AccessibilityActionEvent } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
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

const EDIT: IconName = { ios: 'pencil', android: 'edit' };
const REMOVE: IconName = { ios: 'trash', android: 'delete' };

const ROW_ACTIONS = [
  { name: 'edit', label: 'Edit note' },
  { name: 'delete', label: 'Delete note' },
];

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
    <View
      testID={`note-card-${note.id}`}
      accessible
      accessibilityLabel={`${note.title ?? 'Note'}, filed under ${anchor}. ${preview}`}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}>
      <Card pending={note.is_dirty} testID={`note-surface-${note.id}`}>
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text
              type="caption"
              tone="muted"
              testID={`note-anchor-${note.id}`}
              className="shrink">
              {anchor}
            </Text>
            {note.is_dirty ? <SyncBadge state="pending" /> : null}
          </View>
          {note.title ? <Text type="headline">{note.title}</Text> : null}
          <Text testID={`note-body-${note.id}`}>{preview}</Text>
          <View className="flex-row flex-wrap items-center gap-2">
            <Button
              testID={`note-edit-${note.id}`}
              variant="text"
              size="sm"
              icon={EDIT}
              accessibilityLabel={`Edit ${note.title ?? 'note'}`}
              onPress={onEdit}>
              Edit
            </Button>
            <Button
              testID={`note-remove-${note.id}`}
              variant="destructive"
              size="sm"
              icon={REMOVE}
              accessibilityLabel={`Delete ${note.title ?? 'note'}`}
              onPress={onRemove}>
              Delete
            </Button>
          </View>
        </View>
      </Card>
    </View>
  );
}
