/**
 * Add a document to a trip — tasks.md T118 (FR-031, FR-033, FR-034, FR-035);
 * research D-32, D-33; restyled for Atlas by 004 T443 (contract C4-10; FR-005, FR-015,
 * FR-033, FR-037).
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
 * A camera surface keeps its own bar instead of the navigation header
 * (`trip/[id]/_layout.tsx` leaves `document-capture` headerless, on purpose): the preview
 * wants the whole width and as much of the height as the page can give, a second title
 * would repeat `document-capture-title`, and the bar below carries the Back it always had
 * (named "Back", `Button` text variant, which, unlike a header's, grows with the text size
 * and always shows its word). The camera preview is the full width of the screen in a
 * hairline frame, and every control is OUTSIDE it and opaque: nothing is drawn across the
 * picture (FR-033). One primary per state (FR-005): the shutter while the camera is live,
 * "Allow camera" or "Open Settings" when it is not; the library is secondary throughout.
 *
 * Visibility posture: owner-only. Nothing on this screen shares, exports or
 * publishes a document, and none can (FR-032).
 */
import type { DocumentType } from '@triptrackr/contracts';
import { useCameraPermissions, type PermissionResponse } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { DocumentCamera } from '@/components/trip/document-camera';
import { DocumentCameraPermission } from '@/components/trip/document-camera-permission';
import { Button } from '@/components/ui/button';
import { ChipGroup, type ChipOption } from '@/components/ui/chip';
import type { IconName } from '@/components/ui/icon';
import { InlineError } from '@/components/ui/inline-error';
import { Screen } from '@/components/ui/screen';
import { LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
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

const TYPE_OPTIONS: readonly ChipOption[] = (
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

const BACK: IconName = 'chevron-left';
const LIBRARY: IconName = 'images';

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

/** What went wrong with this capture, in words: the scanner's and the store's apart. */
function CaptureProblems({ problem }: { problem: DocumentCapture['problem'] }) {
  return (
    <>
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
    </>
  );
}

/** The screen's own bar: the way back, then the title, wrapping under large text. */
function CaptureBar({ onBack }: { onBack: () => void }) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        variant="text"
        size="sm"
        icon={BACK}
        accessibilityLabel="Back"
        onPress={onBack}>
        Back
      </Button>
      <Text type="title" testID="document-capture-title">
        Add a document
      </Text>
    </View>
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

  return (
    <Screen testID="document-capture-screen">
      <CaptureBar onBack={() => router.back()} />

      <ChipGroup
        options={TYPE_OPTIONS}
        selectedKey={type}
        onSelect={(key) => setType(key as DocumentType)}
      />
      <Text type="callout" tone="muted" testID="document-capture-hint">
        {HINTS[type]}
      </Text>

      <CameraArea
        permission={permission}
        onAllow={() => void requestPermission()}
        type={type}
        capture={capture}
      />

      <CaptureProblems problem={capture.problem} />
      {capture.busy ? (
        <Text type="callout" accessibilityLiveRegion="polite">
          Saving to this device…
        </Text>
      ) : null}

      <Button
        testID="document-capture-library"
        variant="secondary"
        icon={LIBRARY}
        accessibilityLabel="Choose from library"
        busy={capture.busy}
        onPress={capture.onLibrary}>
        Choose from library
      </Button>
    </Screen>
  );
}
