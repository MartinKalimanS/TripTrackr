/**
 * Where a photo's bytes are, when they are not yet safe — tasks.md T117, restyled for
 * Atlas by T442 (FR-025, FR-029, FR-030, FR-034, FR-041; Constitution II; feature 002
 * FR-007, FR-010).
 *
 * A photo is not "saved" until its bytes have uploaded, so a photo still on this device
 * alone says so, and a photo whose upload failed says THAT: a different word, a
 * different glyph and a different edge, never a different hue alone. Both are announced
 * as the words they show. This is the photo's own counterpart of `SyncBadge`, whose
 * "Not yet synced" would be the wrong words for a picture that has not left the phone,
 * so it is drawn the same way (a capsule: an icon, the words, the `pending` ink on its
 * 15% soft fill, or the `danger` ink for a failure; the pairs the contrast gate
 * measures) with the photo's own words and its own two icons. Pending is dashed, like
 * every pending marker, and a failure is solid.
 *
 * The caption sits BELOW the picture in the tile, never over it (FR-033). It hugs its
 * content and wraps at the largest text size instead of clipping or pushing past the
 * tile's edge.
 *
 * The retry is a `Button`: secondary beside the status in the photo view, and a text
 * button under a failed tile in the grid, where a tonal fill per tile would shout.
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName, type IconTone } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { GALLERY_COPY, UPLOAD_STATE_COPY } from '@/features/photos/photo-copy';

export type PhotoStatus = 'pending' | 'failed';

interface StatusLook {
  icon: IconName;
  tone: IconTone;
  /** Literal classes, so Tailwind finds them: the ink, then the edge and the 15% fill. */
  ink: string;
  box: string;
}

const LOOK: Record<PhotoStatus, StatusLook> = {
  pending: {
    icon: { ios: 'icloud.and.arrow.up', android: 'cloud_upload' },
    tone: 'pending',
    ink: 'text-pending',
    box: 'border-dashed border-pending bg-pending/15',
  },
  failed: {
    icon: { ios: 'exclamationmark.triangle', android: 'warning' },
    tone: 'danger',
    ink: 'text-danger',
    box: 'border-solid border-danger bg-danger/15',
  },
};

const CAPSULE = 'flex-row items-center self-start gap-1 rounded-full border px-2 py-0.5';

const RETRY: IconName = { ios: 'arrow.clockwise', android: 'refresh' };

export function PhotoStatusBadge({ status }: { status: PhotoStatus }) {
  const { icon, tone, ink, box } = LOOK[status];
  const label = UPLOAD_STATE_COPY[status].badge;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      className={`${CAPSULE} ${box}`}>
      <Icon testID="photo-status-icon" name={icon} size={16} tone={tone} />
      <Text type="caption" className={`shrink ${ink}`}>
        {label}
      </Text>
    </View>
  );
}

export type PhotoRetryButtonProps = {
  /** A local write: puts the photo back in the upload queue. */
  onPress: () => void;
  /** Under a tile in the grid: a text button with no icon, narrow enough for a tile. */
  compact?: boolean;
};

/** Puts a failed photo back in the upload queue. */
export function PhotoRetryButton({ onPress, compact = false }: PhotoRetryButtonProps) {
  return (
    <Button
      variant={compact ? 'text' : 'secondary'}
      size="sm"
      icon={compact ? undefined : RETRY}
      accessibilityLabel={GALLERY_COPY.retryLabel}
      onPress={onPress}
      className="self-start">
      {GALLERY_COPY.retryText}
    </Button>
  );
}
