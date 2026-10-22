/**
 * The documents list header — tasks.md T118; 004 T443; drawn as pictured by 005 T552 (FR-044,
 * FR-049; UI-SPEC 9.2; picture `more/documents`): the shared `AreaHeader` (Back, the "Only you"
 * chip and the pictured "more" disc at the end, the title "Documents" and the trip's name with
 * the count under it), then the privacy line.
 *
 * The navigator's header is hidden for this route (`trip/[id]/_layout.tsx`): the screen draws the
 * title and Back itself. `documents-title` is the title the Maestro flows wait on; the line under
 * it names the trip and counts the documents (`documents-subtitle`), with no count while the
 * store has not answered or could not be read (a count there would be invented).
 *
 * The privacy line is always there, not only when the list is empty: documents are the one thing
 * in the product with no visibility setting at all (FR-032), so the traveller can see at a
 * glance that nothing here can be sent to anyone. A lock in `aquaInk` leads the words; the
 * words are the same text node, `documents-privacy`, in the words it always had.
 *
 * The pictured "more" control has no capability behind it: a coming-soon control (owner answer
 * Q-11), one toast and nothing else (`coming-soon-documents-more`). There is NO share control
 * anywhere: a document is never shareable (constitution I, D-05). "Scan document" is the
 * floating button (`AreaFab`, in the screen), the one primary.
 */
import { View } from 'react-native';

import { AreaHeader, areaMargin } from '@/components/ui/area-header';
import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { documentsSubtitle } from '@/features/documents/document-ticket';
import { Space } from '@/theme';

export type DocumentsHeaderProps = {
  tripTitle: string | null;
  /** How many documents the trip has; null while the store has not answered. */
  count: number | null;
};

export function DocumentsHeader({ tripTitle, count }: DocumentsHeaderProps) {
  return (
    <View>
      <AreaHeader
        testID="documents-header"
        title="Documents"
        subtitle={documentsSubtitle(tripTitle, count)}
        titleTestID="documents-title"
        subtitleTestID="documents-subtitle"
        privacy
        actions={
          <ComingSoonButton
            name="documents-more"
            label="More"
            thing="More document actions"
            icon="ellipsis"
            variant="tonal"
          />
        }
      />
      <View
        className="flex-row items-start"
        style={{
          paddingHorizontal: areaMargin(),
          paddingTop: Space[2],
          paddingBottom: Space[3],
          gap: Space[2],
        }}>
        <View style={{ marginTop: 2 }}>
          <Icon testID="documents-privacy-icon" name="lock" size={16} tone="aquaInk" />
        </View>
        <Text
          testID="documents-privacy"
          variant="label"
          tone="muted"
          accessibilityRole="text"
          className="flex-1">
          Only you can see your documents. They’re encrypted, and there’s no way to send
          them to anyone.
        </Text>
      </View>
    </View>
  );
}
