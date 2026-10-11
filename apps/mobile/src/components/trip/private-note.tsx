/**
 * The private-by-default note of the photo screens — tasks.md T117, restyled for Atlas
 * by T442 (FR-028, FR-029; User Story 5; Constitution I).
 *
 * "Private — only you can see your photos." told once above the grid and once in the
 * photo view, so the posture is never an assumption. A lock icon (decorative) leads the
 * words; the words wrap at the largest text size beside it.
 *
 * Visibility posture: private. The note offers nothing to share or publish — per-photo
 * visibility is User Story 7.
 */
import { View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { PRIVATE_COPY } from '@/features/photos/photo-copy';

const LOCK: IconName = { ios: 'lock', android: 'lock' };

export function PrivateNote() {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name={LOCK} size={16} tone="muted" />
      <Text type="callout" tone="muted" className="shrink">
        {PRIVATE_COPY}
      </Text>
    </View>
  );
}
