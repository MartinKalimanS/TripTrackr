/**
 * `HomeTools` - the right edge of the Home header (feature 005; UI-SPEC section 4; the
 * prototype's `.h-tools`): the ONE global sync chip and, at its right, the round search button
 * the picture draws. Search is a coming-soon control (owner answer Q-11): a real button whose
 * only effect is the "Search is coming soon" toast, id `coming-soon-search`.
 *
 * The two sit in a row, centred on each other with 8 dp between them (the chip is 36 dp, the
 * disc 44). From a text scale of 1.15 they stack in a column, right-aligned (`data-bigtext`),
 * the chip above the disc, which is also the reading order. When nothing waits to sync the
 * chip draws nothing and the disc stands alone.
 */
import { StyleSheet, View } from 'react-native';

import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { isLargeText } from '@/components/ui/reflow';
import { SyncStatusChip } from '@/components/sync/sync-status';
import { useAppearance } from '@/hooks/use-appearance';
import { Space } from '@/theme';

export function HomeTools() {
  const { fontScale } = useAppearance();
  return (
    <View testID="home-tools" style={isLargeText(fontScale) ? styles.column : styles.row}>
      <SyncStatusChip />
      <ComingSoonButton name="search" label="Search" icon="search" />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Space[2] },
  column: { flexDirection: 'column', alignItems: 'flex-end', gap: Space[2] },
});
