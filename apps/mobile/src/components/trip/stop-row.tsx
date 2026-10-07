/**
 * One stop in the trip's ordered list — tasks.md T068, T071b, 004 T431 (FR-010, FR-012,
 * FR-013, FR-024, FR-026, FR-029, FR-030, FR-034).
 *
 * A step of a timeline: a numbered dot on a vertical rail, then a flat card with the place
 * (headline), the country (caption), the dates (tabular figures) and, while the stop only
 * exists on this device, the pending marker (words and icon) with a dashed edge. The rail
 * is drawn per row (a line above every dot but the first, below every dot but the last,
 * through the 12 dp of space under each card), so the rows stay independent items for the
 * drag list and the line still reads as one. While a row is being dragged (`dragging`) the
 * numbers and the rail are not trusted, because they come from the data order and the
 * screen is ahead of it: the dot goes neutral (same box, no number) and the rail is hidden.
 *
 * Reordering has two paths. The explicit "Move up" / "Move down" controls
 * work one-handed, with a screen reader, with a switch, and under every
 * appearance adaptation; the same four actions are also exposed as
 * `accessibilityActions`, so an assistive-technology user can act on the row
 * itself without hunting for the small buttons. The optional `handle` is the
 * drag affordance the list supplies (research D-22) — additive, never the
 * only way — and this row knows nothing about the gesture behind it.
 *
 * What did not change for assistive technology (FR-030): the row is ONE element named
 * `Stop N: place, country. dates` with the same four actions, and the four controls keep
 * their ids and names. The visible "Stop N" caption became the number in the dot, which
 * the row's name already says.
 *
 * The controls are compact `Button`s: arrows icon-only (the name is the label), Dates an
 * icon and a word, Remove the destructive emphasis (a tinted fill, a caution glyph and
 * the word, never colour alone). Each has the platform's touch target and the row wraps
 * them onto a second line at large text instead of clipping.
 */
import type { ReactNode } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { IconName } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import type { StopWithPlace } from '@/db/repositories/stops';
import { formatIsoDate } from '@/features/trips/stop-dates';

export type StopRowProps = {
  stop: StopWithPlace;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** A drag affordance rendered beside the place; omitted when there is nothing to drag. */
  handle?: ReactNode;
  /**
   * A stop in this list is being dragged. The number and the rail come from the row's
   * index in the data, which only follows the drop once it is written back, so while a
   * row is carried they would read 1, 3, 2 and the "last" row's rail would stay on the
   * item that was last when the drag began: the dot goes neutral and the rail goes.
   */
  dragging?: boolean;
};

const UP: IconName = { ios: 'chevron.up', android: 'keyboard_arrow_up' };
const DOWN: IconName = { ios: 'chevron.down', android: 'keyboard_arrow_down' };
const DATES: IconName = { ios: 'calendar', android: 'calendar_month' };
const REMOVE: IconName = { ios: 'trash', android: 'delete' };

/** The rail's line; the stub above the dot is as tall as the card's padding is to its first line. */
const RAIL_LINE = 'w-0.5 bg-border';

/** A stop whose city is not in the cache yet still has a name a traveller can follow. */
export function describePlace(
  stop: Pick<StopWithPlace, 'city_name' | 'city_id'>,
): string {
  return stop.city_name ?? `City #${stop.city_id}`;
}

type RailProps = Pick<StopRowProps, 'position' | 'isFirst' | 'isLast'> & {
  id: string;
  dragging: boolean;
};

/** The dot's box: the same size with or without the number, so lifting a row moves nothing. */
const DOT = 'min-h-8 min-w-8 items-center justify-center rounded-full px-1';

/** The number on its dot, with the rail running above and below it. */
function TimelineRail({ id, position, isFirst, isLast, dragging }: RailProps) {
  if (dragging) {
    return (
      <View className="items-center">
        <View className="h-3 w-0.5" />
        <View testID={`stop-dot-${id}`} className={`${DOT} bg-border`} />
      </View>
    );
  }
  return (
    <View className="items-center">
      <View
        testID={`stop-rail-top-${id}`}
        className={isFirst ? 'h-3 w-0.5' : `h-3 ${RAIL_LINE}`}
      />
      <View testID={`stop-dot-${id}`} className={`${DOT} bg-accent`}>
        <Text
          testID={`stop-number-${id}`}
          type="numeric"
          context="callout"
          tone="onAccent">
          {position}
        </Text>
      </View>
      {isLast ? null : (
        <View testID={`stop-rail-bottom-${id}`} className={`grow ${RAIL_LINE}`} />
      )}
    </View>
  );
}

