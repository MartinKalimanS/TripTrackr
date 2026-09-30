/**
 * One photo in the gallery grid — tasks.md T117 (FR-028, FR-041; research D-23,
 * D-27; feature 002 FR-010, FR-011, FR-024, FR-026).
 *
 * The tile draws the LOCAL THUMBNAIL, never the full image (Acceptance
 * Scenario 5.6): a grid of full-size photos is how a gallery runs a phone out
 * of memory. `recyclingKey` blanks the view when `FlashList` reuses a row for
 * other photos, so a recycled tile never shows the previous photo while the
 * new one loads.
 *
 * The photo is a `MediaFrame` — the style frames it and casts nothing across
 * it — inside one button whose label says when, where and whether its bytes
 * have arrived. A photo still on this device alone, or one whose upload
 * failed, carries a caption in words (`PhotoStatusBadge`); the retry for a
 * failed one is its own control beside the button, not nested inside it.
 * A photo with no file here, or whose thumbnail will not draw, is a
 * placeholder that says so.
 *
 * Visibility posture: private. A tile has no share or public control.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PhotoRetryButton, PhotoStatusBadge } from '@/components/trip/photo-status';
import { MediaFrame } from '@/components/ui/media-frame';
import { Spacing } from '@/constants/theme';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { GALLERY_COPY } from '@/features/photos/photo-copy';
import { thumbnailUri } from '@/features/photos/photo-files';
import { TILE_GAP } from '@/features/photos/photo-grid';
import { photoLabel } from '@/features/photos/photo-labels';
import { useAppearance } from '@/hooks/use-appearance';

/** The focus / press ring, thicker than the hairline frame (feature 002 FR-012). */
const RING_WIDTH = 2;

export type PhotoTileProps = {
  photo: PhotoWithPlace;
  onOpen: (photo: PhotoWithPlace) => void;
  onRetry: (photo: PhotoWithPlace) => void;
};

function Placeholder() {
  const { tokens } = useAppearance();
  return (
    <View style={[styles.placeholder, { backgroundColor: tokens.surfaceSunk }]}>
      <ThemedText type="small" themeColor="textMuted" style={styles.placeholderText}>
        {GALLERY_COPY.noPreview}
      </ThemedText>
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
      onError={() => setUndrawable(true)}
      style={StyleSheet.absoluteFill}
    />
  );
}

export function PhotoTile({ photo, onOpen, onRetry }: PhotoTileProps) {
  const { tokens } = useAppearance();
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);

  const status = photo.upload_state;
  const ring = focused || pressed;

  return (
    <View testID={`photo-tile-${photo.id}`} style={styles.tile}>
      <Pressable
        testID={`photo-open-${photo.id}`}
        accessibilityRole="button"
        accessibilityLabel={photoLabel(photo)}
        accessibilityHint={GALLERY_COPY.openHint}
        onPress={() => onOpen(photo)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={styles.open}>
        <MediaFrame
          testID={`photo-frame-${photo.id}`}
          radius="md"
          style={[
            styles.frame,
            ring && { borderWidth: RING_WIDTH, borderColor: tokens.accent },
          ]}>
          <TileImage photo={photo} />
        </MediaFrame>
        {status !== 'uploaded' ? <PhotoStatusBadge status={status} /> : null}
      </Pressable>
      {status === 'failed' ? <PhotoRetryButton onPress={() => onRetry(photo)} /> : null}
    </View>
  );
}

export type PhotoGridRowProps = {
  photos: readonly PhotoWithPlace[];
  columns: number;
  onOpen: (photo: PhotoWithPlace) => void;
  onRetry: (photo: PhotoWithPlace) => void;
};

/**
 * One row of the grid. `FlashList` recycles rows, and a row of tiles recycles
 * as well as a single tile (photo-grid.ts). A short last row is padded with
 * empty cells so its tiles keep the width of the rows above.
 */
export function PhotoGridRow({ photos, columns, onOpen, onRetry }: PhotoGridRowProps) {
  const padding = Math.max(0, columns - photos.length);
  return (
    <View style={styles.row}>
      {photos.map((photo) => (
        // Keyed by photo, so a recycled row remounts its tiles and a tile's
        // "did not draw" never follows the row to different photos.
        <PhotoTile key={photo.id} photo={photo} onOpen={onOpen} onRetry={onRetry} />
      ))}
      {Array.from({ length: padding }, (_, index) => (
        <View key={`padding-${index}`} style={styles.cell} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: TILE_GAP },
  cell: { flex: 1 },
  tile: { flex: 1, gap: Spacing.one },
  open: { gap: Spacing.one },
  frame: { aspectRatio: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.one,
  },
  placeholderText: { textAlign: 'center' },
});
