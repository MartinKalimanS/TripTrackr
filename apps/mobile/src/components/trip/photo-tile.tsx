/**
 * One photograph on a day's mosaic — tasks.md T117, restyled by T442 (Atlas) and T549 (Sunrise
 * Passport; FR-041, FR-045; research D-23, D-27, D5-09; pictures `more/photos*.png`; prototype
 * `.pt`, `.ub`, `.fl`, `.mo`).
 *
 * The tile draws the LOCAL THUMBNAIL, never the full image (Acceptance Scenario 5.6): a grid of
 * full-size photographs is how a gallery runs a phone out of memory. `recyclingKey` blanks the
 * view when `FlashList` reuses a row for other photographs, and `transition={0}` draws the new
 * one at once. The photograph is a hairline `MediaFrame` (a near-white photograph on the light
 * canvas needs an edge), filling its frame at full fidelity: no tint, no shadow, no opacity.
 *
 * Where it sits and how big it is comes from the mosaic (`frame`, from `features/photos/photo-
 * mosaic.ts`); the tile is `absolute` in it. What the tile says of the photograph's bytes is
 * drawn as the pictures draw it, in an icon and a word and not a hue alone, and the tile's name
 * says it in words (`photoLabel`):
 *   - waiting to upload: the dashed cloud disc at the bottom end (`UploadBadge`);
 *   - uploaded a moment ago from this device: the tick disc (`isJustSynced`); older ones carry
 *     nothing, a tile with no mark is a safe photograph;
 *   - failed: a scrim over the whole tile and the solid "Retry" pill (`FailedRetryPill`), a
 *     control of its own beside the open button, never nested in it;
 *   - `more`: the `+N` tile. A scrim over the whole tile (the dark button scrim and the bottom
 *     one) and the count in white; pressing it shows the whole day instead of opening the photo.
 * Those marks are the pictured exception to the 004 "no overlay" rule; the photograph itself is
 * never tinted anywhere else. A photograph with no file here, or whose thumbnail will not draw,
 * is a placeholder that says so.
 *
 * The open button is one `Tappable` named by `photoLabel`, with `feedback="ring"`: a held press
 * and focus are a ring drawn OUTSIDE the tile, because a fill behind an opaque thumbnail would
 * show nowhere and one over it would be a tint.
 *
 * Visibility posture: private. A tile has no share or public control.
 */
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  FailedRetryPill,
  UploadBadge,
  type UploadBadgeKind,
} from '@/components/trip/photo-status';
import { MediaFrame } from '@/components/ui/media-frame';
import { Scrim } from '@/components/ui/scrim';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { useColors } from '@/components/ui/theme-tokens';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { GALLERY_COPY } from '@/features/photos/photo-copy';
import { thumbnailUri } from '@/features/photos/photo-files';
import { photoLabel } from '@/features/photos/photo-labels';
import type { Frame } from '@/features/photos/photo-mosaic';
import { isJustSynced } from '@/features/photos/upload-summary';
import { cornerOf } from '@/theme';

export interface MoreTile {
  /** The number on the tile: how many photographs the day has that are not shown yet. */
  count: number;
  /** Its name for a screen reader: "9 more photos from Wednesday 14 October". */
  label: string;
}

export type PhotoTileProps = {
  photo: PhotoWithPlace;
  frame: Frame;
  /** The time the marks are judged at (a tick lasts a few minutes). */
  now: number;
  /** Makes this the `+N` tile. */
  more?: MoreTile;
  onOpen: (photo: PhotoWithPlace) => void;
  onRetry: (photo: PhotoWithPlace) => void;
  /** Pressing the `+N` tile. */
  onMore?: () => void;
};

function Placeholder() {
  return (
    <View className="flex-1 items-center justify-center bg-surface p-1">
      <Text type="caption" tone="muted" className="text-center">
        {GALLERY_COPY.noPreview}
      </Text>
    </View>
  );
}

/** The local thumbnail, or the placeholder when there is none or it will not draw. */
function TileImage({ photo }: { photo: PhotoWithPlace }) {
  const [undrawable, setUndrawable] = useState(false);
  const uri = thumbnailUri(photo.local_file_uri);

  if (!uri || undrawable) return <Placeholder />;
  return (
    <Image
      testID={`photo-thumbnail-${photo.id}`}
      source={{ uri }}
      recyclingKey={photo.id}
      contentFit="cover"
      transition={0}
      onError={() => setUndrawable(true)}
      style={StyleSheet.absoluteFill}
    />
  );
}

const SCRIM_KEYS = ['scrimButton'] as const;

/** A scrim over the whole tile: a failed photograph, and the `+N` tile. Takes no touch. */
function TileScrim({ children }: { children?: ReactNode }) {
  const { scrimButton } = useColors(SCRIM_KEYS);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.centred, { backgroundColor: scrimButton }]}>
      {children}
    </View>
  );
}

function MoreCount({ count }: { count: number }) {
  return (
    <TileScrim>
      <Scrim kind="bottom" />
      <Text
        testID="photo-more-count"
        variant="headline"
        tone="onPhoto"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}>
        {`+${count}`}
      </Text>
    </TileScrim>
  );
}

function badgeOf(photo: PhotoWithPlace, now: number): UploadBadgeKind | null {
  if (photo.upload_state === 'pending') return 'queued';
  return isJustSynced(photo, now) ? 'synced' : null;
}

export function PhotoTile({
  photo,
  frame,
  now,
  more,
  onOpen,
  onRetry,
  onMore,
}: PhotoTileProps) {
  const failed = photo.upload_state === 'failed';
  const badge = more ? null : badgeOf(photo, now);

  return (
    <View testID={`photo-tile-${photo.id}`} style={[styles.tile, frame]}>
      <Tappable
        testID={`photo-open-${photo.id}`}
        accessibilityLabel={more ? more.label : photoLabel(photo)}
        accessibilityHint={more ? undefined : GALLERY_COPY.openHint}
        feedback="ring"
        onPress={() => (more && onMore ? onMore() : onOpen(photo))}
        style={styles.open}>
        <MediaFrame
          testID={`photo-frame-${photo.id}`}
          radius="md"
          style={StyleSheet.absoluteFill}>
          <TileImage photo={photo} />
          {failed ? <TileScrim /> : null}
          {more ? <MoreCount count={more.count} /> : null}
        </MediaFrame>
        {badge ? <UploadBadge kind={badge} /> : null}
      </Tappable>
      {failed && !more ? <FailedRetryPill onPress={() => onRetry(photo)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { position: 'absolute' },
  // The control's corner is the frame's (a photograph's 16 dp), so the ring follows the
  // picture; it fills the tile, whatever its minimum touch height.
  open: {
    ...cornerOf('lg'),
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    bottom: 0,
    minHeight: 0,
  },
  centred: { alignItems: 'center', justifyContent: 'center' },
});
