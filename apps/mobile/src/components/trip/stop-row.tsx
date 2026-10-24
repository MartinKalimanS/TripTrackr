/**
 * One stop on the trip's timeline - tasks.md T068, T071b, 004 T431, 005 T545 (spec FR-041,
 * FR-070, FR-074, FR-075, FR-076; contract C5-20).
 *
 * A node on a rail, then the stop. The rail is 32 dp: a node of 28 dp (a check on the ink for a
 * stop done, the stop's number on the coral with a halo for the one the traveller is at, the
 * number in a ring for those to come: three shapes, never colour alone), a solid 3 dp line under
 * it down to the next stop (the ink, or the coral line under the stop the traveller is at) and,
 * above it, an 8 dp lead that is DOTTED when the traveller moved on from the stop before (that
 * journey is drawn beneath that stop as a `TransitRow` with its distance) and solid when the
 * two are one stay. The body: the place with a "Now" chip, the country beside its flag, the
 * dates (tabular figures) and the nights, a picture of the city and, while the stop only exists
 * on this device, the pending marker (words and icon) with a dashed edge; the cream tile of the
 * chosen day (`highlighted`) is the same card with a fill.
 *
 * The rail is drawn per row, so the rows stay independent items for the drag list and the line
 * still reads as one. While a row is being dragged (`dragging`) the numbers and the rail are not
 * trusted, because they come from the data order and the screen is ahead of it: the node goes
 * neutral (same box, no number, no check) and the spine, the lead and the journey are hidden.
 *
 * Reordering has two paths, unchanged. The explicit "Move up" / "Move down" controls work
 * one-handed, with a screen reader, with a switch, and under every appearance adaptation; the
 * same four actions are also `accessibilityActions` of the row, and the optional `handle` is the
 * drag affordance the list supplies (research D-22): additive, never the only way.
 *
 * What did not change for assistive technology (FR-075, FR-081): the row is ONE element named
 * exactly `Stop N: place, country. dates` (the name the 004 row and the parity guard have) with
 * the same four actions, and the four controls keep their ids and names. What the node and the
 * journey draw is said as the row's VALUE, read after the name: "Now." for the stop the
 * traveller is at and "23 kilometres from Lisbon." for the journey that led here; a stop with
 * neither has no value. The journey beneath the row, the node and the picture are decoration
 * and are not read twice.
 */
import type { ReactNode } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FlagChip } from '@/components/ui/flag-chip';
import type { IconName } from '@/components/ui/icon';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Text } from '@/components/ui/text';
import type { StopWithPlace } from '@/db/repositories/stops';
import { formatIsoDate } from '@/features/trips/stop-dates';
import {
  nightsLabel,
  stopNights,
  type StopNodeState,
} from '@/features/trips/stop-timeline';
import { formatDistance } from '@/lib/locale';

import { NowChip } from './now-chip';
import { StopNode, StopRail, leadOf } from './stop-rail';
import { StopThumb } from './stop-thumb';
import { TransitRow } from './transit-row';

export type StopRowProps = {
  stop: StopWithPlace;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  /** Done, the stop the traveller is at, or to come. */
  state: StopNodeState;
  /** The journey on to the next stop, drawn beneath this one; none where nothing is drawn. */
  transit?: { km: number } | null;
  /** The journey that led here from the stop before; none where the two are one stay. */
  from?: { place: string; km: number } | null;
  /** The thumbnail of the traveller's photograph of this city, if they have one. */
  thumb?: string | null;
  /** This stop is on the day the traveller chose: drawn as a cream tile. */
  highlighted?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onRemove: () => void;
  /** A drag affordance rendered beside the place; omitted when there is nothing to drag. */
  handle?: ReactNode;
  /**
   * A stop in this list is being dragged. The number and the rail come from the row's index in
   * the data, which only follows the drop once it is written back, so while a row is carried
   * they would read 1, 3, 2: the node goes neutral and the rail goes.
   */
  dragging?: boolean;
};

/** Dates are figures: they line up from one stop to the next. */
const TABULAR = { fontVariant: ['tabular-nums' as const] };

/**
 * The card is the stop's own space, not an inset: its 8 dp padding is taken back by a -8 dp
 * margin, so the place and the thumbnail sit exactly where `.stop .body` puts them whether or
 * not the cream tile (the chosen day) or the dashed edge (pending) is drawn around them.
 */
const CARD_BLEED = '-m-2 p-2';

const UP: IconName = 'chevron-up';
const DOWN: IconName = 'chevron-down';
const DATES: IconName = 'calendar';
const REMOVE: IconName = 'trash';

