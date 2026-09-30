/**
 * The gallery header — tasks.md T117 (FR-028, FR-029; User Story 5,
 * Acceptance Scenarios 1, 2): back, title, the two ways to add photos, what a
 * capture came to, the write error, and the private-by-default note.
 *
 * The buttons are announced busy while a capture runs (the hook ignores a
 * second tap anyway). What a capture came to is said in words: an error as an
 * alert, anything else politely; a camera refusal the system will not ask
 * about again offers to open Settings (`Linking.openSettings` —
 * https://reactnative.dev/docs/linking).
 */
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { InlineError } from '@/components/ui/inline-error';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';
import type { CaptureMessage } from '@/features/photos/capture';
import { GALLERY_COPY, PHOTO_COPY, PRIVATE_COPY } from '@/features/photos/photo-copy';
import type { PhotoCapture } from '@/features/photos/use-capture';
import { Sentry } from '@/lib/sentry';

export type PhotosHeaderProps = {
  tripTitle: string | null;
  capture: PhotoCapture;
  /** A failed local write from the grid (a retry), in words. */
  writeError: string | null;
  onBack: () => void;
};

type CaptureNoticeProps = { message: CaptureMessage; onDismiss: () => void };

function CaptureNotice({ message, onDismiss }: CaptureNoticeProps) {
  const [settingsFailed, setSettingsFailed] = useState(false);
  const isError = message.tone === 'error';

  const openSettings = () => {
    Linking.openSettings().catch((error: unknown) => {
      Sentry.captureException(error);
      setSettingsFailed(true);
    });
  };

  return (
    <View style={styles.notice}>
      <ThemedText
        testID={isError ? 'photos-capture-error' : 'photos-capture-message'}
        type="small"
        themeColor={isError ? 'danger' : undefined}
        accessibilityRole={isError ? 'alert' : undefined}
        accessibilityLiveRegion={isError ? undefined : 'polite'}>
        {message.text}
      </ThemedText>
      {settingsFailed ? (
        <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
          {PHOTO_COPY.settingsUnavailable}
        </ThemedText>
      ) : null}
      <View style={styles.actions}>
        {message.openSettings ? (
          <PressableSurface
            accessibilityLabel={GALLERY_COPY.openSettingsLabel}
            onPress={openSettings}
            style={styles.action}>
            <ThemedText type="smallBold">{GALLERY_COPY.openSettingsLabel}</ThemedText>
          </PressableSurface>
        ) : null}
        <PressableSurface
          accessibilityLabel={GALLERY_COPY.dismissLabel}
          treatment="flat"
          onPress={onDismiss}
          style={styles.action}>
          <ThemedText type="smallBold">{GALLERY_COPY.dismissText}</ThemedText>
        </PressableSurface>
      </View>
    </View>
  );
}

export function PhotosHeader({
  tripTitle,
  capture,
  writeError,
  onBack,
}: PhotosHeaderProps) {
  return (
    <View style={styles.header}>
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={onBack}
        style={styles.action}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <ThemedText type="subtitle" testID="photos-title">
        {tripTitle ? `Photos · ${tripTitle}` : 'Photos'}
      </ThemedText>

      <View style={styles.actions}>
        <PressableSurface
          testID="photos-add"
          accessibilityLabel={GALLERY_COPY.addLabel}
          depth={2}
          busy={capture.busy}
          onPress={() => void capture.addFromLibrary()}
          style={styles.action}>
          <ThemedText type="smallBold">{GALLERY_COPY.addText}</ThemedText>
        </PressableSurface>
        <PressableSurface
          testID="photos-take"
          accessibilityLabel={GALLERY_COPY.takeLabel}
          depth={2}
          busy={capture.busy}
          onPress={() => void capture.takePhoto()}
          style={styles.action}>
          <ThemedText type="smallBold">{GALLERY_COPY.takeText}</ThemedText>
        </PressableSurface>
      </View>

      {capture.message ? (
        <CaptureNotice message={capture.message} onDismiss={capture.clearMessage} />
      ) : null}

      <InlineError testID="photos-write-error" message={writeError} />

      <ThemedText type="small" themeColor="textMuted">
        {PRIVATE_COPY}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.three },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  action: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  notice: { gap: Spacing.two },
});
