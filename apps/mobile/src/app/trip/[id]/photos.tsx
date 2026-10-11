/**
 * A trip's photo gallery — tasks.md T117, restyled for Atlas by T442 (FR-028, FR-029,
 * FR-041; User Story 5, Acceptance Scenarios 1, 2, 5, 6; Constitution II; 004 FR-007,
 * FR-008, FR-015, FR-021, FR-033, FR-035, FR-037; contract C4-10, C4-11); research D-23,
 * D-27, D-34.
 *
 * Read from and written to the encrypted local store: the grid is a live
 * query, so a capture appears the moment SQLite commits it — as a thumbnail
 * that says "Waiting to upload" until its bytes have arrived. The grid is a
 * `FlashList` through `ListScreen` (D-23) whose rows each hold a few
 * thumbnails (photo-grid.ts: how many follows the width AND the text size).
 * Opening a photo shows the full image, where it is filed and where its bytes
 * are (`PhotoViewer`); "Add photos" and "Take a photo" are the two ways in
 * (use-capture.ts). Focusing the gallery tries the trip's pending uploads
 * (`usePhotoUploads`).
 *
 * Under a native header (`_layout.tsx`: the title "Photos" and the `HeaderBackButton`), so
 * the list is `underHeader` and the screen draws no bar or Back of its own; the block
 * above the grid opens with the trip's name (`photos-title`). Every state is designed
 * (C4-10 rule 2): skeleton tiles with the grid's own column count while the store has not
 * answered (never the empty state), words, an icon and "Try again" when it failed, and
 * for no photos a sentence that names the next step, with both ways in just above it.
 * "Try again" reads the photos again: the gallery is remounted, which asks the live query
 * afresh (the store is local, so there is nothing to wait on but the read itself).
 *
 * Visibility posture: every photo is private and nothing on this screen
 * offers to change that — per-photo visibility is User Story 7.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { PhotosHeader } from '@/components/trip/photos-header';
import { PhotoGridRow } from '@/components/trip/photo-tile';
import { PhotoViewer } from '@/components/trip/photo-viewer';
import { GridSkeleton } from '@/components/ui/grid-skeleton';
import type { IconName } from '@/components/ui/icon';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { GALLERY_COPY, PHOTO_COPY } from '@/features/photos/photo-copy';
import { gridColumns, toRows } from '@/features/photos/photo-grid';
import { useCapture } from '@/features/photos/use-capture';
import {
  usePhotoActions,
  usePhotos,
  usePhotoUploads,
} from '@/features/photos/use-photos';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

const PHOTOS: IconName = { ios: 'photo.on.rectangle', android: 'photo_library' };

const NO_PHOTOS: readonly PhotoWithPlace[] = [];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Tiles per row: the width `ListScreen` leaves for the list, at the traveller's text size. */
function useGridColumns(): number {
  const { width, fontScale } = useWindowDimensions();
  const listWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  return gridColumns(listWidth, fontScale);
}

type PhotosEmptyProps = {
  photos: LiveResult<PhotoWithPlace[]>;
  columns: number;
  onReread: () => void;
};

/** What the grid shows instead of tiles: the one state that applies. The error comes first. */
function PhotosEmpty({ photos, columns, onReread }: PhotosEmptyProps) {
  if (photos.error) {
    return (
      <ErrorState
        title={GALLERY_COPY.readFailedTitle}
        detail={GALLERY_COPY.readFailedDetail}
        onRetry={onReread}
      />
    );
  }
  if (photos.loading) {
    return <GridSkeleton columns={columns} label={GALLERY_COPY.loading} />;
  }
  return (
    <EmptyState
      title={GALLERY_COPY.emptyTitle}
      detail={GALLERY_COPY.emptyDetail}
      icon={PHOTOS}
    />
  );
}

/**
 * The grid's photos as rows, which photo is open, and the writes the grid
 * itself makes (a retry). The open photo is looked up live in the query, so
 * one deleted from elsewhere closes its own view. A failed read, or one still
 * waiting for its first answer, shows its own state and never rows left over.
 */
function useGallery(tripId: string) {
  const photos = usePhotos(tripId);
  const actions = usePhotoActions();
  const { writeError, attempt } = useWriteAttempt(PHOTO_COPY.writeFailed);
  const [openId, setOpenId] = useState<string | null>(null);
  const columns = useGridColumns();
  const shown = photos.error || photos.loading ? NO_PHOTOS : photos.data;
  const rows = useMemo(() => toRows(shown, columns), [shown, columns]);

  return {
    photos,
    actions,
    rows,
    columns,
    writeError,
    viewing: photos.data.find((photo) => photo.id === openId) ?? null,
    open: (photo: PhotoWithPlace) => setOpenId(photo.id),
    close: () => setOpenId(null),
    retry: (photo: PhotoWithPlace) => attempt(() => actions.retryUpload(photo.id)),
  };
}

type GalleryProps = { tripId: string; onReread: () => void };

function PhotosGallery({ tripId, onReread }: GalleryProps) {
  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const capture = useCapture(tripId);
  const gallery = useGallery(tripId);
  usePhotoUploads(tripId);

  const renderItem = ({ item }: { item: PhotoWithPlace[] }) => (
    <PhotoGridRow
      photos={item}
      columns={gallery.columns}
      onOpen={gallery.open}
      onRetry={gallery.retry}
    />
  );

  const header = (
    <PhotosHeader
      tripTitle={trip.data?.title ?? null}
      capture={capture}
      writeError={gallery.writeError}
    />
  );

  return (
    <>
      <ListScreen
        testID="photos-screen"
        listTestID="photos-list"
        underHeader
        data={gallery.rows}
        keyExtractor={(row) => row[0].id}
        renderItem={renderItem}
        header={header}
        empty={
          <PhotosEmpty
            photos={gallery.photos}
            columns={gallery.columns}
            onReread={onReread}
          />
        }
      />
      {gallery.viewing ? (
        <PhotoViewer
          photo={gallery.viewing}
          stops={stops.data}
          actions={gallery.actions}
          onClose={gallery.close}
        />
      ) : null}
    </>
  );
}

export default function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  // Bumping the key remounts the gallery, which is how a failed read is asked again.
  const [reads, setReads] = useState(0);

  return (
    <PhotosGallery
      key={reads}
      tripId={firstParam(id) ?? ''}
      onReread={() => setReads((count) => count + 1)}
    />
  );
}
