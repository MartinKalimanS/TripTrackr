/**
 * The photo viewer - tasks.md T117, restyled for Sunrise Passport by T549 (feature 005;
 * contract C5-26; UI-SPEC 9.2; FR-028, FR-029, FR-041, FR-045, FR-046, FR-080 as amended by
 * Q-11; research D5-13; User Story 5, Acceptance Scenarios 2, 6).
 *
 * A full-screen React Native `Modal` laid out as the picture draws it (`photo-viewer.png`,
 * prototype `.viewer`): the photograph on its own blurred ambient (`expo-image`
 * `blurRadius`, no backdrop filter) under a scrim, a glass top bar (Close, "N of M", Share,
 * More), the photo in a rounded card the traveller can zoom (pinch, double-tap), pan, swipe
 * between and pull down to close (`components/ui/photo-viewer`, the zoom toolkit's only
 * importer), and a sheet beneath it.
 *
 * The sheet is the detail block the viewer always had, in the picture's order: where and
 * when the photo was taken (in the time zone of the city it is filed under, when this device
 * has that city) with where its bytes are, so a photo that has not uploaded is never
 * presented as saved (the same badge as the grid's, and its explanation); a caption row; the
 * actions Share, Save copy and Delete; and the filing chips, the retry, the write error and
 * the private note. A filing that contradicts the photo's own position is SAID, never
 * silently corrected (spec edge case; data-model section 5).
 *
 * What the pictures draw and the app cannot do (owner answer Q-11): Share (twice), More, the
 * caption row and Save copy are real, focusable buttons whose only effect is the one
 * "<Thing> is coming soon" toast. They write nothing and send nothing, and the caption row is
 * a prompt, not a stored caption. Delete is real: it asks first (`Alert`), then removes the
 * photo and closes the view.
 *
 * Words the app already says win over the picture's: the close control is "Close photo", the
 * place line reads "Filed under Roma, Italy" or "Not filed under a city", and the time line
 * "Taken 12 May 2026, 18:30 (Roma time)". The picture's flag beside the place is not drawn
 * (a photo's row has no country code), and its "Uploading 62%" pill is the pending badge
 * (no byte counts are kept). "N of M" shows only when the caller hands over the photos to
 * swipe between (`photos` and `onChange`).
 *
 * Every change is a local write first; a write that fails is shown in this view
 * (`photo-viewer-error`), not swallowed. A full image that will not draw says so
 * (`photo-viewer-image-unavailable`). Android's Back closes the view (`onRequestClose`).
 *
 * Visibility posture: private. The pictured Share is a coming-soon control: nothing here
 * shares, publishes or sets visibility (per-photo visibility is User Story 7), and the
 * photo is drawn from this device's own private files, never from a link.
 */
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useContext, useMemo } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PhotoRetryButton, PhotoStatusBadge } from '@/components/trip/photo-status';
import { PrivateNote } from '@/components/trip/private-note';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import {
  COMING_SOON_HINT,
  ComingSoonButton,
  useComingSoon,
} from '@/components/ui/coming-soon-button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { InlineError } from '@/components/ui/inline-error';
import { MediaFrame } from '@/components/ui/media-frame';
import { PhotoGallery, ProgressivePhoto } from '@/components/ui/photo-viewer';
import { Scrim } from '@/components/ui/scrim';
import { Tappable } from '@/components/ui/tappable';
import { Text } from '@/components/ui/text';
import { ToastZone } from '@/components/ui/toast-zone';
import type { PhotoWithPlace } from '@/db/repositories/photos';
import type { StopWithPlace } from '@/db/repositories/stops';
import { filingChoices } from '@/features/photos/city-match';
import {
  GALLERY_COPY,
  PHOTO_COPY,
  UPLOAD_STATE_COPY,
} from '@/features/photos/photo-copy';
import { photoUri, thumbnailUri } from '@/features/photos/photo-files';
import {
  filingMismatchLine,
  photoLabel,
  placeOf,
  takenAtLine,
} from '@/features/photos/photo-labels';
import type { PhotoActions } from '@/features/photos/use-photos';
import { useAppearance } from '@/hooks/use-appearance';
import { useFontScale } from '@/hooks/use-font-scale';
import { useHaptics } from '@/hooks/use-haptics';
import { useWriteAttempt } from '@/hooks/use-write-attempt';
import { Radii, Space } from '@/theme';

