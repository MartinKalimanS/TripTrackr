/**
 * One stop in the trip's ordered list — tasks.md T068 (FR-010, FR-012).
 *
 * Reordering is explicit "Move up" / "Move down" controls rather than a drag
 * handle: they work one-handed, with a screen reader, with a switch, and
 * under every appearance adaptation. The same four actions are also exposed
 * as `accessibilityActions`, so an assistive-technology user can act on the
 * row itself without hunting for the small buttons.
 */
import { StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { SyncBadge } from '@/components/ui/sync-badge';
import { Spacing } from '@/constants/theme';
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
};

/** A stop whose city is not in the cache yet still has a name a traveller can follow. */
export function describePlace(
  stop: Pick<StopWithPlace, 'city_name' | 'city_id'>,
): string {
  return stop.city_name ?? `City #${stop.city_id}`;
}

export function StopRow({
  stop,
  position,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onEdit,
  onRemove,
}: StopRowProps) {
  const place = describePlace(stop);
  const dates = `${formatIsoDate(stop.arrive_date)} → ${formatIsoDate(stop.depart_date)}`;

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
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

  return (
    <Surface
      treatment="raised"
      depth={1}
      radius="lg"
      testID={`stop-row-${stop.id}`}
      accessible
      accessibilityLabel={`Stop ${position}: ${place}${stop.country_name ? `, ${stop.country_name}` : ''}. ${dates}`}
      accessibilityActions={[
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
        { name: 'edit', label: 'Edit dates' },
        { name: 'delete', label: 'Remove stop' },
      ]}
      onAccessibilityAction={onAccessibilityAction}
      style={styles.row}>
      <View style={styles.main}>
        <ThemedText type="small" themeColor="textMuted">
          Stop {position}
        </ThemedText>
        <ThemedText type="default" style={styles.place}>
          {place}
        </ThemedText>
        {stop.country_name ? (
          <ThemedText type="small" themeColor="textMuted">
            {stop.country_name}
          </ThemedText>
        ) : null}
        <ThemedText type="small" testID={`stop-dates-${stop.id}`}>
          {dates}
        </ThemedText>
        {stop.is_dirty ? <SyncBadge state="pending" /> : null}
      </View>

      <View style={styles.actions}>
        <PressableSurface
          testID={`stop-move-up-${stop.id}`}
          accessibilityLabel={`Move ${place} up`}
          treatment="flat"
          radius="sm"
          disabled={isFirst}
          onPress={onMoveUp}
          style={styles.action}>
          <ThemedText type="smallBold">↑</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID={`stop-move-down-${stop.id}`}
          accessibilityLabel={`Move ${place} down`}
          treatment="flat"
          radius="sm"
          disabled={isLast}
          onPress={onMoveDown}
          style={styles.action}>
          <ThemedText type="smallBold">↓</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID={`stop-edit-${stop.id}`}
          accessibilityLabel={`Edit dates for ${place}`}
          treatment="flat"
          radius="sm"
          onPress={onEdit}
          style={styles.action}>
          <ThemedText type="smallBold">Dates</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID={`stop-remove-${stop.id}`}
          accessibilityLabel={`Remove ${place}`}
          treatment="flat"
          radius="sm"
          onPress={onRemove}
          style={styles.action}>
          <ThemedText type="smallBold" themeColor="danger">
            Remove
          </ThemedText>
        </PressableSurface>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  main: {
    gap: Spacing.half,
    alignItems: 'flex-start',
  },
  place: {
    fontWeight: 600,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
