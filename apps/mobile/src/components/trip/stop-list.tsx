/**
 * The trip's ordered stops, draggable — tasks.md T071b (FR-012, Acceptance
 * Scenario 1.6; research D-22).
 *
 * A one-column `Sortable.Grid` from `react-native-sortables`: a long press on
 * the grip handle lifts the row, the others slide out of its way, and the
 * drop hands back the whole list in its new order. The repository turns that
 * order into the fewest `sort_order` writes (`reorderStopsTo`), so a drag that
 * ends where it started dirties nothing. Only the handle drags
 * (`customHandle`), which leaves the row body free for the edit and remove
 * actions and keeps an accidental swipe from reordering anything.
 *
 * The move-up / move-down buttons and the row's `accessibilityActions` stay:
 * they are the path for a screen reader, a switch, and one-handed use. The
 * gesture is additive.
 */
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { ThemedText } from '@/components/themed-text';
import { StopRow } from '@/components/trip/stop-row';
import { Spacing } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';

export type StopListProps = {
  stops: readonly StopWithPlace[];
  onMove: (stopId: string, direction: 'up' | 'down') => void;
  /** Every stop id in the order the traveller dropped them. */
  onReorder: (orderedIds: string[]) => void;
  onEdit: (stop: StopWithPlace) => void;
  onRemove: (stop: StopWithPlace) => void;
};

/** How long a press must hold before the row lifts — short enough to feel direct, long enough not to fire on a scroll. */
export const DRAG_ACTIVATION_DELAY_MS = 150;

function GripHandle() {
  return (
    <Sortable.Handle>
      <View
        style={styles.grip}
        accessibilityLabel="Drag to reorder"
        accessibilityHint="Hold and move to change this stop's position">
        <ThemedText type="small" themeColor="textMuted">
          ⋮⋮
        </ThemedText>
      </View>
    </Sortable.Handle>
  );
}

const keyExtractor = (stop: StopWithPlace) => stop.id;

export function StopList({ stops, onMove, onReorder, onEdit, onRemove }: StopListProps) {
  const last = stops.length - 1;

  const renderItem = useCallback(
    ({ item, index }: { item: StopWithPlace; index: number }) => (
      <StopRow
        stop={item}
        position={index + 1}
        isFirst={index === 0}
        isLast={index === last}
        onMoveUp={() => onMove(item.id, 'up')}
        onMoveDown={() => onMove(item.id, 'down')}
        onEdit={() => onEdit(item)}
        onRemove={() => onRemove(item)}
        handle={stops.length > 1 ? <GripHandle /> : undefined}
      />
    ),
    [last, onEdit, onMove, onRemove, stops.length],
  );

  return (
    <View testID="trip-stops">
      <Sortable.Grid
        data={stops as StopWithPlace[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        columns={1}
        rowGap={Spacing.three}
        customHandle
        dragActivationDelay={DRAG_ACTIVATION_DELAY_MS}
        onDragEnd={({ data }) => onReorder(data.map((stop) => stop.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grip: {
    minWidth: 44,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