/** The ambient's blur (the prototype's 34 px), and how far it is scaled past the edges. */
const AMBIENT_BLUR = 34;
const AMBIENT_SCALE = 1.2;
/** The sheet takes at most this share of the window; past it, it scrolls. */
const SHEET_MAX_SHARE = 0.55;
/** An action tile is at least this tall at the default text size (the prototype's 64). */
const TILE_MIN_HEIGHT = 64;
const CAPTION_MIN_HEIGHT = 52;
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

const COMING_SOON = {
  caption: { thing: 'Captions', prompt: 'Add a caption' },
  share: { thing: 'Sharing', label: 'Share' },
  saveCopy: { thing: 'Saving a copy', label: 'Save copy' },
} as const;

export type PhotoViewerProps = {
  photo: PhotoWithPlace;
  /** The trip's stops: the cities the photo may be filed under. */
  stops: readonly StopWithPlace[];
  actions: PhotoActions;
  onClose: () => void;
  /**
   * The photos to swipe between, in order, `photo` among them. With `onChange` the viewer
   * pages through them and says "N of M"; without either it shows `photo` alone.
   */
  photos?: readonly PhotoWithPlace[];
  /** The traveller swiped to `next`: the caller makes it the open photo. */
  onChange?: (next: PhotoWithPlace) => void;
};

function useInsets() {
  return useContext(SafeAreaInsetsContext) ?? NO_INSETS;
}

/** The photo's own colours, blurred, under a scrim: decoration, hidden from assistive tech. */
function Ambient({ photo }: { photo: PhotoWithPlace }) {
  const uri = thumbnailUri(photo.local_file_uri) ?? photoUri(photo.local_file_uri);
  return (
    <View
      testID="photo-viewer-ambient"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip]}>
      {uri ? (
        <Image
          testID="photo-viewer-ambient-image"
          source={{ uri }}
          recyclingKey={`${photo.id}-ambient`}
          blurRadius={AMBIENT_BLUR}
          contentFit="cover"
          transition={0}
          style={[StyleSheet.absoluteFill, { transform: [{ scale: AMBIENT_SCALE }] }]}
        />
      ) : null}
      <View
        testID="photo-viewer-ambient-scrim"
        className="bg-scrim-button"
        style={StyleSheet.absoluteFill}
      />
      <Scrim kind="top" />
    </View>
  );
}

function PositionPill({ index, total }: { index: number; total: number }) {
  return (
    <View
      testID="photo-viewer-position"
      accessible
      accessibilityLabel={`Photo ${index + 1} of ${total}`}
      className="rounded-full border border-scrim-button-line bg-scrim-button px-3 py-1">
      <Text type="numeric" context="callout" tone="onPhoto">
        {`${index + 1} of ${total}`}
      </Text>
    </View>
  );
}

type TopBarProps = {
  onClose: () => void;
  position: { index: number; total: number } | null;
};

function TopBar({ onClose, position }: TopBarProps) {
  const { top } = useInsets();
  return (
    <View
      testID="photo-viewer-bar"
      className="flex-row items-center justify-between"
      style={{ paddingTop: top + Space[3], paddingHorizontal: Space[5], gap: Space[2] }}>
      <IconButton
        icon="x"
        variant="glass"
        accessibilityLabel={GALLERY_COPY.closeLabel}
        onPress={onClose}
        testID="photo-viewer-close"
      />
      {position ? <PositionPill {...position} /> : null}
      <View className="flex-row" style={{ gap: Space[2] }}>
        <ComingSoonButton
          name="share"
          label="Share"
          thing={COMING_SOON.share.thing}
          icon="share"
          variant="glass"
        />
        <ComingSoonButton
          name="more"
          label="More"
          thing="More actions"
          icon="ellipsis"
          variant="glass"
        />
      </View>
    </View>
  );
}

type StageProps = {
  photos: readonly PhotoWithPlace[];
  index: number;
  reducedMotion: boolean;
  onIndexChange: (index: number) => void;
  onPullDown: () => void;
};

