/**
 * The camera is not allowed (yet) — tasks.md T118 (FR-031; feature 002 FR-010); restyled for
 * Atlas by 004 T443 (contract C4-10; FR-005, FR-025, FR-029, FR-035), and the refusal for
 * Sunrise Passport by T559 (FR-066; contract C5-28).
 *
 * Two designed states, both in words and neither a dead end. Not yet allowed
 * (`canAskAgain`): why the camera is wanted, and a button that asks. Refused
 * for good: what that means, and a button to Settings, where it can be turned
 * back on. The library stays offered beside this panel in both, so a document
 * can always be added without the camera.
 *
 * Each has ONE way forward, the screen's one primary while the camera cannot start (the library
 * is a secondary beneath it). The refusal is the shared `PermissionState` (an icon in a roundel,
 * what is off, what to do, "Open Settings" as that primary, a polite live region), so it reads
 * the same here as in the gallery. Nothing here is colour alone.
 */
import { Linking, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PermissionState } from '@/components/ui/permission-state';
import { Text } from '@/components/ui/text';
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
  if (!canAskAgain) {
    return (
      <PermissionState
        testID="document-camera-denied"
        accessibilityLiveRegion="polite"
        icon="camera"
        title="The camera is turned off"
        detail={DOCUMENT_CAPTURE_COPY.cameraDenied}
        detailTestID="document-camera-permission"
        settingsTestID="document-camera-settings"
        primary
        onOpenSettings={openSettings}
      />
    );
  }
  return (
    <Card variant="tile">
      <View className="items-start gap-2">
        <Text variant="callout">Allow the camera</Text>
        <Text testID="document-camera-permission" variant="label" tone="muted">
          {DOCUMENT_CAPTURE_COPY.cameraAsk}
        </Text>
        <Button
          testID="document-camera-allow"
          variant="primary"
          accessibilityLabel="Allow camera"
          onPress={onAllow}
          className="mt-2">
          Allow camera
        </Button>
      </View>
    </Card>
  );
}
