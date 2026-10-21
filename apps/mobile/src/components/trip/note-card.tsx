/**
 * One note in the trip's list - tasks.md T084 (FR-017), 004 T440, 005 T551 (FR-048; UI-SPEC
 * 9.2; prototype `.note`, `.nb`, `.nm`, `.sync` in `extra/screens.css`; picture `more/notes`).
 *
 * A cream tile (`Card variant="tile"`: hairline, radius 16, no shadow) padded 16: the title
 * (`callout`, one line, two from text scale 1.5), a three-line excerpt (`body`, muted), then
 * the foot row: the time, a dot, the country's flag and the place at the start, the record's
 * sync state at the end. The card has no dashed edge: the state is a glyph AND words, never a
 * line or a colour alone (FR-025): "On this device" in amber ink with an upload cloud while the
 * note's changes are not on the server yet (words and glyph, as pictured), and a synced tick
 * (named "Synced") once they are. The row wraps at large text, as in `notes-scale1.5`.
 *
 * Not pictured and not invented: the pictured 72 dp thumbnail needs a photograph attached to
 * the note, and the data model has no such link, so no thumbnail is ever drawn. Delete is the
 * app's and stays on the card (a quiet trash at the end of the foot row, 44 dp target through
 * `hitSlop`); the picture draws it in the editor's header, where Cancel stands in this app.
 *
 * What did not change for assistive technology (FR-030): the card is ONE element named
 * `<title or "Note">, filed under <place>. <preview>` with the same two actions (Edit note,
 * Delete note); the body of the card is the Edit control (`note-edit-<id>`, "Edit <title>") and
 * the trash is Delete (`note-remove-<id>`, "Delete <title>"). The element is an outer `View`
 * because a plain `Card` announces nothing of its own (the stop row does the same).
 */
import { View, type AccessibilityActionEvent } from 'react-native';

import { Card } from '@/components/ui/card';
import { FlagChip } from '@/components/ui/flag-chip';
import { Icon } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import type { NoteWithPlace } from '@/db/repositories/notes';
import { excerptOf, noteSync, placeOf, timeOf } from '@/features/notes/note-days';
import { useFontScale } from '@/hooks/use-font-scale';
import { Space } from '@/theme';

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

/** The characters the announced name carries of the body. */
const PREVIEW_LENGTH = 160;
/** The text size from which a title may take a second line (the prototype's `data-bigtext`). */
const BIG_TEXT = 1.5;
const EXCERPT_LINES = 3;

const ROW_ACTIONS = [
  { name: 'edit', label: 'Edit note' },
  { name: 'delete', label: 'Delete note' },
];

const TRASH_HIT = { top: 10, bottom: 10, left: 6, right: 6 } as const;

function spokenPreview(body: string): string {
  return body.length > PREVIEW_LENGTH
    ? `${body.slice(0, PREVIEW_LENGTH).trimEnd()}…`
    : body;
}

function SyncMark({ note }: { note: NoteWithPlace }) {
  const sync = noteSync(note);
  return (
    <View
      testID={`note-sync-${note.id}`}
      accessible
      accessibilityRole="text"
      accessibilityLabel={sync.name}
      className="flex-row items-center"
      style={{ gap: Space[1] }}>
      <Icon
        name={sync.icon}
        size={16}
        tone={sync.state === 'device' ? 'amberInk' : 'success'}
      />
      {sync.words ? (
        <Text variant="caption" tone="amber" className="shrink">
          {sync.words}
        </Text>
      ) : null}
    </View>
  );
}

function FootPlace({ note }: { note: NoteWithPlace }) {
  const time = timeOf(note.created_at);
  return (
    <View className="shrink flex-row items-center" style={{ gap: Space[2] }}>
      {time ? (
        <Text variant="caption" tone="muted">
          {time}
        </Text>
      ) : null}
      {time ? <View className="size-1 rounded-full bg-subtle" /> : null}
      {note.country_iso ? (
        <FlagChip iso2={note.country_iso} testID={`note-flag-${note.id}`} />
      ) : null}
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        testID={`note-anchor-${note.id}`}
        className="shrink">
        {placeOf(note)}
      </Text>
    </View>
  );
}

export function NoteCard({ note, onEdit, onRemove }: NoteCardProps) {
  const fontScale = useFontScale();
  const preview = spokenPreview(note.body);
  const name = note.title ?? 'note';

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'edit') onEdit();
    if (event.nativeEvent.actionName === 'delete') onRemove();
  };

  return (
    <View
      testID={`note-card-${note.id}`}
      accessible
      accessibilityLabel={`${note.title ?? 'Note'}, filed under ${describeAnchor(note)}. ${preview}`}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={onAccessibilityAction}>
      <Card variant="tile" testID={`note-surface-${note.id}`}>
        <Tappable
          testID={`note-edit-${note.id}`}
          accessibilityLabel={`Edit ${name}`}
          onPress={onEdit}
          style={{ minHeight: 0, alignSelf: 'stretch' }}>
          <View style={{ gap: Space[1] }}>
            {note.title ? (
              <Text
                variant="callout"
                numberOfLines={fontScale >= BIG_TEXT ? 2 : 1}
                testID={`note-title-${note.id}`}>
                {note.title}
              </Text>
            ) : null}
            <Text
              variant="body"
              tone="muted"
              numberOfLines={EXCERPT_LINES}
              testID={`note-body-${note.id}`}>
              {excerptOf(note.body)}
            </Text>
          </View>
        </Tappable>
        <View
          testID={`note-foot-${note.id}`}
          className="flex-row flex-wrap items-center justify-between"
          style={{
            marginTop: Space[3],
            minHeight: 24,
            columnGap: Space[2],
            rowGap: Space[1],
          }}>
          <FootPlace note={note} />
          <View className="flex-row items-center" style={{ gap: Space[2] }}>
            <SyncMark note={note} />
            <Tappable
              testID={`note-remove-${note.id}`}
              accessibilityLabel={`Delete ${name}`}
              hitSlop={TRASH_HIT}
              onPress={onRemove}
              style={{
                minHeight: 24,
                minWidth: 28,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
              <Icon name="trash" size={20} tone="muted" />
            </Tappable>
          </View>
        </View>
      </Card>
    </View>
  );
}
