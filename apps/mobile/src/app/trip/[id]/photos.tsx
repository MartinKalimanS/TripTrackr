/**
 * A trip's photo gallery — tasks.md T117 (FR-028, FR-029, FR-041; User Story 5,
 * Acceptance Scenarios 1, 2, 5, 6; Constitution II); research D-23, D-27, D-34.
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
 * Visibility posture: every photo is private and nothing on this screen
 * offers to change that — per-photo visibility is User Story 7.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { PhotosHeader } from '@/components/trip/photos-header';
import { PhotoGridRow } from '@/components/trip/photo-tile';
import { PhotoViewer } from '@/components/trip/photo-viewer';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
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
import { useAppearance } from '@/hooks/use-appearance';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Tiles per row: the width `ListScreen` leaves for the list, at the traveller's text size. */
function useGridColumns(): number {
  const { width } = useWindowDimensions();
  const { fontScale } = useAppearance();
  const listWidth = Math.min(width, MaxContentWidth) - Spacing.four * 2;
  return gridColumns(listWidth, fontScale);
}

function PhotosEmpty({ photos }: { photos: LiveResult<PhotoWithPlace[]> }) {
  return photos.error ? (
    <ErrorState
      title={GALLERY_COPY.readFailedTitle}
      detail={GALLERY_COPY.readFailedDetail}
    />
  ) : photos.loading ? (
    <LoadingState title={GALLERY_COPY.loading} />
  ) : (
    <EmptyState title={GALLERY_COPY.emptyTitle} detail={GALLERY_COPY.emptyDetail} />
  );
}

/**
 * The grid's photos as rows, which photo is open, and the writes the grid
 * itself makes (a retry). The open photo is looked up live in the query, so
 * one deleted from elsewhere closes its own view.
 */
function useGallery(tripId: string) {
  const photos = usePhotos(tripId);
  const actions = usePhotoActions();
  const { writeError, attempt } = useWriteAttempt(PHOTO_COPY.writeFailed);
  const [openId, setOpenId] = useState<string | null>(null);
  const columns = useGridColumns();
  const rows = useMemo(() => toRows(photos.data, columns), [photos.data, columns]);

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

export default function PhotosScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';

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
      onBack={() => router.back()}
    />
  );

  return (
    <>
      <ListScreen
        testID="photos-screen"
        data={gallery.rows}
        keyExtractor={(row) => row[0].id}
        renderItem={renderItem}
        header={header}
        empty={<PhotosEmpty photos={gallery.photos} />}
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
