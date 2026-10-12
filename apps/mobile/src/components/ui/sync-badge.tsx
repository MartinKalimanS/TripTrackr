/**
 * Pending-synchronisation marker - contract C11 (002), FR-007; restyled for Atlas by
 * T421 (contract C4-8; FR-025, FR-029, FR-030, FR-034; review rules 3 and 5).
 *
 * Why a styling feature ships this component: Constitution Principle II forbids
 * presenting a record as saved before its bytes have landed. A visual language
 * built entirely out of "soft, settled, finished" surfaces will imply exactly
 * that unless something explicitly says otherwise.
 *
 * This reflects state the caller owns. It does not query, compute, or influence
 * synchronisation - that boundary is the whole reason it is safe for a
 * presentation layer to show it.
 *
 * What it announces and the ids it carries are stable (e2e flows and tests read them): the badge is a text node named
 * "Sync pending", "Sync in progress" or "Sync failed" (what assistive technology and the
 * tests read), its icon is `sync-badge-icon`, and the visible words ("Not yet synced",
 * "Syncing", "Sync failed") are what the Maestro flows look for.
 *
 * The look is a small kit-Chip-like capsule: an icon and the words, the `pending` ink on
 * its 15% soft fill for a record that is waiting or on its way, the `danger` ink for one
 * that failed. Both pairs are exactly what the contrast gate measures on every neutral
 * fill (C4-3); the fill is NEVER the kit's 20% soft hover (rule 5). It stays dashed, like
 * every other pending marker, so the state is a shape and a glyph as well as a hue
 * (FR-025). Each state has its own icon.
 *
 * Layout: it hugs its content (`self-start`) instead of stretching across a column, and
 * grows with the text size; nothing about it is fixed.
 */
import { View } from 'react-native';

import { Icon, type IconName, type IconTone } from './icon';
import { Text } from './text';

export type SyncState = 'pending' | 'syncing' | 'failed';

export type SyncBadgeProps = {
  state: SyncState;
};

interface Presentation {
  icon: IconName;
  label: string;
  announce: string;
  tone: IconTone;
  /** Literal classes, so Tailwind finds them: the ink, then the edge and the 15% fill. */
  ink: string;
  box: string;
}

/**
 * Each state carries an icon AND a message. Neither is decoration: FR-025
 * forbids conveying state by hue alone, and a traveller checking whether their
 * note is safe should not have to distinguish two similar violets.
 */
const PRESENTATION: Record<SyncState, Presentation> = {
  pending: {
    icon: 'clock',
    label: 'Not yet synced',
    announce: 'Sync pending',
    tone: 'pending',
    ink: 'text-pending',
    box: 'border-pending bg-pending/15',
  },
  syncing: {
    icon: 'sync',
    label: 'Syncing',
    announce: 'Sync in progress',
    tone: 'pending',
    ink: 'text-pending',
    box: 'border-pending bg-pending/15',
  },
  failed: {
    icon: 'alert',
    label: 'Sync failed',
    announce: 'Sync failed',
    tone: 'danger',
    ink: 'text-danger',
    box: 'border-danger bg-danger/15',
  },
};

const CAPSULE =
  'flex-row items-center self-start gap-1 rounded-full border border-dashed px-2 py-0.5';

export function SyncBadge({ state }: SyncBadgeProps) {
  const { icon, label, announce, tone, ink, box } = PRESENTATION[state];

  return (
    <View
      accessibilityLabel={announce}
      accessibilityRole="text"
      className={`${CAPSULE} ${box}`}>
      <Icon testID="sync-badge-icon" name={icon} size={16} tone={tone} />
      <Text type="caption" className={ink}>
        {label}
      </Text>
    </View>
  );
}
