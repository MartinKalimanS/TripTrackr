/**
 * The notes header - 004 T440 (FR-005, FR-007, FR-008, FR-030), 005 T551 (FR-044, FR-048;
 * UI-SPEC 9.2; picture `more/notes`): the shared `AreaHeader` (Back, the title "Notes" with
 * the trip's name and the count under it, and at the end the pictured search control), then
 * the level filter chips and the write error.
 *
 * The navigator's header is hidden for this route (`trip/[id]/_layout.tsx`): the screen draws
 * the title and Back itself, as the pictures do. `notes-header-title` is the title (the old
 * `notes-title` line stays retired: the parity allowlist excuses it) and `notes-subtitle` the
 * line under it ("Portugal Road Trip · 6 notes"), which has no count while the store has not
 * answered or could not be read (a count there would be invented). The count is of the notes
 * the list shows, so with a level chosen it is that level's.
 *
 * The pictured search is a coming-soon control (owner answer Q-11): `coming-soon-notes-search`,
 * named "Search notes", one toast and nothing else. "New note" is the floating button
 * (`AreaFab`, in the screen), the one primary control (FR-005); with no notes the empty state
 * offers the same action as a secondary under another id (`notes-empty-add`).
 *
 * The filters are ONE sideways radio group (`ChipGroup scroll`), a chip per level the trip has
 * stops at, so a trip of many cities does not push the notes down the screen and every chip
 * stays reachable at the largest text size. They are the app's (not pictured) and sit fixed
 * under the header with the write error, in their old reading order (filters, then the error).
 */
import { View } from 'react-native';

import { AreaHeader, areaMargin } from '@/components/ui/area-header';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { InlineError } from '@/components/ui/inline-error';
import { notesSubtitle } from '@/features/notes/note-days';
import type { AnchorTarget } from '@/features/notes/use-move-note';
import { Space } from '@/theme';

export type NotesHeaderProps = {
  tripTitle: string | null;
  /** How many notes the list shows; null while the store has not answered. */
  count: number | null;
  targets: readonly AnchorTarget[];
  filterKey: string;
  writeError: string | null;
  onFilter: (key: string) => void;
};

const ALL_KEY = 'all';

export function NotesHeader({
  tripTitle,
  count,
  targets,
  filterKey,
  writeError,
  onFilter,
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
    <View>
      <AreaHeader
        testID="notes-header"
        title="Notes"
        subtitle={notesSubtitle(tripTitle, count)}
        titleTestID="notes-header-title"
        subtitleTestID="notes-subtitle"
        actions={
          <ComingSoonButton
            name="notes-search"
            label="Search notes"
            thing="Search"
            icon="search"
            variant="tonal"
          />
        }
      />
      <View
        style={{ paddingHorizontal: areaMargin(), paddingTop: Space[3], gap: Space[3] }}>
        <ChipGroup options={options} selectedKey={filterKey} onSelect={onFilter} scroll />
        <InlineError testID="notes-write-error" message={writeError} />
      </View>
    </View>
  );
}
