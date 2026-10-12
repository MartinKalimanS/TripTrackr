/**
 * The notes list header: the level filter chips, "New note" and the write error — 004 T440
 * (FR-005, FR-007, FR-008, FR-030).
 *
 * The title and Back are the native header's (`app/trip/[id]/_layout.tsx`), so this draws
 * neither; the old `notes-title` line ("Notes · <trip>") went with them. What stays keeps
 * its reading order (filters, then the action, then the error) and its ids and names.
 *
 * The filters are ONE sideways radio group (`ChipGroup scroll`), a chip per level the trip
 * has stops at, so a trip of many cities does not push the notes down the screen and every
 * chip is still reachable at the largest text size. "New note" is the screen's one primary
 * control (FR-005); when the list is empty the empty state offers the same action as a
 * secondary under another id (`notes-empty-add`), as the Trips screen does.
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import type { AnchorTarget } from '@/features/notes/use-move-note';

export type NotesHeaderProps = {
  targets: readonly AnchorTarget[];
  filterKey: string;
  writeError: string | null;
  onFilter: (key: string) => void;
  onAdd: () => void;
};

const ALL_KEY = 'all';

const ADD: IconName = 'plus';

export function NotesHeader({
  targets,
  filterKey,
  writeError,
  onFilter,
  onAdd,
}: NotesHeaderProps) {
  const options: ChipOption[] = [{ key: ALL_KEY, label: 'All' }, ...targets].map(
    (target) => ({
      key: target.key,
      label: target.label,
      testID: `notes-filter-${target.key}`,
      accessibilityLabel: `Show ${target.label}`,
    }),
  );

  return (
    <View className="gap-3">
      <ChipGroup options={options} selectedKey={filterKey} onSelect={onFilter} scroll />

      <Button
        testID="notes-add"
        variant="primary"
        icon={ADD}
        accessibilityLabel="New note"
        className="self-start"
        onPress={onAdd}>
        New note
      </Button>

      <InlineError testID="notes-write-error" message={writeError} />
    </View>
  );
}
