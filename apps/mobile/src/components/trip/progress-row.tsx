/**
 * `ProgressRow` - the one row beneath the hero (tasks.md T543; contract C5-20; spec FR-038,
 * FR-026, FR-070; screens.md "Trip").
 *
 *   <ProgressRow status={status} dayOf={dayOf} pending={trip.is_dirty}
 *                syncState={sync} onRetry={retry} />
 *
 * Left to right, wrapping at large text instead of clipping (a 36 dp minimum, no height):
 * the derived status chip, "Day 3 of 8" with its dots for an active trip,
 * the per-record marker while the trip only exists on this device and, at the end, the one
 * global sync chip (nothing is drawn when everything is synchronised).
 *
 * It keeps the id `trip-header-row` and the chip's own words. The status chip says "Active",
 * "Planning" or "Past" and nothing more: the Maestro flows assert those as whole strings
 * (`assertVisible: 'Active'`), so "Day 3 of 8" is a sibling text, never inside the chip. The
 * dots are decoration, hidden from assistive technology: the words say the day.
 *
 * It reads what it is given and queries nothing (Constitution I and II).
 */
import { View } from 'react-native';

import { StatusChip } from '@/components/ui/chip';
import { SyncBadge } from '@/components/ui/sync-badge';
import { SyncChip } from '@/components/ui/sync-chip';
import { Text } from '@/components/ui/text';
import type { SyncChipState } from '@/features/sync/use-sync-chip-state';
import {
  progressDots,
  type DayProgress,
  type ProgressDot,
} from '@/features/trips/trip-progress';
import type { TripStatus } from '@/features/trips/trip-status';

export interface ProgressRowProps {
  status: TripStatus;
  /** "Day 3 of 8", for an active trip; `null` when it cannot be computed. */
  dayOf?: DayProgress | null;
  /** The trip itself is not on the server yet (`is_dirty`). */
  pending?: boolean;
  syncState: SyncChipState;
  onRetry?: () => void;
}

const HIDDEN = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/** Literal classes, so Tailwind finds each one: done is filled, today ringed, the rest sand. */
const DOT_CLASS: Record<ProgressDot, string> = {
  done: 'bg-accent-line',
  now: 'border-[1.5px] border-accent-line bg-surface',
  rest: 'border border-border bg-sand',
};

function Dots({ progress }: { progress: DayProgress }) {
  return (
    <View testID="trip-progress-dots" className="flex-row items-center gap-1" {...HIDDEN}>
      {progressDots(progress).map((kind, index) => (
        <View
          key={index}
          testID={`trip-progress-dot-${index}-${kind}`}
          className={`size-1.5 rounded-full ${DOT_CLASS[kind]}`}
        />
      ))}
    </View>
  );
}

function DayOf({ progress }: { progress: DayProgress }) {
  return (
    <View className="flex-row items-center gap-3">
      <Text variant="label" strong testID="trip-progress-day">
        {`Day ${progress.day} of ${progress.of}`}
      </Text>
      <Dots progress={progress} />
    </View>
  );
}

export function ProgressRow({
  status,
  dayOf,
  pending = false,
  syncState,
  onRetry,
}: ProgressRowProps) {
  return (
    <View
      testID="trip-header-row"
      className="min-h-[36px] flex-row flex-wrap items-center gap-x-3 gap-y-2">
      <StatusChip status={status} />
      {status === 'active' && dayOf ? <DayOf progress={dayOf} /> : null}
      {pending ? <SyncBadge state="pending" /> : null}
      {syncState.kind === 'synced' ? null : (
        <View className="ml-auto">
          <SyncChip state={syncState} onRetry={onRetry} />
        </View>
      )}
    </View>
  );
}
