/**
 * Add a document to a trip — tasks.md T118 (FR-031, FR-033, FR-034, FR-035);
 * research D-32, D-33.
 *
 * Three ways in: the camera scans a boarding pass's barcode live (the first
 * one takes the picture), the shutter photographs any document, and the
 * library supplies a picture already taken. Every way ends at the local,
 * sealed store and then at the document itself — a pass straight into review,
 * its fields pre-filled from the barcode or empty for manual entry. A camera
 * that is not allowed is explained in words, with the library still offered:
 * a document can always be added.
 *
 * This screen shows a document as it is captured, so it blocks screen capture
 * (FR-034). `useCameraPermissions` is expo-camera's v57 hook; a `null` answer
 * is "still asking the system", a designed state of its own.
 *
 * Visibility posture: owner-only. Nothing on this screen shares, exports or
 * publishes a document, and none can (FR-032).
 */
import type { DocumentType } from '@triptrackr/contracts';
import { useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DocumentCamera } from '@/components/trip/document-camera';
import { DocumentCameraPermission } from '@/components/trip/document-camera-permission';
import { InlineError } from '@/components/ui/inline-error';
import { PillGroup, type PillOption } from '@/components/ui/pill-group';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { Screen } from '@/components/ui/screen';
import { LoadingState } from '@/components/ui/state-view';
import { Spacing } from '@/constants/theme';
import {
  DOCUMENT_CAPTURE_COPY,
  DOCUMENT_TYPE_LABELS,
} from '@/features/documents/document-copy';
import {
  CAPTURE_PROBLEM_TEXT,
  useDocumentCapture,
  type DocumentCapture,
} from '@/features/documents/use-document-capture';
import { useScreenCaptureGuard } from '@/features/documents/use-screen-capture-guard';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const TYPE_OPTIONS: readonly PillOption[] = (
  ['boarding_pass', 'booking', 'other'] as const
).map((type) => ({
  key: type,
  label: DOCUMENT_TYPE_LABELS[type],
  testID: `document-type-${type}`,
  accessibilityLabel: DOCUMENT_TYPE_LABELS[type],
}));

const HINTS: Readonly<Record<DocumentType, string>> = {
  boarding_pass:
    'Hold the pass so its barcode is in view. The picture is taken as soon as the barcode is read, and the flight details are filled in for you to check.',
  booking: 'Fill the frame with the booking, then take the photo.',
  other: 'Fill the frame with the document, then take the photo.',
};

type CameraAreaProps = {
  permission: PermissionResponse | null;
  onAllow: () => void;
  type: DocumentType;
  capture: DocumentCapture;
};

/** Whichever of checking, asking, refused or live the camera is in. */
function CameraArea({ permission, onAllow, type, capture }: CameraAreaProps) {
  if (permission === null) {
    return <LoadingState title={DOCUMENT_CAPTURE_COPY.cameraChecking} />;
  }
  if (!permission.granted) {
    return (
      <DocumentCameraPermission canAskAgain={permission.canAskAgain} onAllow={onAllow} />
    );
  }
  return (
    <DocumentCamera
      type={type}
      busy={capture.busy}
      cameraRef={capture.cameraRef}
      onBarcode={capture.onBarcode}
      onShutter={capture.onShutter}
    />
  );
}

export default function DocumentCaptureScreen() {
  useScreenCaptureGuard();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const tripId = firstParam(id) ?? '';
  const [type, setType] = useState<DocumentType>('boarding_pass');
  const capture = useDocumentCapture(tripId, type);
  const [permission, requestPermission] = useCameraPermissions();
  const { problem } = capture;

  return (
    <Screen testID="document-capture-screen">
      <PressableSurface
        accessibilityLabel="Back"
        treatment="flat"
        onPress={() => router.back()}
        style={styles.back}>
        <ThemedText type="smallBold">Back</ThemedText>
      </PressableSurface>

      <ThemedText type="subtitle" testID="document-capture-title">
        Add a document
      </ThemedText>

      <PillGroup
        options={TYPE_OPTIONS}
        selectedKey={type}
        onSelect={(key) => setType(key as DocumentType)}
      />
      <ThemedText type="small" themeColor="textMuted" testID="document-capture-hint">
        {HINTS[type]}
      </ThemedText>

      <CameraArea
        permission={permission}
        onAllow={() => void requestPermission()}
        type={type}
        capture={capture}
      />

      <InlineError
        testID="document-scanner-error"
        message={problem === 'capture' ? CAPTURE_PROBLEM_TEXT.capture : null}
      />
      <InlineError
        testID="document-capture-error"
        message={
          problem === 'save' || problem === 'library' || problem === 'space'
            ? CAPTURE_PROBLEM_TEXT[problem]
            : null
        }
      />
      {capture.busy ? (
        <ThemedText type="small" accessibilityLiveRegion="polite">
          Saving to this device…
        </ThemedText>
      ) : null}

      <PressableSurface
        testID="document-capture-library"
        accessibilityLabel="Choose from library"
        treatment="flat"
        busy={capture.busy}
        onPress={capture.onLibrary}
        style={styles.library}>
        <ThemedText type="smallBold" style={styles.centred}>
          Choose from library
        </ThemedText>
      </PressableSurface>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  library: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  centred: { textAlign: 'center' },
});
