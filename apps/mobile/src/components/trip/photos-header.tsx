/**
 * The gallery's header — tasks.md T117, restyled by T442 (Atlas) and T549 (Sunrise Passport;
 * FR-044, FR-045; UI-SPEC 9.2; picture `more/photos`): the shared `AreaHeader` (Back, the
 * title "Photos" with the trip's name and the count under it, and at the end the pictured
 * select-all and more controls), then the upload summary line, what a capture came to and the
 * write error.
 *
 * The navigator's header is hidden for this route (`trip/[id]/_layout.tsx`): the screen draws
 * the title and Back itself, as the pictures do. `photos-title` is the title; the line under
 * it names the trip and counts the photographs (`photos-subtitle`), and has no count while the
 * store has not answered or could not be read (a count there would be invented).
 *
 * Pictured controls with no capability behind them are coming-soon controls (owner answer
 * Q-11): select all (`coming-soon-photos-select`) and more (`coming-soon-photos-more`), one
 * toast and nothing else. "Take a photo" is not pictured but is the app's: it is the camera
 * disc at the start of those controls (`photos-take`, named "Take a photo with the camera",
 * announced busy while a capture runs). "Add photos" is the floating button (`AreaFab`, in
 * the screen), the one primary.
 *
 * What a capture came to is said in words: an error as an alert with the alert icon (never
 * colour alone), anything else politely; a camera refusal the system will not ask about again
 * is the shared `PermissionState` (T559; FR-066; contract C5-28): the camera icon, "Camera access
 * is off", what to do, "Open Settings" (`Linking.openSettings` —
 * https://reactnative.dev/docs/linking) as a secondary action and a text "Dismiss". It is a
 * secondary because the screen's one primary is "Add photos".
 *
 * The photo library has the same notice since spec 006 (the app now asks for the permission):
 * the images icon, "Photo access is off", what to do, and ONE action, a secondary beside the
 * text "Dismiss": "Allow photo access" while the system will still ask (it asks again through
 * `capture.allowLibraryAccess`) and "Open Settings" once it will not. The two notices differ
 * only in their words, icon, ids (`photos-library-denied`, `photos-library-allow`,
 * `photos-library-settings`) and action; the camera's ids and names are unchanged.
 */
import { useState } from 'react';
import { Linking, View } from 'react-native';

import { UploadSummaryPill } from '@/components/trip/upload-summary-pill';
import { AreaHeader, areaMargin } from '@/components/ui/area-header';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/ui/coming-soon-button';
import { IconButton } from '@/components/ui/icon-button';
import { InlineError } from '@/components/ui/inline-error';
import { PermissionState } from '@/components/ui/permission-state';
import { Text } from '@/components/ui/text';
import type { CaptureMessage } from '@/features/photos/capture';
import { GALLERY_COPY, PHOTO_COPY } from '@/features/photos/photo-copy';
import { photoCount } from '@/features/photos/photo-days';
import type { UploadSummary } from '@/features/photos/upload-summary';
import type { PhotoCapture } from '@/features/photos/use-capture';
import { Sentry } from '@/lib/sentry';
import { Space } from '@/theme';

export type PhotosHeaderProps = {
  tripTitle: string | null;
  /** How many photographs the trip has; null while the store has not answered. */
  count: number | null;
  /** The unfinished uploads, or null when there are none. */
  summary: UploadSummary | null;
  capture: PhotoCapture;
  /** A failed local write from the grid (a retry), in words. */
  writeError: string | null;
  /** Puts every failed photograph back in the upload queue. */
  onRetryFailed: () => void;
};

type CaptureNoticeProps = {
  message: CaptureMessage;
  onDismiss: () => void;
  /** "Allow photo access": ask for the library again. */
  onAllow: () => void;
};

