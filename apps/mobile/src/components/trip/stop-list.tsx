/**
 * The trip's ordered stops, as a draggable timeline — tasks.md T071b, 004 T431
 * (FR-012, FR-013, Acceptance Scenario 1.6; research D-22).
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
 *
 * While a row is carried the order on screen is ahead of the order in `data` (which only
 * follows the drop once it is written back), so the numbers and the rail, which come from
 * each row's index, would read 1, 3, 2. The list keeps a `dragging` flag from the library's
 * `onDragStart` (a row lifts) to `onActiveItemDropped` (the drop animation has finished,
 * after `onDragEnd` has written the new order), and its rows show neutral dots meanwhile.
 * Both callbacks are plain JS functions, called on the JS thread (react-native-sortables
 * 1.10: `DragProvider.ts`, `useDragEndHandler`), so they may set state.
 *
 * The gap between rows is the rows' own (a row carries 12 dp under its card), not the
 * grid's `rowGap`, so the rail between two dots is one unbroken line. The handle is the
 * grip glyph in a platform-sized target; its name and hint are what they were.
 *
 * The grip answers the finger at once (FR-019, T460): a row lifts only after the 150 ms hold,
 * so while a finger is on the grip it shows the held fill every control has, from the
 * touch events (which do not claim the responder, so they cannot compete with the drag
 * gesture). The cue is dropped as the row lifts and after it has landed, so a touch the
 * gesture took over can never leave it behind. The lift and the drop settle in the
 * in-place transition budget (`Motion.transitionMs`), not the library's 300 ms.
 */
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Sortable from 'react-native-sortables';

import { StopRow } from '@/components/trip/stop-row';
import { Icon, type IconName } from '@/components/ui/icon';
import { MinTouchTarget } from '@/constants/theme';
import type { StopWithPlace } from '@/db/repositories/stops';
import { Motion, cornerStyle } from '@/theme';

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

const GRIP: IconName = 'grip';

/** The held fill of every control (`Tappable`'s), as a class: this folder may not read the kit. */
const HELD_FILL = 'bg-separator-secondary';

function GripHandle({ stopId, dragging }: { stopId: string; dragging: boolean }) {
  const [held, setHeld] = useState(false);
  const [wasDragging, setWasDragging] = useState(dragging);
  // A drag starting or ending supersedes the cue (adjusting state while rendering).
  if (dragging !== wasDragging) {
    setWasDragging(dragging);
    setHeld(false);
  }
  const release = () => setHeld(false);

  return (
    <Sortable.Handle>
      <View
        testID={`stop-grip-${stopId}`}
        className={held && !dragging ? HELD_FILL : undefined}
        style={styles.grip}
        onTouchStart={() => setHeld(true)}
        onTouchEnd={release}
        onTouchCancel={release}
        accessibilityLabel="Drag to reorder"
        accessibilityHint="Hold and move to change this stop's position">
        <Icon name={GRIP} size={20} tone="muted" testID={`stop-grip-${stopId}-icon`} />
      </View>
    </Sortable.Handle>
  );
}

const keyExtractor = (stop: StopWithPlace) => stop.id;

export function StopList({ stops, onMove, onReorder, onEdit, onRemove }: StopListProps) {
  const last = stops.length - 1;
  const [dragging, setDragging] = useState(false);

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
        handle={
          stops.length > 1 ? (
            <GripHandle stopId={item.id} dragging={dragging} />
          ) : undefined
        }
        dragging={dragging}
      />
    ),
    [dragging, last, onEdit, onMove, onRemove, stops.length],
  );

  return (
    <View testID="trip-stops">
      <Sortable.Grid
        data={stops as StopWithPlace[]}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        columns={1}
        rowGap={0}
        customHandle
        dragActivationDelay={DRAG_ACTIVATION_DELAY_MS}
        activationAnimationDuration={Motion.transitionMs}
        dropAnimationDuration={Motion.transitionMs}
        onDragStart={() => setDragging(true)}
        onActiveItemDropped={() => setDragging(false)}
        onDragEnd={({ data }) => onReorder(data.map((stop) => stop.id))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grip: {
    ...cornerStyle('md'),
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
