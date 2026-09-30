/**
 * The live camera for a document — tasks.md T118 (FR-031, FR-034, FR-035;
 * research D-33).
 *
 * A boarding pass is scanned live for PDF417, Aztec and QR — `onBarcodeScanned`
 * is handed over only once `onCameraReady` has fired, as the v57 reference asks
 * for `takePictureAsync` (https://docs.expo.dev/versions/v57.0.0/sdk/camera.md)
 * — and the first barcode takes the picture. Any other document is
 * photographed, not scanned. The shutter is always there: a pass whose barcode
 * will not scan is photographed by hand and its picture searched afterwards.
 *
 * The preview blocks screen capture like every screen that shows a document
 * (FR-034). The controls sit below the frame, not over it, so nothing is drawn
 * across the picture (feature 002 FR-024) and there is no colour to invent.
 * The `CameraView` is mounted only while permission is granted and this screen
 * is showing; the v57 reference allows one active preview at a time.
 *
 * Visibility posture: nothing a preview sees leaves the device from here.
 */
import type { DocumentType } from '@triptrackr/contracts';
import { CameraView } from 'expo-camera';
import { useState, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MediaFrame } from '@/components/ui/media-frame';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Spacing } from '@/constants/theme';
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
    <View style={styles.column}>
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

      <PressableSurface
        testID="document-capture-shutter"
        accessibilityLabel="Take photo"
        depth={2}
        busy={busy}
        disabled={!ready && !busy}
        onPress={onShutter}
        style={styles.shutter}>
        <ThemedText type="smallBold" style={styles.centred}>
          Take photo
        </ThemedText>
      </PressableSurface>
      {ready ? null : (
        <ThemedText type="small" themeColor="textMuted">
          Starting the camera…
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: Spacing.three },
  frame: { width: '100%', aspectRatio: 3 / 4 },
  camera: { flex: 1 },
  shutter: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
