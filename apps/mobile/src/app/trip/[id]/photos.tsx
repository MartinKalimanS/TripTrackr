/**
 * A trip's photo gallery — tasks.md T117, restyled by T442 (Atlas) and T549 (Sunrise Passport;
 * FR-028, FR-029, FR-041, FR-044, FR-045; User Story 4, Acceptance Scenarios 1, 2 and 5;
 * Constitution II; research D-23, D-27, D5-09; pictures `more/photos*.png`).
 *
 * Read from and written to the encrypted local store: the gallery is a live query, so a capture
 * appears the moment SQLite commits it, as a thumbnail marked "waiting to upload" until its
 * bytes have arrived (a photograph is not saved until then, and every state is shown honestly:
 * the store has no progress, so there is no "uploading 62%"). Photographs are grouped by the
 * calendar day they were taken (`photo-days.ts`): a `DayHeader` (the day as a big numeral, the
 * place, the weekday and the count) over a three-column mosaic (`photo-mosaic.ts`: the first
 * photograph large, two stacked beside it, the rest three across; a day of more than six shows
 * five and a `+N` tile that opens the whole day). One `FlashList` item is one day (D-23).
 *
 * The screen draws its own header, as the pictures do (the navigator's is hidden for this route:
 * `trip/[id]/_layout.tsx`): the shared `AreaHeader` (`photos-header.tsx`), the one-line upload
 * summary and what a capture came to, fixed above the list. "Add photos" is the floating
 * `AreaFab` (`photos-add`, named "Add photos from your library"); with no photographs it is the
 * empty state's own primary instead (one primary per state). Opening a photograph shows the
 * full image, where it is filed and where its bytes are (`PhotoViewer`). Focusing the gallery
 * tries the trip's pending uploads (`usePhotoUploads`).
 *
 * Every state is designed (C5-31 rule 2): a mosaic-shaped skeleton while the store has not
 * answered (never the empty state), words, an icon and "Try again" when it failed (the gallery
 * is remounted, which asks the live query afresh), and for no photographs the empty frames, a
 * sentence that names the next step and "Add photos". The camera's refusal is said under the
 * header with "Open Settings" and never replaces the gallery.
 *
 * Adding asks twice (spec 006; owner decision 2026-10-22). "Add photos" first asks for the photo
 * library, in the system's own dialog, and opens the picker only once it is allowed; a refusal is
 * the notice under the header ("Photo access is off", with "Allow photo access" or "Open
 * Settings"). Then, once the picker or the camera has handed back photographs, the
 * `PhotoVisibilitySheet` asks who can see them, before anything is written: no answer, in any
 * form, is private.
 *
 * Visibility posture: a photograph is private unless the traveller chose public for it in that
 * sheet, and a public one is seen by nobody else yet (screening and the sharing story are not
 * built). Changing a photograph's visibility afterwards is User Story 7; the note at the foot of
 * the list says photographs are private.
 */
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { PrivateNote } from '@/components/trip/private-note';
import { DaySection } from '@/components/trip/photo-mosaic';
import { PhotoVisibilitySheet } from '@/components/trip/photo-visibility-sheet';
import { PhotosHeader } from '@/components/trip/photos-header';
import { PhotosSkeleton } from '@/components/trip/photos-skeleton';
import { PhotoViewer } from '@/components/trip/photo-viewer';
import { AreaFab, areaFabClearance } from '@/components/ui/area-fab';
import { areaMargin } from '@/components/ui/area-header';
import { ListScreen } from '@/components/ui/list-screen';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { MaxContentWidth } from '@/constants/theme';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import { GALLERY_COPY, PHOTO_COPY } from '@/features/photos/photo-copy';
import { groupByDay, type DayGroup } from '@/features/photos/photo-days';
import { summarizeUploads } from '@/features/photos/upload-summary';
import { useCapture, type PhotoCapture } from '@/features/photos/use-capture';
import { useNow } from '@/features/photos/use-now';
import {
  usePhotoActions,
  usePhotos,
  usePhotoUploads,
} from '@/features/photos/use-photos';
import { useTrip, useTripStops, type LiveResult } from '@/features/trips/use-trips';
import { useAppearance } from '@/hooks/use-appearance';
import { useFontScale } from '@/hooks/use-font-scale';
import { useWriteAttempt } from '@/hooks/use-write-attempt';
import { Space } from '@/theme';

const NO_PHOTOS: readonly PhotoWithPlace[] = [];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The width of a mosaic: the window, up to the content column, less the two margins. */
function useMosaicWidth(): number {
  const { width } = useWindowDimensions();
  return Math.min(width, MaxContentWidth) - areaMargin() * 2;
}

/** One day as the list sees it: the group, its place in the list and whether it is opened up. */
interface DayRow {
  group: DayGroup;
  dayIndex: number;
  expanded: boolean;
}

type PhotosEmptyProps = {
  photos: LiveResult<PhotoWithPlace[]>;
  width: number;
  capture: PhotoCapture;
  onReread: () => void;
};

