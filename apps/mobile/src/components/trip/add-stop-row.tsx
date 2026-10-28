/**
 * `AddStopRow` - "Add stop" as a dashed row at the end of the timeline (tasks.md T545; contract
 * C5-20; spec FR-041; feature 004 FR-013).
 *
 *   <AddStopRow onPress={openAdd} />
 *
 * One control, id `trip-add-stop`, named "Add stop": the id and the name the Maestro flows and
 * the 004 screen had. A 2 dp dashed outline in the `border` token (the 3:1 line colour, so it
 * is identifiable as a control by its edge and its words), a plus and the label, at least 52 dp
 * tall and growing with the text. It is inline at the end of the timeline, not a floating
 * button: nothing on this screen hovers over the stops. It is NOT a primary: a trip with stops
 * has no primary control (a trip with none has the one primary of its empty state).
 */
import { StyleSheet } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { Space, cornerOf } from '@/theme';

export interface AddStopRowProps {
  onPress: () => void;
}

const PLUS: IconName = 'plus';
const MIN_HEIGHT = 52;
const COLOR_KEYS = ['border'] as const;

export function AddStopRow({ onPress }: AddStopRowProps) {
  const colors = useColors(COLOR_KEYS);
  return (
    <Tappable
      testID="trip-add-stop"
      accessibilityLabel="Add stop"
      onPress={onPress}
      style={[styles.row, cornerOf('lg'), { borderColor: colors.border }]}>
      <Icon name={PLUS} size={20} tone="ink" />
      <Text variant="callout">Add stop</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: {
    marginTop: Space[1],
    minHeight: MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space[2],
    borderWidth: 2,
    borderStyle: 'dashed',
  },
});