function CaptureNotice({ message, onDismiss, onAllow }: CaptureNoticeProps) {
  const [settingsFailed, setSettingsFailed] = useState(false);

  const openSettings = () => {
    Linking.openSettings().catch((error: unknown) => {
      Sentry.captureException(error);
      setSettingsFailed(true);
    });
  };

  const settingsError = (
    <InlineError
      testID="photos-settings-error"
      message={settingsFailed ? PHOTO_COPY.settingsUnavailable : null}
    />
  );
  const dismiss = {
    label: GALLERY_COPY.dismissText,
    accessibilityLabel: GALLERY_COPY.dismissLabel,
    onPress: onDismiss,
  };

  if (message.permission === 'library') {
    const blocked = message.openSettings === true;
    return (
      <View className="gap-2">
        <PermissionState
          testID="photos-library-denied"
          accessibilityLiveRegion="polite"
          icon="images"
          title={GALLERY_COPY.libraryOffTitle}
          detail={message.text}
          detailTestID="photos-capture-error"
          settingsLabel={
            blocked ? GALLERY_COPY.openSettingsLabel : GALLERY_COPY.allowLabel
          }
          settingsTestID={blocked ? 'photos-library-settings' : 'photos-library-allow'}
          onOpenSettings={blocked ? openSettings : onAllow}
          alternative={dismiss}
        />
        {settingsError}
      </View>
    );
  }

  if (message.openSettings) {
    return (
      <View className="gap-2">
        <PermissionState
          testID="photos-camera-denied"
          accessibilityLiveRegion="polite"
          icon="camera"
          title={GALLERY_COPY.cameraOffTitle}
          detail={message.text}
          detailTestID="photos-capture-error"
          settingsLabel={GALLERY_COPY.openSettingsLabel}
          onOpenSettings={openSettings}
          alternative={dismiss}
        />
        {settingsError}
      </View>
    );
  }

  return (
    <View className="gap-2">
      {message.tone === 'error' ? (
        <InlineError testID="photos-capture-error" message={message.text} />
      ) : (
        <Text
          testID="photos-capture-message"
          variant="label"
          accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      )}
      {settingsError}
      <View className="flex-row flex-wrap gap-2">
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

/** The subtitle: "Portugal Road Trip · 128 photos"; either half alone when the other is unknown. */
export function photosSubtitle(tripTitle: string | null, count: number | null) {
  const parts = [tripTitle, count === null ? null : photoCount(count)];
  return parts.filter((part): part is string => !!part).join(' · ') || null;
}

/** The controls at the end of the bar: the camera, then the two pictured coming-soon ones. */
function BarActions({ capture }: { capture: PhotoCapture }) {
  return (
    <>
      <IconButton
        testID="photos-take"
        icon="camera"
        variant="tonal"
        accessibilityLabel={GALLERY_COPY.takeLabel}
        busy={capture.busy}
        onPress={() => void capture.takePhoto()}
      />
      <ComingSoonButton
        name="photos-select"
        label="Select photos"
        icon="checks"
        variant="tonal"
      />
      <ComingSoonButton
        name="photos-more"
        label="More"
        thing="More photo actions"
        icon="ellipsis"
        variant="tonal"
      />
    </>
  );
}

export function PhotosHeader({
  tripTitle,
  count,
  summary,
  capture,
  writeError,
  onRetryFailed,
}: PhotosHeaderProps) {
  return (
    <View>
      <AreaHeader
        testID="photos-header"
        title="Photos"
        subtitle={photosSubtitle(tripTitle, count)}
        titleTestID="photos-title"
        subtitleTestID="photos-subtitle"
        actions={<BarActions capture={capture} />}
      />
      <View
        style={{ paddingHorizontal: areaMargin(), paddingTop: Space[2], gap: Space[3] }}>
        <UploadSummaryPill summary={summary} onRetry={onRetryFailed} />
        {capture.message ? (
          <CaptureNotice
            message={capture.message}
            onDismiss={capture.clearMessage}
            onAllow={() => void capture.allowLibraryAccess()}
          />
        ) : null}
        <InlineError testID="photos-write-error" message={writeError} />
      </View>
    </View>
  );
}