type ActionsProps = Pick<
  StopRowProps,
  'isFirst' | 'isLast' | 'onMoveUp' | 'onMoveDown' | 'onEdit' | 'onRemove'
> & { id: string; place: string };

/** The two arrows, icon-only: the name is the label, and one is dimmed at each end. */
function MoveButtons({ id, place, isFirst, isLast, onMoveUp, onMoveDown }: ActionsProps) {
  return (
    <>
      <Button
        testID={`stop-move-up-${id}`}
        variant="text"
        size="sm"
        iconOnly
        icon={UP}
        accessibilityLabel={`Move ${place} up`}
        disabled={isFirst}
        onPress={onMoveUp}
      />
      <Button
        testID={`stop-move-down-${id}`}
        variant="text"
        size="sm"
        iconOnly
        icon={DOWN}
        accessibilityLabel={`Move ${place} down`}
        disabled={isLast}
        onPress={onMoveDown}
      />
    </>
  );
}

/** Dates (an ordinary action) and Remove (the destructive emphasis), each an icon and a word. */
function EditButtons({ id, place, onEdit, onRemove }: ActionsProps) {
  return (
    <>
      <Button
        testID={`stop-edit-${id}`}
        variant="text"
        size="sm"
        icon={DATES}
        accessibilityLabel={`Edit dates for ${place}`}
        onPress={onEdit}>
        Dates
      </Button>
      <Button
        testID={`stop-remove-${id}`}
        variant="destructive"
        size="sm"
        icon={REMOVE}
        accessibilityLabel={`Remove ${place}`}
        onPress={onRemove}>
        Remove
      </Button>
    </>
  );
}

function StopActions(props: ActionsProps) {
  return (
    <View
      testID={`stop-actions-${props.id}`}
      className="flex-row flex-wrap items-center gap-2">
      <MoveButtons {...props} />
      <EditButtons {...props} />
    </View>
  );
}

const ROW_ACTIONS = [
  { name: 'moveUp', label: 'Move up' },
  { name: 'moveDown', label: 'Move down' },
  { name: 'edit', label: 'Edit dates' },
  { name: 'delete', label: 'Remove stop' },
];

/** The row's own actions; a move past either end is dropped rather than sent to the store. */
function rowActionHandler({
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}: StopRowProps) {
  return (event: AccessibilityActionEvent) => {
    switch (event.nativeEvent.actionName) {
      case 'moveUp':
        if (!isFirst) onMoveUp();
        return;
      case 'moveDown':
        if (!isLast) onMoveDown();
        return;
      case 'edit':
        onEdit();
        return;
      case 'delete':
        onRemove();
        return;
      default:
        return;
    }
  };
}

/** The place, with its country under it, and the list's drag handle at the end of the line. */
function StopHeading({
  place,
  country,
  handle,
}: {
  place: string;
  country: string | null;
  handle?: ReactNode;
}) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="flex-1">
        <Text type="headline">{place}</Text>
        {country ? (
          <Text type="caption" tone="muted">
            {country}
          </Text>
        ) : null}
      </View>
      {handle}
    </View>
  );
}

export function StopRow(props: StopRowProps) {
  const { stop, position, isFirst, isLast, handle, dragging = false } = props;
  const place = describePlace(stop);
  const country = stop.country_name ? `, ${stop.country_name}` : '';
  const dates = `${formatIsoDate(stop.arrive_date)} → ${formatIsoDate(stop.depart_date)}`;

  return (
    <View
      testID={`stop-row-${stop.id}`}
      accessible
      accessibilityLabel={`Stop ${position}: ${place}${country}. ${dates}`}
      accessibilityActions={ROW_ACTIONS}
      onAccessibilityAction={rowActionHandler(props)}
      className="flex-row gap-3">
      <TimelineRail
        id={stop.id}
        position={position}
        isFirst={isFirst}
        isLast={isLast}
        dragging={dragging}
      />
      <View className={isLast ? 'flex-1' : 'flex-1 pb-3'}>
        <Card variant="flat" pending={stop.is_dirty} testID={`stop-card-${stop.id}`}>
          <View className="gap-2">
            <StopHeading place={place} country={stop.country_name} handle={handle} />
            <Text type="numeric" context="callout" testID={`stop-dates-${stop.id}`}>
              {dates}
            </Text>
            {stop.is_dirty ? <SyncBadge state="pending" /> : null}
            <StopActions
              id={stop.id}
              place={place}
              isFirst={isFirst}
              isLast={isLast}
              onMoveUp={props.onMoveUp}
              onMoveDown={props.onMoveDown}
              onEdit={props.onEdit}
              onRemove={props.onRemove}
            />
          </View>
        </Card>
      </View>
    </View>
  );
}
