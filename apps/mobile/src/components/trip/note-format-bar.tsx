/**
 * `NoteFormatBar` - the strip above the keyboard of the note editor (T551; UI-SPEC 9.2; spec 015
 * FR-009): Dismiss keyboard, which puts the keyboard away (`Keyboard.dismiss`) and nothing more.
 *
 * A note is plain text: it has no formatting, no checklist, no attached photograph and no place
 * tag of its own (the place is the anchor chooser above), so the pictured Bold, Bulleted list,
 * Checklist, Add photo and Tag place are not drawn (spec 015 retires Q-11).
 *
 * It rides up with the keyboard as the editor sheet's `footerAccessory`.
 */
import { Keyboard, View } from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { Space } from '@/theme';

export function NoteFormatBar() {
  return (
    <View
      testID="note-editor-format"
      accessibilityRole="toolbar"
      accessibilityLabel="Formatting"
      className="flex-row items-center"
      style={{ gap: Space[1] }}>
      <View className="flex-1" />
      <IconButton
        testID="note-editor-dismiss-keyboard"
        icon="chevron-down"
        variant="ghost"
        accessibilityLabel="Dismiss keyboard"
        onPress={Keyboard.dismiss}
      />
    </View>
  );
}
