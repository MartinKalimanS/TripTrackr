/**
 * `NoteDaySection` - one day of the notes list (T551; UI-SPEC 9.2; prototype `.ngh`; picture
 * `more/notes`): the day as a `callout` heading ("Today", "Tue 13 Oct"), 8 above and 12 below,
 * over its cards 12 apart. One announced header named by the day's whole date ("Today,
 * Wednesday 14 October 2026"); the cards follow. One `FlashList` item is one day (D-23).
 */
import { View } from 'react-native';

import { NoteCard } from '@/components/trip/note-card';
import { Text } from '@/components/ui/text';
import type { NoteWithPlace } from '@/db/repositories/notes';
import type { NoteDay } from '@/features/notes/note-days';
import { Space } from '@/theme';

export type NoteDaySectionProps = {
  day: NoteDay;
  onEdit: (note: NoteWithPlace) => void;
  onRemove: (note: NoteWithPlace) => void;
};

export function NoteDaySection({ day, onEdit, onRemove }: NoteDaySectionProps) {
  return (
    <View testID={`note-day-${day.key}`} style={{ gap: Space[3] }}>
      <View style={{ paddingTop: Space[2] }}>
        <Text
          variant="callout"
          accessibilityRole="header"
          accessibilityLabel={day.spoken}
          testID={`note-day-heading-${day.key}`}>
          {day.label}
        </Text>
      </View>
      {day.notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          onEdit={() => onEdit(note)}
          onRemove={() => onRemove(note)}
        />
      ))}
    </View>
  );
}