function Stage({ photos, index, reducedMotion, onIndexChange, onPullDown }: StageProps) {
  return (
    <MediaFrame
      radius="lg"
      testID="photo-viewer-stage"
      style={{ flex: 1, marginHorizontal: Space[5], marginTop: Space[4] }}>
      <PhotoGallery
        data={photos}
        index={index}
        keyOf={(item) => item.id}
        reducedMotion={reducedMotion}
        onIndexChange={onIndexChange}
        onPullDown={onPullDown}
        renderPhoto={(item, size) => (
          <ProgressivePhoto
            uri={photoUri(item.local_file_uri)}
            thumbnailUri={thumbnailUri(item.local_file_uri)}
            label={photoLabel(item)}
            size={size}
            recyclingKey={item.id}
            missingText={GALLERY_COPY.notStored}
            errorText={GALLERY_COPY.cannotDraw}
            reducedMotion={reducedMotion}
          />
        )}
      />
    </MediaFrame>
  );
}

function WhenAndWhere({ photo }: { photo: PhotoWithPlace }) {
  const place = placeOf(photo);
  const mismatch = filingMismatchLine(photo);
  const status = photo.upload_state;
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between" style={{ gap: Space[3] }}>
        <View className="shrink flex-1 gap-1">
          <Text testID="photo-viewer-place" type="headline">
            {place ? `Filed under ${place}` : 'Not filed under a city'}
          </Text>
          <Text type="callout" tone="muted">
            {takenAtLine(photo)}
          </Text>
        </View>
        {status !== 'uploaded' ? <PhotoStatusBadge status={status} /> : null}
      </View>
      {mismatch ? (
        <Text testID="photo-viewer-mismatch" type="callout">
          {mismatch}
        </Text>
      ) : null}
    </View>
  );
}

/** The caption row as pictured: a prompt that says captions are coming, and stores nothing. */
function CaptionRow() {
  const onPress = useComingSoon(COMING_SOON.caption.thing);
  const scale = Math.max(1, useFontScale());
  return (
    <Tappable
      testID="photo-viewer-caption"
      accessibilityLabel="Add a caption"
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      className="flex-row items-center border border-border bg-surface-secondary px-4"
      style={{
        ...styles.lg,
        minHeight: CAPTION_MIN_HEIGHT * scale,
        gap: Space[3],
      }}>
      <Icon name="pencil" size={20} tone="muted" />
      <Text tone="muted" className="shrink">
        {COMING_SOON.caption.prompt}
      </Text>
    </Tappable>
  );
}

const TILE_CLASS =
  'flex-1 items-center border border-separator bg-surface-secondary px-2 py-2';

/** The look of an action tile; it grows with the text size. */
function useTileStyle() {
  const scale = Math.max(1, useFontScale());
  return { ...styles.lg, minHeight: TILE_MIN_HEIGHT * scale, gap: Space[1] };
}

type TileFaceProps = { icon: IconName; text: string; tone?: 'default' | 'danger' };

function TileFace({ icon, text, tone = 'default' }: TileFaceProps) {
  return (
    <>
      <Icon name={icon} size={24} tone={tone} />
      <Text type="callout" tone={tone} className="text-center font-semibold">
        {text}
      </Text>
    </>
  );
}

/** Pictured, not built (Q-11): one toast, nothing else. */
function ShareTile() {
  const onPress = useComingSoon(COMING_SOON.share.thing);
  return (
    <Tappable
      testID="photo-viewer-share"
      accessibilityLabel="Share"
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      className={TILE_CLASS}
      style={useTileStyle()}>
      <TileFace icon="share" text="Share" />
    </Tappable>
  );
}

function SaveCopyTile() {
  const onPress = useComingSoon(COMING_SOON.saveCopy.thing);
  return (
    <Tappable
      testID="photo-viewer-save-copy"
      accessibilityLabel="Save copy"
      accessibilityHint={COMING_SOON_HINT}
      onPress={onPress}
      className={TILE_CLASS}
      style={useTileStyle()}>
      <TileFace icon="download" text="Save copy" />
    </Tappable>
  );
}

/** Real: asks first (a delete cannot be taken back), then the caller removes the photo. */
function DeleteTile({ onConfirmed }: { onConfirmed: () => void }) {
  const haptics = useHaptics();
  const confirm = () => {
    haptics.warning();
    Alert.alert(GALLERY_COPY.deleteTitle, GALLERY_COPY.deleteDetail, [
      { text: 'Cancel', style: 'cancel' },
      { text: GALLERY_COPY.deleteText, style: 'destructive', onPress: onConfirmed },
    ]);
  };
  return (
    <Tappable
      testID="photo-viewer-delete"
      accessibilityLabel={GALLERY_COPY.deleteLabel}
      onPress={confirm}
      className={TILE_CLASS}
      style={useTileStyle()}>
      <TileFace icon="trash" text={GALLERY_COPY.deleteText} tone="danger" />
    </Tappable>
  );
}

