/**
 * The camera is not allowed (yet) — tasks.md T118 (FR-031; feature 002 FR-010).
 *
 * Two designed states, both in words and neither a dead end. Not yet allowed
 * (`canAskAgain`): why the camera is wanted, and a button that asks. Refused
 * for good: what that means, and a button to Settings, where it can be turned
 * back on. The library stays offered beside this panel in both, so a document
 * can always be added without the camera.
 */
import { Linking, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Surface } from '@/components/ui/surface';
import { Spacing } from '@/constants/theme';
import { DOCUMENT_CAPTURE_COPY } from '@/features/documents/document-copy';
import { Sentry } from '@/lib/sentry';

export type DocumentCameraPermissionProps = {
  /** False once the system will no longer show its prompt. */
  canAskAgain: boolean;
  onAllow: () => void;
};

function openSettings() {
  Linking.openSettings().catch((error: unknown) => Sentry.captureException(error));
}

export function DocumentCameraPermission({
  canAskAgain,
  onAllow,
}: DocumentCameraPermissionProps) {
  return (
    <Surface treatment="recessed" depth={1} radius="lg" style={styles.panel}>
      <ThemedText type="smallBold">
        {canAskAgain ? 'Allow the camera' : 'The camera is turned off'}
      </ThemedText>
      <ThemedText testID="document-camera-permission" type="small" themeColor="textMuted">
        {canAskAgain
          ? DOCUMENT_CAPTURE_COPY.cameraAsk
          : DOCUMENT_CAPTURE_COPY.cameraDenied}
      </ThemedText>
      {canAskAgain ? (
        <PressableSurface
          testID="document-camera-allow"
          accessibilityLabel="Allow camera"
          depth={2}
          onPress={onAllow}
          style={styles.action}>
          <ThemedText type="smallBold">Allow camera</ThemedText>
        </PressableSurface>
      ) : (
        <PressableSurface
          testID="document-camera-settings"
          accessibilityLabel="Open Settings"
          depth={2}
          onPress={openSettings}
          style={styles.action}>
          <ThemedText type="smallBold">Open Settings</ThemedText>
        </PressableSurface>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: { padding: Spacing.four, gap: Spacing.two },
  action: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
});
