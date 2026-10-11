/**
 * The photo view — tasks.md T117, restyled for Atlas by T442 (FR-028, FR-029, FR-041;
 * User Story 5, Acceptance Scenarios 2, 6; research D-27; 004 FR-005, FR-024, FR-025,
 * FR-026, FR-029, FR-033).
 *
 * The one place the FULL image is drawn (the grid draws thumbnails), in a `MediaFrame`
 * with nothing laid across it. Below it: when and where the photo was taken — in the time
 * zone of the city it is filed under, when this device has that city — and where its
 * bytes are, so a photo that has not uploaded is never presented as saved (the same
 * badge as the grid's, and its explanation). The traveller can file it under another of
 * the trip's cities, or none (a `ChipGroup`: the selected one is filled, bold and checked,
 * never colour alone), and can retry a failed upload or delete it (after asking). A
 * filing that contradicts the photo's own position is SAID, never silently corrected
 * (spec edge case; data-model §5).
 *
 * Emphasis (FR-005): nothing here is primary. "Close" is secondary, the retry is
 * secondary, and "Delete" is the one destructive control, with its icon and its words.
 *
 * Every change is a local write first; a write that fails is shown in this view
 * (`photo-viewer-error`), not swallowed. A React Native `Modal` (as the stop and note
 * editors), full screen, with an explicit Close; a modal has no navigator, hence no
 * native header, so the bar is the Close button at the top of a scrolling `Screen`.
 *
 * Visibility posture: private. This view has no share or public control —
 * per-photo visibility is User Story 7.
 */
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PhotoRetryButton, PhotoStatusBadge } from '@/components/trip/photo-status';
import { PrivateNote } from '@/components/trip/private-note';
import { Button } from '@/components/ui/button';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { MediaFrame } from '@/components/ui/media-frame';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { StopWithPlace } from '@/db/repositories/stops';
import { filingChoices } from '@/features/photos/city-match';
import {
  GALLERY_COPY,
  PHOTO_COPY,
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

const CLOSE: IconName = { ios: 'xmark', android: 'close' };
const TRASH: IconName = { ios: 'trash', android: 'delete' };

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
      <Text type="callout" tone="muted">
        {uri ? GALLERY_COPY.cannotDraw : GALLERY_COPY.notStored}
      </Text>
    );
  }
  return (
    <MediaFrame radius="md" style={{ height: Math.round(height * IMAGE_HEIGHT_SHARE) }}>
      <Image
        testID="photo-viewer-image"
        source={{ uri }}
        recyclingKey={photo.id}
        contentFit="contain"
        transition={0}
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
    <View className="gap-2">
      {status !== 'uploaded' ? <PhotoStatusBadge status={status} /> : null}
      <Text type="callout" tone="muted">
        {UPLOAD_STATE_COPY[status].detail}
      </Text>
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
  const options: ChipOption[] = choices.map((choice) => ({
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
    <View className="gap-2">
      <Text type="headline">{GALLERY_COPY.fileUnder}</Text>
      <ChipGroup options={options} selectedKey={selectedKey} onSelect={select} />
    </View>
  );
}

function ViewerWhenAndWhere({ photo }: { photo: PhotoWithPlace }) {
  const place = placeOf(photo);
  const mismatch = filingMismatchLine(photo);
  return (
    <View className="gap-2">
      <Text>{takenAtLine(photo)}</Text>
      <Text testID="photo-viewer-place" type="callout" tone="muted">
        {place ? `Filed under ${place}` : 'Not filed under a city'}
      </Text>
      {mismatch ? (
        <Text testID="photo-viewer-mismatch" type="callout">
          {mismatch}
        </Text>
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
    <Button
      variant="destructive"
      icon={TRASH}
      accessibilityLabel={GALLERY_COPY.deleteLabel}
      onPress={confirm}
      className="self-start">
      {GALLERY_COPY.deleteText}
    </Button>
  );
}

function ViewerContent({ photo, stops, actions, onClose }: PhotoViewerProps) {
  const { writeError, attempt, attemptRemoval } = useWriteAttempt(PHOTO_COPY.writeFailed);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={CLOSE}
        accessibilityLabel={GALLERY_COPY.closeLabel}
        onPress={onClose}
        className="self-start">
        {GALLERY_COPY.closeText}
      </Button>

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
      <PrivateNote />

      <DeleteButton
        onConfirmed={() => {
          if (attemptRemoval(() => actions.remove(photo.id))) onClose();
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
