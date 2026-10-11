/**
 * The documents list header — the trip it belongs to, the privacy promise, "Add document"
 * (tasks.md T118; 004 T443, contract C4-10, FR-005, FR-007, FR-008, FR-030, FR-037).
 *
 * The screen's title and its way back are the navigation header's (`trip/[id]/_layout.tsx`:
 * "Documents" and a control named "Back"), so this block draws neither. What it keeps is
 * `documents-title`, which the Maestro flows wait on, with the words it always had
 * ("Documents · <trip>", or "Documents" while the trip is unknown): a muted line that says
 * which trip these are, not a second title, so it is not a heading.
 *
 * The privacy line is always there, not only when the list is empty: documents are the one
 * thing in the product with no visibility setting at all (FR-032), and a traveller keeping
 * a passport-adjacent scan should be able to see that at a glance. It is a notice card with
 * a lock; the words are the same text node, `documents-privacy`, with the same role.
 *
 * "Add document" is the screen's one primary control (FR-005): the list below it is rows,
 * each a card of its own, and nothing else here competes with it.
 */
import { View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export type DocumentsHeaderProps = {
  tripTitle: string | null;
  onAdd: () => void;
};

const LOCK: IconName = { ios: 'lock', android: 'lock' };
const ADD: IconName = { ios: 'plus', android: 'add' };

export function DocumentsHeader({ tripTitle, onAdd }: DocumentsHeaderProps) {
  return (
    <View className="gap-3">
      <Text type="callout" tone="muted" testID="documents-title">
        {tripTitle ? `Documents · ${tripTitle}` : 'Documents'}
      </Text>

      <Card>
        <View className="flex-row items-start gap-3">
          <Icon name={LOCK} size={20} tone="muted" />
          <Text
            testID="documents-privacy"
            type="callout"
            tone="muted"
            accessibilityRole="text"
            className="flex-1">
            Only you can see your documents. They’re encrypted, and there’s no way to send
            them to anyone.
          </Text>
        </View>
      </Card>

      <Button
        testID="documents-add"
        variant="primary"
        icon={ADD}
        accessibilityLabel="Add document"
        onPress={onAdd}
        className="self-start">
        Add document
      </Button>
    </View>
  );
}