/** What the list shows instead of days: the one state that applies. The error comes first. */
function PhotosEmpty({ photos, width, capture, onReread }: PhotosEmptyProps) {
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
    return <PhotosSkeleton width={width} label={GALLERY_COPY.loading} />;
  }
  return (
    <EmptyState
      variant="frames"
      title={GALLERY_COPY.emptyTitle}
      detail={GALLERY_COPY.emptyDetail}
      action={{
        label: GALLERY_COPY.addText,
        accessibilityLabel: GALLERY_COPY.addLabel,
        testID: 'photos-add',
        primary: true,
        busy: capture.busy,
        onPress: () => void capture.addFromLibrary(),
      }}
    />
  );
}

/**
 * The photographs as days, which photograph is open, which days are opened up, and the
 * writes the gallery itself makes (a retry). The open photograph is looked up live in the
 * query, so one deleted from elsewhere closes its own view. A failed read, or one still
 * waiting for its first answer, shows its own state and never days left over.
 */
function useGallery(tripId: string) {
  const photos = usePhotos(tripId);
  const actions = usePhotoActions();
  const { writeError, attempt } = useWriteAttempt(PHOTO_COPY.writeFailed);
  const [openId, setOpenId] = useState<string | null>(null);
  const [opened, setOpened] = useState<readonly string[]>([]);
  const shown = photos.error || photos.loading ? NO_PHOTOS : photos.data;
  const days = useMemo(() => groupByDay(shown), [shown]);
  const rows = useMemo<DayRow[]>(
    () =>
      days.map((group, dayIndex) => ({
        group,
        dayIndex,
        expanded: opened.includes(group.key),
      })),
    [days, opened],
  );
  const summary = useMemo(() => summarizeUploads(shown), [shown]);
  const now = useNow(shown);

  return {
    photos,
    actions,
    rows,
    summary,
    now,
    writeError,
    count: photos.error || photos.loading ? null : photos.data.length,
    viewing: photos.data.find((photo) => photo.id === openId) ?? null,
    open: (photo: PhotoWithPlace) => setOpenId(photo.id),
    close: () => setOpenId(null),
    expand: (key: string) => setOpened((keys) => [...keys, key]),
    retry: (photo: PhotoWithPlace) => attempt(() => actions.retryUpload(photo.id)),
    retryFailed: () =>
      attempt(() => summary?.failedIds.forEach((id) => actions.retryUpload(id))),
  };
}

type GalleryProps = { tripId: string; onReread: () => void };

function PhotosGallery({ tripId, onReread }: GalleryProps) {
  const trip = useTrip(tripId);
  const stops = useTripStops(tripId);
  const capture = useCapture(tripId);
  const gallery = useGallery(tripId);
  const width = useMosaicWidth();
  const fontScale = useFontScale();
  const { tokens } = useAppearance();
  usePhotoUploads(tripId);

  const renderItem = ({ item }: { item: DayRow }) => (
    <DaySection
      group={item.group}
      dayIndex={item.dayIndex}
      expanded={item.expanded}
      width={width}
      now={gallery.now}
      onOpen={gallery.open}
      onRetry={gallery.retry}
      onExpand={() => gallery.expand(item.group.key)}
    />
  );
  const empty =
    !gallery.photos.loading && !gallery.photos.error && gallery.photos.data.length === 0;

  return (
    <View
      testID="photos-screen"
      className="bg-background"
      style={[styles.canvas, { backgroundColor: tokens.canvas }]}>
      <PhotosHeader
        tripTitle={trip.data?.title ?? null}
        count={gallery.count}
        summary={gallery.summary}
        capture={capture}
        writeError={gallery.writeError}
        onRetryFailed={gallery.retryFailed}
      />
      <ListScreen
        listTestID="photos-list"
        edges={['bottom']}
        itemGap={0}
        horizontalInset={areaMargin()}
        bottomInset={areaFabClearance(Platform.OS, fontScale)}
        data={gallery.rows}
        keyExtractor={(row) => row.group.key}
        renderItem={renderItem}
        footer={
          <View style={{ paddingTop: Space[2] }}>
            <PrivateNote />
          </View>
        }
        empty={
          <PhotosEmpty
            photos={gallery.photos}
            width={width}
            capture={capture}
            onReread={onReread}
          />
        }
      />
      <AreaFab
        label={GALLERY_COPY.addText}
        accessibilityLabel={GALLERY_COPY.addLabel}
        icon="images"
        testID="photos-add"
        busy={capture.busy}
        hidden={empty}
        onPress={() => void capture.addFromLibrary()}
      />
      <PhotoVisibilitySheet
        prompt={capture.prompt}
        onChoose={capture.answerPrompt}
        onDismiss={capture.dismissPrompt}
      />
      {gallery.viewing ? (
        <PhotoViewer
          photo={gallery.viewing}
          photos={gallery.photos.data}
          onChange={gallery.open}
          stops={stops.data}
          actions={gallery.actions}
          onClose={gallery.close}
        />
      ) : null}
    </View>
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

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});
