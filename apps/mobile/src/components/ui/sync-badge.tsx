/**
 * Pending-synchronisation marker — contract C11, FR-007.
 *
 * Why a styling feature ships this component: Constitution Principle II forbids
 * presenting a record as saved before its bytes have landed. A visual language
 * built entirely out of "soft, settled, finished" surfaces will imply exactly
 * that unless something explicitly says otherwise.
 *
 * This reflects state the caller owns. It does not query, compute, or influence
 * synchronisation — that boundary is the whole reason it is safe for a
 * presentation layer to show it.
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAppearance } from '@/hooks/use-appearance';

export type SyncState = 'pending' | 'syncing' | 'failed';

export type SyncBadgeProps = {
  state: SyncState;
};

/**
 * Each state carries an icon AND a message. Neither is decoration: FR-010
 * forbids conveying state by hue alone, and a traveller checking whether their
 * note is safe should not have to distinguish two similar greys.
 */
const PRESENTATION: Record<SyncState, { icon: string; label: string; announce: string }> =
  {
    pending: { icon: '○', label: 'Not yet synced', announce: 'Sync pending' },
    syncing: { icon: '◐', label: 'Syncing', announce: 'Sync in progress' },
    failed: { icon: '△', label: 'Sync failed', announce: 'Sync failed' },
  };

export function SyncBadge({ state }: SyncBadgeProps) {
  const { theme } = useAppearance();
  const palette = Colors[theme];
  const { icon, label, announce } = PRESENTATION[state];

  const tint = state === 'failed' ? palette.danger : palette.accent;

  return (
    <View
      accessibilityLabel={announce}
      accessibilityRole="text"
      style={[styles.badge, { borderColor: tint }]}>
      <ThemedText testID="sync-badge-icon" type="small" style={{ color: tint }}>
        {icon}
      </ThemedText>
      <ThemedText type="small" style={{ color: tint }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
