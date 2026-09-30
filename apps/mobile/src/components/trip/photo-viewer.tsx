/**
 * The photo view — tasks.md T117 (FR-028, FR-029, FR-041; User Story 5,
 * Acceptance Scenarios 2, 6; research D-27; feature 002 FR-024).
 *
 * The one place the FULL image is drawn (the grid draws thumbnails). Below it:
 * when and where the photo was taken — in the time zone of the city it is filed
 * under, when this device has that city — and where its bytes are, so a photo
 * that has not uploaded is never presented as saved. The traveller can file it
 * under another of the trip's cities, or none, and can retry a failed upload
 * or delete it (after asking). A filing that contradicts the photo's own
 * position is SAID, never silently corrected (spec edge case; data-model §5).
 *
 * Every change is a local write first; a write that fails is shown in this
 * view (`photo-viewer-error`), not swallowed. A React Native `Modal` (as the
 * stop and note editors), full screen, with an explicit Close.
 *
 * Visibility posture: private. This view has no share or public control —
 * per-photo visibility is User Story 7.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PhotoRetryButton, PhotoStatusBadge } from '@/components/trip/photo-status';
import { InlineError } from '@/components/ui/inline-error';
import { MediaFrame } from '@/components/ui/media-frame';
import { PillGroup, type PillOption } from '@/components/ui/pill-group';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { StopWithPlace } from '@/db/repositories/stops';
import { filingChoices } from '@/features/photos/city-match';
import {
  GALLERY_COPY,
  PHOTO_COPY,
  PRIVATE_COPY,
  UPLOAD_STATE_COPY,
} from '@/features/photos/photo-copy';
import { photoUri } from '@/features/photos/photo-files';
import {
  filingMismatchLine,
  photoLabel,
  placeOf,
  takenAtLine,
} from '@/features/photos/photo-labels';
import type { PhotoActions } from '@/features/photos/use-photos';
import { useAppearance } from '@/hooks/use-appearance';
import { useWriteAttempt } from '@/hooks/use-write-attempt';

/** The picture takes up to this share of the window's height, so the details stay in reach. */
const IMAGE_HEIGHT_SHARE = 0.5;

export type PhotoViewerProps = {
  photo: PhotoWithPlace;
  /** The trip's stops: the cities the photo may be filed under. */
  stops: readonly StopWithPlace[];
  actions: PhotoActions;
  onClose: () => void;
};

function ViewerImage({ photo }: { photo: PhotoWithPlace }) {
  const { height } = useWindowDimensions();
  const [undrawable, setUndrawable] = useState(false);
  const uri = photoUri(photo.local_file_uri);

  if (!uri || undrawable) {
    return (
      <ThemedText type="small" themeColor="textMuted">
        {uri ? GALLERY_COPY.cannotDraw : GALLERY_COPY.notStored}
      </ThemedText>
    );
  }
  return (
    <MediaFrame radius="md" style={{ height: Math.round(height * IMAGE_HEIGHT_SHARE) }}>
      <Image
        testID="photo-viewer-image"
        source={{ uri }}
        recyclingKey={photo.id}
        contentFit="contain"
        accessible
        accessibilityLabel={photoLabel(photo)}
        onError={() => setUndrawable(true)}
        style={StyleSheet.absoluteFill}
      />
    </MediaFrame>
  );
}

function ViewerStatus({
  photo,
  onRetry,
}: {
  photo: PhotoWithPlace;
  onRetry: () => void;
}) {
  const status = photo.upload_state;
  return (
    <View style={styles.block}>
      {status !== 'uploaded' ? <PhotoStatusBadge status={status} /> : null}
      <ThemedText type="small" themeColor="textMuted">
        {UPLOAD_STATE_COPY[status].detail}
      </ThemedText>
      {status === 'failed' ? <PhotoRetryButton onPress={onRetry} /> : null}
    </View>
  );
}

type ViewerFilingProps = {
  photo: PhotoWithPlace;
  stops: readonly StopWithPlace[];
  onRefile: (cityId: number | null) => void;
};

