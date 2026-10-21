/**
 * `DayHeader` - the head of a day in the gallery (feature 005, T549; FR-045; UI-SPEC 9.2;
 * prototype `.dh`, `.dn`, `.dt`; picture `more/photos`): the day of the month as a big
 * `numeral` (36 / 40, tabular, capped at 1.3 times the text size), and beside it the place
 * (`callout`, one line) over the weekday, month and count ("Wed · Oct · 14 photos").
 *
 *   <DayHeader group={day} />
 *
 * One announced header for the whole block, named by the day's own sentence ("Wednesday 14
 * October 2026, Sintra"); the numeral and the words inside it are not read again. The numeral
 * has a 52 dp room so the words start at the same place for "5" and "14". A day with no date
 * has no numeral and says "Date unknown" where the place would be. Nothing here is a fixed
 * height: both lines reflow at every text size.
 */
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { DayGroup } from '@/features/photos/photo-days';
import { Space } from '@/theme';

const NUMERAL_ROOM = 52;
const UNDATED_TITLE = 'Date unknown';

export function DayHeader({ group }: { group: DayGroup }) {
  const title = group.numeral === null ? UNDATED_TITLE : group.place;

  return (
    <View
      testID={`day-header-${group.key}`}
      accessible
      accessibilityRole="header"
      accessibilityLabel={group.label}
      className="flex-row items-center"
      style={{ gap: Space[3], marginBottom: Space[3] }}>
      {group.numeral === null ? null : (
        <View style={{ minWidth: NUMERAL_ROOM }}>
          <Text variant="numeral" testID={`day-numeral-${group.key}`}>
            {group.numeral}
          </Text>
        </View>
      )}
      <View className="min-w-0 shrink">
        {title ? (
          <Text variant="callout" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        <Text variant="label" tone="muted">
          {group.meta}
        </Text>
      </View>
    </View>
  );
}