/** A stop whose city is not in the cache yet still has a name a traveller can follow. */
export function describePlace(
  stop: Pick<StopWithPlace, 'city_name' | 'city_id'>,
): string {
  return stop.city_name ?? `City #${stop.city_id}`;
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

/**
 * What the node and the journey draw, said as the row's value after its name: "Now." for the
 * stop the traveller is at and "23 kilometres from Lisbon." for the journey that led here.
 * `undefined` for a stop with neither, so its output is exactly the 004 row's.
 */
function spokenValue({
  state,
  from,
}: Pick<StopRowProps, 'state' | 'from'>): { text: string } | undefined {
  const sentences = [
    state === 'now' ? 'Now.' : null,
    from ? `${formatDistance(from.km).spoken} from ${from.place}.` : null,
  ].filter((sentence) => sentence !== null);
  return sentences.length > 0 ? { text: sentences.join(' ') } : undefined;
}

/** The place, with the "Now" chip beside it and the list's drag handle at the end of the line. */
function StopHeading({
  id,
  place,
  now,
  handle,
}: {
  id: string;
  place: string;
  now: boolean;
  handle?: ReactNode;
}) {
  return (
    <View className="flex-row items-start gap-2">
      <View className="flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Text variant="callout" testID={`stop-place-${id}`}>
          {place}
        </Text>
        {now ? <NowChip stopId={id} /> : null}
      </View>
      {handle}
    </View>
  );
}

function Country({ stop }: { stop: StopWithPlace }) {
  if (!stop.country_name) return null;
  return (
    <View className="flex-row items-center gap-2">
      {stop.country_iso ? (
        <FlagChip iso2={stop.country_iso} testID={`stop-flag-${stop.id}`} />
      ) : null}
      <Text variant="label" tone="muted" className="shrink">
        {stop.country_name}
      </Text>
    </View>
  );
}

function StopText(props: StopRowProps & { place: string; dates: string }) {
  const { stop, place, dates, state, handle } = props;
  const nights = nightsLabel(stopNights(stop));
  return (
    <View className="flex-1 gap-0.5">
      <StopHeading id={stop.id} place={place} now={state === 'now'} handle={handle} />
      <Country stop={stop} />
      <View testID={`stop-meta-${stop.id}`} className="flex-row flex-wrap items-baseline">
        <Text
          variant="label"
          tone="muted"
          style={TABULAR}
          testID={`stop-dates-${stop.id}`}>
          {dates}
        </Text>
        {nights ? (
          <>
            <Text variant="label" tone="muted">
              {' · '}
            </Text>
            <Text variant="label" tone="muted" testID={`stop-nights-${stop.id}`}>
              {nights}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

/** The stop's card: its text and picture, the pending marker and the four controls. */
function StopCard(props: StopRowProps & { place: string; dates: string }) {
  const { stop, place, dates, isFirst, isLast, highlighted } = props;
  return (
    <Card
      variant={highlighted ? 'tile' : 'flat'}
      pending={stop.is_dirty}
      testID={`stop-card-${stop.id}`}
      className={CARD_BLEED}>
      <View className="gap-2">
        <View className="flex-row items-center gap-3">
          <StopText {...props} place={place} dates={dates} />
          <StopThumb
            stopId={stop.id}
            cityId={stop.city_id}
            iso2={stop.country_iso}
            place={place}
            uri={props.thumb}
          />
        </View>
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
  );
}

export function StopRow(props: StopRowProps) {
  const { stop, position, isFirst, isLast, state, transit, from } = props;
  const dragging = props.dragging ?? false;
  const place = describePlace(stop);
  const dates = `${formatIsoDate(stop.arrive_date)} → ${formatIsoDate(stop.depart_date)}`;
  const country = stop.country_name ? `, ${stop.country_name}` : '';

  return (
    <View>
      <View
        testID={`stop-row-${stop.id}`}
        accessible
        accessibilityLabel={`Stop ${position}: ${place}${country}. ${dates}`}
        accessibilityValue={spokenValue(props)}
        accessibilityActions={ROW_ACTIONS}
        onAccessibilityAction={rowActionHandler(props)}
        className="flex-row gap-3">
        <StopRail
          id={stop.id}
          state={state}
          lead={leadOf(isFirst, from)}
          showSpine={!isLast}
          dragging={dragging}>
          <StopNode id={stop.id} state={state} position={position} dragging={dragging} />
        </StopRail>
        <View className="min-w-0 flex-1 pb-3 pt-2">
          <StopCard {...props} place={place} dates={dates} />
        </View>
      </View>
      {dragging || !transit ? null : <TransitRow stopId={stop.id} km={transit.km} />}
    </View>
  );
}
