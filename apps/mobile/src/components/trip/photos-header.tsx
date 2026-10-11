/**
 * The gallery header — tasks.md T117, restyled for Atlas by T442 (FR-005, FR-007,
 * FR-008, FR-025, FR-028, FR-029; 004 FR-015; User Story 5, Acceptance Scenarios 1, 2):
 * the trip's name, the two ways to add photos, what a capture came to, the write error,
 * and the private-by-default note.
 *
 * The title ("Photos") and the way back are the navigator's: a native header with the
 * `HeaderBackButton` (`trip/[id]/_layout.tsx`), so this block draws neither, and the
 * line it opens with is only which trip this is (`photos-title`, the id the Maestro flows
 * wait on). It is left out for a trip that is not on this device.
 *
 * "Add photos" is the screen's one primary control and "Take a photo" a secondary beside
 * it (FR-005). Both are announced busy while a capture runs (the hook ignores a second tap
 * anyway). What a capture came to is said in words: an error as an alert with the alert
 * icon (never colour alone), anything else politely; a camera refusal the system will not
 * ask about again offers to open Settings (`Linking.openSettings` —
 * https://reactnative.dev/docs/linking), a secondary action beside a text "Dismiss".
 */
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { PrivateNote } from '@/components/trip/private-note';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Text } from '@/components/ui/text';
import type { CaptureMessage } from '@/features/photos/capture';
import { GALLERY_COPY, PHOTO_COPY } from '@/features/photos/photo-copy';
import type { PhotoCapture } from '@/features/photos/use-capture';
import { Sentry } from '@/lib/sentry';

export type PhotosHeaderProps = {
  tripTitle: string | null;
  capture: PhotoCapture;
  /** A failed local write from the grid (a retry), in words. */
  writeError: string | null;
};

const ADD: IconName = { ios: 'photo.badge.plus', android: 'add_photo_alternate' };
const TAKE: IconName = { ios: 'camera', android: 'photo_camera' };

type CaptureNoticeProps = { message: CaptureMessage; onDismiss: () => void };

function CaptureNotice({ message, onDismiss }: CaptureNoticeProps) {
  const [settingsFailed, setSettingsFailed] = useState(false);

  const openSettings = () => {
    Linking.openSettings().catch((error: unknown) => {
      Sentry.captureException(error);
      setSettingsFailed(true);
    });
  };

  return (
    <View className="gap-2">
      {message.tone === 'error' ? (
        <InlineError testID="photos-capture-error" message={message.text} />
      ) : (
        <Text
          testID="photos-capture-message"
          type="callout"
          accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      )}
      <InlineError
        testID="photos-settings-error"
        message={settingsFailed ? PHOTO_COPY.settingsUnavailable : null}
      />
      <View className="flex-row flex-wrap gap-2">
        {message.openSettings ? (
          <Button
            variant="secondary"
            size="sm"
            accessibilityLabel={GALLERY_COPY.openSettingsLabel}
            onPress={openSettings}>
            {GALLERY_COPY.openSettingsLabel}
          </Button>
        ) : null}
        <Button
          variant="text"
          size="sm"
          accessibilityLabel={GALLERY_COPY.dismissLabel}
          onPress={onDismiss}>
          {GALLERY_COPY.dismissText}
        </Button>
      </View>
    </View>
  );
}

/** The two ways in: the library (primary) and the camera (secondary). */
function AddActions({ capture }: { capture: PhotoCapture }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        testID="photos-add"
        variant="primary"
        icon={ADD}
        accessibilityLabel={GALLERY_COPY.addLabel}
        busy={capture.busy}
        onPress={() => void capture.addFromLibrary()}>
        {GALLERY_COPY.addText}
      </Button>
      <Button
        testID="photos-take"
        variant="secondary"
        icon={TAKE}
        accessibilityLabel={GALLERY_COPY.takeLabel}
        busy={capture.busy}
        onPress={() => void capture.takePhoto()}>
        {GALLERY_COPY.takeText}
      </Button>
    </View>
  );
}

export function PhotosHeader({ tripTitle, capture, writeError }: PhotosHeaderProps) {
  return (
    <View className="gap-4">
      {tripTitle ? (
        <Text type="headline" testID="photos-title">
          {tripTitle}
        </Text>
      ) : null}

      <AddActions capture={capture} />

      {capture.message ? (
        <CaptureNotice message={capture.message} onDismiss={capture.clearMessage} />
      ) : null}

      <InlineError testID="photos-write-error" message={writeError} />

      <PrivateNote />
    </View>
  );
}
