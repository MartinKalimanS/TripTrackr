/**
 * Trip lifecycle pill — FR-013, presented per feature 002 FR-010: text and an
 * icon carry the state; the tint is reinforcement, never the only signal.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { STATUS_PRESENTATION, type TripStatus } from '@/features/trips/trip-status';
import { useAppearance } from '@/hooks/use-appearance';

export type StatusPillProps = {
  status: TripStatus;
};

export function StatusPill({ status }: StatusPillProps) {
  const { theme } = useAppearance();
  const palette = Colors[theme];
  const { label, icon } = STATUS_PRESENTATION[status];
  const tint = status === 'active' ? palette.accent : palette.textMuted;

  return (
    <View
      testID={`status-pill-${status}`}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={[styles.pill, { borderColor: tint }]}>
      <ThemedText type="small" style={{ color: tint }}>
        {icon}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color: tint }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
