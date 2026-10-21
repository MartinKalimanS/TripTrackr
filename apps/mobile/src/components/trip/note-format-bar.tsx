/**
 * `NoteFormatBar` - the pictured strip above the keyboard of the note editor (T551; UI-SPEC 9.2
 * and 10; owner answer Q-11; prototype `.fmt`; picture `more/note-editor`): Bold, Bulleted
 * list, Checklist, Add photo and Tag place, then Dismiss keyboard at the end.
 *
 * A note is plain text: it has no formatting, no checklist, no attached photograph and no
 * place tag of its own (the place is the anchor chooser above), so the five are COMING-SOON
 * controls: drawn as pictured, real buttons, hinted "Not available yet", one toast and nothing
 * else (`coming-soon-note-bold|list|checklist|photo|place`). They never touch the text and
 * save nothing. Dismiss keyboard is real: it puts the keyboard away (`Keyboard.dismiss`) and
 * nothing more.
 *
 * It rides up with the keyboard as the editor sheet's `footerAccessory`.
 */
import { Keyboard, View } from 'react-native';

import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { IconButton } from '@/components/ui/icon-button';
import type { IconName } from '@/components/ui/icon';
import { Space } from '@/theme';

type Tool = { name: string; label: string; icon: IconName };

const TOOLS: readonly Tool[] = [
  { name: 'note-bold', label: 'Bold', icon: 'bold' },
  { name: 'note-list', label: 'Bulleted list', icon: 'list' },
  { name: 'note-checklist', label: 'Checklist', icon: 'list-checks' },
  { name: 'note-photo', label: 'Add photo', icon: 'image' },
  { name: 'note-place', label: 'Tag place', icon: 'map-pin' },
];

export function NoteFormatBar() {
  return (
    <View
      testID="note-editor-format"
      accessibilityRole="toolbar"
      accessibilityLabel="Formatting"
      className="flex-row items-center"
      style={{ gap: Space[1] }}>
      {TOOLS.map((tool) => (
        <ComingSoonButton
          key={tool.name}
          name={tool.name}
          label={tool.label}
          icon={tool.icon}
          variant="ghost"
        />
      ))}
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