function Actions({ onConfirmedDelete }: { onConfirmedDelete: () => void }) {
  return (
    <View testID="photo-viewer-actions" className="flex-row" style={{ gap: Space[2] }}>
      <ShareTile />
      <SaveCopyTile />
      <DeleteTile onConfirmed={onConfirmedDelete} />
    </View>
  );
}

function UploadDetail({
  photo,
  onRetry,
}: {
  photo: PhotoWithPlace;
  onRetry: () => void;
}) {
  const status = photo.upload_state;
  return (
    <View className="gap-2">
      <Text type="callout" tone="muted">
        {UPLOAD_STATE_COPY[status].detail}
      </Text>
      {status === 'failed' ? <PhotoRetryButton onPress={onRetry} /> : null}
    </View>
  );
}

type FilingProps = {
  photo: PhotoWithPlace;
  stops: readonly StopWithPlace[];
  onRefile: (cityId: number | null) => void;
};

function Filing({ photo, stops, onRefile }: FilingProps) {
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

function Sheet({ photo, stops, actions, onClose }: PhotoViewerProps) {
  const { writeError, attempt, attemptRemoval } = useWriteAttempt(PHOTO_COPY.writeFailed);
  const { height } = useWindowDimensions();
  const { bottom } = useInsets();

  return (
    <View
      testID="photo-viewer-sheet"
      className="bg-surface"
      style={[styles.sheet, { maxHeight: Math.round(height * SHEET_MAX_SHARE) }]}>
      <View
        testID="photo-viewer-grabber"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="mt-2 h-[5px] w-9 self-center rounded-full bg-grab"
      />
      <ScrollView
        testID="photo-viewer-sheet-scroll"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: Space[3],
          paddingHorizontal: Space[5],
          paddingTop: Space[4],
          paddingBottom: bottom + Space[4],
        }}>
        <WhenAndWhere photo={photo} />
        <UploadDetail
          photo={photo}
          onRetry={() => attempt(() => actions.retryUpload(photo.id))}
        />
        <CaptionRow />
        <Actions
          onConfirmedDelete={() => {
            if (attemptRemoval(() => actions.remove(photo.id))) onClose();
          }}
        />
        <Filing
          photo={photo}
          stops={stops}
          onRefile={(cityId) => attempt(() => actions.refile(photo.id, cityId))}
        />
        <InlineError testID="photo-viewer-error" message={writeError} />
        <PrivateNote />
      </ScrollView>
    </View>
  );
}

/** The photos to page through, and where `photo` is among them. */
function usePaging({ photo, photos, onChange }: PhotoViewerProps) {
  const pages = useMemo(() => {
    const found = photos?.some((candidate) => candidate.id === photo.id);
    return photos && onChange && found ? photos : [photo];
  }, [photo, photos, onChange]);
  const index = Math.max(
    0,
    pages.findIndex((candidate) => candidate.id === photo.id),
  );
  const show = (next: number) => {
    const target = pages[next];
    if (target && target.id !== photo.id) onChange?.(target);
  };
  const position = pages.length > 1 ? { index, total: pages.length } : null;
  return { pages, index, show, position };
}

function ViewerBody(props: PhotoViewerProps) {
  const { prefersLessMotion } = useAppearance();
  const { pages, index, show, position } = usePaging(props);

  return (
    <View testID="photo-viewer" className="flex-1 bg-toast-surface">
      <StatusBar style="light" />
      <Ambient photo={props.photo} />
      <TopBar onClose={props.onClose} position={position} />
      <Stage
        photos={pages}
        index={index}
        reducedMotion={prefersLessMotion}
        onIndexChange={show}
        onPullDown={props.onClose}
      />
      <Sheet {...props} />
    </View>
  );
}

export function PhotoViewer(props: PhotoViewerProps) {
  const { prefersLessMotion } = useAppearance();
  const { bottom } = useInsets();

  return (
    <Modal
      testID="photo-viewer-modal"
      visible
      animationType={prefersLessMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={props.onClose}>
      <ToastZone bottom={bottom}>
        <ViewerBody {...props} />
      </ToastZone>
    </Modal>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  lg: { borderRadius: Radii.lg, borderCurve: 'continuous' },
  sheet: {
    borderTopLeftRadius: Radii.sheet,
    borderTopRightRadius: Radii.sheet,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
