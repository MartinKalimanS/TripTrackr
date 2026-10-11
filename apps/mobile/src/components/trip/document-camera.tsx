/**
 * The live camera for a document — tasks.md T118; restyled for Atlas by 004 T443
 * (contract C4-10 rule 9; FR-005, FR-019, FR-033, FR-034, FR-035; research D-33).
 *
 * A boarding pass is scanned live for PDF417, Aztec and QR — `onBarcodeScanned`
 * is handed over only once `onCameraReady` has fired, as the v57 reference asks
 * for `takePictureAsync` (https://docs.expo.dev/versions/v57.0.0/sdk/camera.md)
 * — and the first barcode takes the picture. Any other document is
 * photographed, not scanned. The shutter is always there: a pass whose barcode
 * will not scan is photographed by hand and its picture searched afterwards.
 *
 * The preview blocks screen capture like every screen that shows a document
 * (FR-034). The preview is the full width of the screen in a hairline `MediaFrame`
 * (a boundary where the picture's edge meets the canvas, and nothing else), and the
 * controls sit BELOW the frame, not over it: nothing is drawn across the picture, no
 * scrim, tint, shadow or translucent control (FR-033), so there is no colour to invent
 * and nothing that could hide a barcode. The shutter is an opaque primary `Button` (the
 * one primary of the capture screen while the camera is live, FR-005): busy while a
 * capture is under way, inert until the camera is ready.
 * The `CameraView` is mounted only while permission is granted and this screen
 * is showing; the v57 reference allows one active preview at a time.
 *
 * Visibility posture: nothing a preview sees leaves the device from here.
 */
import type { DocumentType } from '@triptrackr/contracts';
import { CameraView } from 'expo-camera';
import { useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { MediaFrame } from '@/components/ui/media-frame';
import { Text } from '@/components/ui/text';
import { PASS_BARCODE_TYPES } from '@/features/documents/capture';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';

export type DocumentCameraProps = {
  type: DocumentType;
  /** A capture is under way: the shutter is inert and the scanner stops listening. */
  busy: boolean;
  cameraRef: RefObject<CameraView | null>;
  onBarcode: (scan: { data: string }) => void;
  onShutter: () => void;
};

const CAMERA: IconName = { ios: 'camera', android: 'photo_camera' };

export function DocumentCamera({
  type,
  busy,
  cameraRef,
  onBarcode,
  onShutter,
}: DocumentCameraProps) {
  useScreenCaptureGuard();
  const [ready, setReady] = useState(false);
  const scanning = ready && !busy && type === 'boarding_pass';

  return (
    <View className="gap-4">
      <MediaFrame
        radius="lg"
        style={styles.frame}
        accessible
        accessibilityLabel="Camera preview">
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={
            type === 'boarding_pass' ? { barcodeTypes: PASS_BARCODE_TYPES } : undefined
          }
          onCameraReady={() => setReady(true)}
          onBarcodeScanned={scanning ? onBarcode : undefined}
        />
      </MediaFrame>

      <Button
        testID="document-capture-shutter"
        variant="primary"
        size="lg"
        icon={CAMERA}
        accessibilityLabel="Take photo"
        busy={busy}
        disabled={!ready && !busy}
        onPress={onShutter}>
        Take photo
      </Button>
      {ready ? null : (
        <Text type="callout" tone="muted">
          Starting the camera…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4 },
  camera: { flex: 1 },
});