function ViewerFiling({ photo, stops, onRefile }: ViewerFilingProps) {
  const choices = useMemo(() => filingChoices(stops, photo), [stops, photo]);
  const options: PillOption[] = choices.map((choice) => ({
    key: choice.key,
    label: choice.label,
    testID: `photo-file-${choice.key}`,
    accessibilityLabel:
      choice.cityId === null ? GALLERY_COPY.fileUnderNone : `File under ${choice.label}`,
  }));
  const selectedKey = photo.city_id === null ? 'none' : `city:${photo.city_id}`;

  const select = (key: string) => {
    const choice = choices.find((candidate) => candidate.key === key);
    if (choice && choice.cityId !== photo.city_id) onRefile(choice.cityId);
  };

  return (
    <View style={styles.block}>
      <ThemedText type="smallBold">{GALLERY_COPY.fileUnder}</ThemedText>
      <PillGroup options={options} selectedKey={selectedKey} onSelect={select} />
    </View>
  );
}

function ViewerWhenAndWhere({ photo }: { photo: PhotoWithPlace }) {
  const place = placeOf(photo);
  const mismatch = filingMismatchLine(photo);
  return (
    <View style={styles.block}>
      <ThemedText>{takenAtLine(photo)}</ThemedText>
      <ThemedText testID="photo-viewer-place" type="small" themeColor="textMuted">
        {place ? `Filed under ${place}` : 'Not filed under a city'}
      </ThemedText>
      {mismatch ? (
        <ThemedText testID="photo-viewer-mismatch" type="small">
          {mismatch}
        </ThemedText>
      ) : null}
    </View>
  );
}

type DeleteButtonProps = { onConfirmed: () => void };

/** Asks first: a delete cannot be taken back. */
function DeleteButton({ onConfirmed }: DeleteButtonProps) {
  const confirm = () =>
    Alert.alert(GALLERY_COPY.deleteTitle, GALLERY_COPY.deleteDetail, [
      { text: 'Cancel', style: 'cancel' },
      { text: GALLERY_COPY.deleteText, style: 'destructive', onPress: onConfirmed },
    ]);

  return (
    <PressableSurface
      accessibilityLabel={GALLERY_COPY.deleteLabel}
      treatment="flat"
      onPress={confirm}
      style={styles.button}>
      <ThemedText type="smallBold" themeColor="danger">
        {GALLERY_COPY.deleteText}
      </ThemedText>
    </PressableSurface>
  );
}

function ViewerContent({ photo, stops, actions, onClose }: PhotoViewerProps) {
  const { writeError, attempt } = useWriteAttempt(PHOTO_COPY.writeFailed);

  return (
    <>
      <PressableSurface
        accessibilityLabel={GALLERY_COPY.closeLabel}
        treatment="flat"
        onPress={onClose}
        style={styles.button}>
        <ThemedText type="smallBold">{GALLERY_COPY.closeText}</ThemedText>
      </PressableSurface>

      <ViewerImage photo={photo} />
      <ViewerWhenAndWhere photo={photo} />
      <ViewerStatus
        photo={photo}
        onRetry={() => attempt(() => actions.retryUpload(photo.id))}
      />
      <ViewerFiling
        photo={photo}
        stops={stops}
        onRefile={(cityId) => attempt(() => actions.refile(photo.id, cityId))}
      />

      <InlineError testID="photo-viewer-error" message={writeError} />
      <ThemedText type="small" themeColor="textMuted">
        {PRIVATE_COPY}
      </ThemedText>

      <DeleteButton
        onConfirmed={() => {
          if (attempt(() => actions.remove(photo.id))) onClose();
        }}
      />
    </>
  );
}

export function PhotoViewer(props: PhotoViewerProps) {
  const { prefersLessMotion } = useAppearance();

  return (
    <Modal
      testID="photo-viewer-modal"
      visible
      animationType={prefersLessMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}>
      <Screen testID="photo-viewer">
        <ViewerContent {...props} />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  block: { gap: Spacing.two },
  button: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
