/**
 * The spending screen's header - tasks.md T086, 004 T441, restyled by 005 T550 (FR-044,
 * FR-047, FR-055; UI-SPEC 9.2; picture `more/expenses`): the shared `AreaHeader` (Back, the title
 * "Spending" with the trip's name and the count under it, the "Only you" chip and the pictured
 * more control), then the write error.
 *
 * The navigator's header is hidden for this route (`trip/[id]/_layout.tsx`): the screen draws the
 * title and Back itself, as the pictures do. `expenses-title` is the title; the line under it
 * names the trip and counts the expenses (`expenses-subtitle`) and has no count while the store
 * has not answered or could not be read (a count there would be invented). The title is the
 * app's word, "Spending" (the picture's "Expenses" is the prototype's); the chip is on because
 * expenses are private by construction (they have no visibility flag: Constitution I).
 *
 * "More" is pictured but has nothing behind it, so it is a coming-soon control (owner answer
 * Q-11): `coming-soon-expenses-more`, one toast and nothing else. "Add expense" is the floating
 * button (`AreaFab`, in the screen), `expenses-add`. The summary's fold-away toggle and the
 * summary itself scroll with the list (`spending-summary.tsx`).
 */
import { View } from 'react-native';

import { AreaHeader, areaMargin } from '@/components/ui/area-header';
import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { InlineError } from '@/components/ui/inline-error';
import { Space } from '@/theme';

export type ExpensesHeaderProps = {
  tripTitle: string | null;
  /** How many expenses the trip has; null while the store has not answered. */
  count: number | null;
  /** A failed local write (a delete), in words. */
  writeError: string | null;
};

/** "Portugal Road Trip · 3 expenses"; either half alone when the other is unknown. */
export function expensesSubtitle(tripTitle: string | null, count: number | null) {
  const counted =
    count === null ? null : `${count} ${count === 1 ? 'expense' : 'expenses'}`;
  return (
    [tripTitle, counted].filter((part): part is string => !!part).join(' · ') || null
  );
}

export function ExpensesHeader({ tripTitle, count, writeError }: ExpensesHeaderProps) {
  return (
    <View>
      <AreaHeader
        testID="expenses-header"
        title="Spending"
        subtitle={expensesSubtitle(tripTitle, count)}
        titleTestID="expenses-title"
        subtitleTestID="expenses-subtitle"
        privacy
        actions={
          <ComingSoonButton
            name="expenses-more"
            label="More"
            thing="More spending actions"
            icon="ellipsis"
            variant="tonal"
          />
        }
      />
      {writeError ? (
        <View style={{ paddingHorizontal: areaMargin(), paddingTop: Space[2] }}>
          <InlineError testID="expenses-write-error" message={writeError} />
        </View>
      ) : null}
    </View>
  );
}
