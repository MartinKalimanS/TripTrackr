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
 *
 * On a mosaic tile (feature 005, T549; FR-045; `photos.png`) the state is drawn ON the
 * thumbnail as the pictures draw it: `UploadBadge` is the 28 dp disc at the tile's bottom
 * end (a dashed ring and a cloud for a photograph waiting to upload, a tick for one that
 * just arrived) and `FailedRetryPill` the solid danger pill with the alert glyph and the word
 * "Retry". The glyph and the word carry the state, never the hue alone; the tile's own name
 * says it in full (`photoLabel`). The disc and the pill are a deliberate, pictured exception
 * to the 004 rule of no overlay on a thumbnail (UI-SPEC 9.2 still says no TINT: the scrim of
 * a failed tile and of the `+N` tile are the pictured ones).
 */
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon, type IconName, type IconTone } from '@/components/ui/icon';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import { GALLERY_COPY, UPLOAD_STATE_COPY } from '@/features/photos/photo-copy';
import { Radii, Space } from '@/theme';

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
    icon: 'cloud-upload',
    tone: 'pending',
    ink: 'text-pending',
    box: 'border-dashed border-pending bg-pending/15',
  },
  failed: {
    icon: 'alert',
    tone: 'danger',
    ink: 'text-danger',
    box: 'border-solid border-danger bg-danger/15',
  },
};

const CAPSULE = 'flex-row items-center self-start gap-1 rounded-full border px-2 py-0.5';

const RETRY: IconName = 'refresh';

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

/** The badge's disc, from the prototype's `.ub`: 28 dp, 8 dp from the tile's bottom end. */
const BADGE = 28;
const BADGE_KINDS = {
  queued: { icon: 'cloud-upload' },
  synced: { icon: 'check' },
} as const satisfies Record<string, { icon: IconName }>;

export type UploadBadgeKind = keyof typeof BADGE_KINDS;

const COLOR_KEYS = [
  'scrimButton',
  'scrimButtonLine',
  'onPhoto',
  'danger',
  'dangerInk',
] as const;

/**
 * The state of a photograph on its mosaic tile: a `scrimButton` disc with a white glyph, a
 * dashed ring for one still to upload (the cloud), a tick for one that just arrived. Decorative:
 * the tile's own name says the state in words, so this is hidden from assistive technology.
 */
export function UploadBadge({ kind }: { kind: UploadBadgeKind }) {
  const colors = useColors(COLOR_KEYS);
  const { icon } = BADGE_KINDS[kind];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        position: 'absolute',
        end: Space[2],
        bottom: Space[2],
        width: BADGE,
        height: BADGE,
        borderRadius: Radii.full,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.scrimButton,
        borderWidth: 1,
        borderColor: colors.scrimButtonLine,
        ...(kind === 'queued'
          ? {
              outlineWidth: 1.5,
              outlineStyle: 'dashed',
              outlineColor: colors.onPhoto,
              outlineOffset: -3,
            }
          : null),
      }}>
      <Icon
        testID={kind === 'queued' ? 'photo-status-icon' : 'photo-synced-icon'}
        name={icon}
        size={16}
        tone="onPhoto"
      />
    </View>
  );
}

/**
 * "Retry" on a failed tile: a solid danger pill with the alert glyph and the word, 8 dp in from
 * the tile's sides and bottom, at least 32 dp tall with a 44 dp touch target. It is a control of
 * its own, beside the tile's open button and never inside it. A held press draws the focus ring
 * and no fill (`feedback="ring"`).
 */
export function FailedRetryPill({ onPress }: { onPress: () => void }) {
  const colors = useColors(COLOR_KEYS);

  return (
    <Tappable
      accessibilityLabel={GALLERY_COPY.retryLabel}
      feedback="ring"
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      style={{
        position: 'absolute',
        start: Space[2],
        end: Space[2],
        bottom: Space[2],
        minHeight: 32,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Space[1],
        borderRadius: Radii.full,
        backgroundColor: colors.danger,
      }}>
      <Icon testID="photo-status-icon" name="alert" size={16} tone="dangerInk" />
      <Text variant="caption" capped style={{ color: colors.dangerInk }}>
        {GALLERY_COPY.tileRetryText}
      </Text>
    </Tappable>
  );
}
