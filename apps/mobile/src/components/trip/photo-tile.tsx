/**
 * One photo in the gallery grid — tasks.md T117, restyled for Atlas by T442 (FR-028,
 * FR-041; research D-23, D-27; 004 FR-015, FR-019, FR-024 to FR-026, FR-033, FR-034,
 * FR-037; contract C4-10 rule 9).
 *
 * The tile draws the LOCAL THUMBNAIL, never the full image (Acceptance Scenario 5.6): a
 * grid of full-size photos is how a gallery runs a phone out of memory. `recyclingKey`
 * blanks the view when `FlashList` reuses a row for other photos, so a recycled tile
 * never shows the previous photo while the new one loads, and `transition={0}` draws the
 * new one at once, with no fade.
 *
 * Nothing is laid across the picture (FR-033, 002 C12). The photo is a `MediaFrame`: a
 * hairline on every photograph, whatever its tone (a near-white photo on the light canvas
 * needs an edge), no fill, no shadow, no opacity, and nothing else inside it. Its parents
 * are the control and the tile, which paint nothing either: the control shows a held
 * press and focus as a RING drawn outside it (`feedback="ring"`), because a pressed fill
 * behind an opaque thumbnail would show nowhere and one over it would be a tint.
 *
 * The photo and its caption are ONE button whose name says when, where and whether its
 * bytes have arrived (`photoLabel`). A photo still on this device alone, or one whose
 * upload failed, carries a caption in words below the picture (`PhotoStatusBadge`: an
 * icon, the words, a dashed or solid edge); the retry for a failed one is its own control
 * beside the button, not nested inside it. A photo with no file here, or whose thumbnail
 * will not draw, is a placeholder that says so.
 *
 * A tile has no chevron: a cue laid on a thumbnail would be an overlay (FR-033), and the
 * picture is itself the thing to open. At the largest text size the grid has fewer, wider
 * tiles (`photo-grid.ts`), and the caption wraps.
 *
 * Visibility posture: private. A tile has no share or public control.
 */
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PhotoRetryButton, PhotoStatusBadge } from '@/components/trip/photo-status';
import { MediaFrame } from '@/components/ui/media-frame';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { GALLERY_COPY } from '@/features/photos/photo-copy';
import { thumbnailUri } from '@/features/photos/photo-files';
import { TILE_GAP } from '@/features/photos/photo-grid';
import { photoLabel } from '@/features/photos/photo-labels';
import { cornerStyle } from '@/theme';

export type PhotoTileProps = {
  photo: PhotoWithPlace;
  onOpen: (photo: PhotoWithPlace) => void;
  onRetry: (photo: PhotoWithPlace) => void;
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

export function PhotoTile({ photo, onOpen, onRetry }: PhotoTileProps) {
  const status = photo.upload_state;

  return (
    <View testID={`photo-tile-${photo.id}`} className="flex-1 gap-1">
      <Tappable
        testID={`photo-open-${photo.id}`}
        accessibilityLabel={photoLabel(photo)}
        accessibilityHint={GALLERY_COPY.openHint}
        feedback="ring"
        onPress={() => onOpen(photo)}
        className="gap-1"
        style={styles.open}>
        <MediaFrame testID={`photo-frame-${photo.id}`} radius="md" style={styles.frame}>
          <TileImage photo={photo} />
        </MediaFrame>
        {status !== 'uploaded' ? <PhotoStatusBadge status={status} /> : null}
      </Tappable>
      {status === 'failed' ? (
        <PhotoRetryButton compact onPress={() => onRetry(photo)} />
      ) : null}
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
  // The control's corner is the frame's (a photograph's 16 dp), so the ring follows the
  // picture; the content starts at the top rather than centred in the minimum target.
  open: { ...cornerStyle('lg'), justifyContent: 'flex-start' },
  frame: { aspectRatio: 1 },
});
