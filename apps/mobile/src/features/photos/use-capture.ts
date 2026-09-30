/**
 * Adding photos to a trip — tasks.md T116 (FR-028, FR-029; research D-34;
 * User Story 5, Acceptance Scenarios 1 and 2).
 *
 * Two ways in, both the system's own UI through expo-image-picker
 * (https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker.md):
 *
 *   - "Add photos": `launchImageLibraryAsync`, several images at once. No
 *     permission prompt — the system picker is itself the grant (iOS 14+
 *     PHPicker, Android's photo picker), which is why app.config.ts blocks
 *     the storage and media permissions outright.
 *   - "Take a photo": `requestCameraPermissionsAsync` first — the camera
 *     always needs the traveller's permission — then `launchCameraAsync`. A
 *     refusal is explained in words, pointing to Settings when the system
 *     will not ask again.
 *
 * Both ask for `exif: true`, which is where capture time and position come
 * from (FR-029). Per the v57 reference, iOS omits the GPS tags from a CAMERA
 * photo's EXIF, so a photo taken in the app is filed by hand; and Android
 * redacts the position of a library photo unless the app holds
 * ACCESS_MEDIA_LOCATION (see the task report).
 *
 * The picked assets are saved by capture.ts; this hook owns only the moment —
 * one capture at a time (a second tap while one runs is ignored), `busy` for
 * the buttons, and the sentence that says what happened. A capture that added
 * anything is followed at once by an upload attempt (upload.ts), which stays
 * quiet when there is no connection: the pending badge says it.
 *
 * Visibility posture: private by default — photos are written private and
 * nothing here offers to share them (per-photo visibility is User Story 7).
 */
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';

import { useDatabase } from '@/db/client';
import { Sentry } from '@/lib/sentry';

import {
  describeCapture,
  saveCapturedPhotos,
  type CaptureAsset,
  type CaptureMessage,
} from './capture';
import { PHOTO_COPY } from './photo-copy';
import { uploadPendingPhotos } from './upload';

/** A pick of more than this is cut short by the system picker. */
export const MAX_PHOTOS_PER_PICK = 20;

const LIBRARY_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: true,
  selectionLimit: MAX_PHOTOS_PER_PICK,
  orderedSelection: true,
  exif: true,
  // The original, untouched: it is re-encoded here anyway (reencode.ts).
  quality: 1,
};

const CAMERA_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  exif: true,
  quality: 1,
};

type Picked =
  | { kind: 'assets'; assets: CaptureAsset[] }
  | { kind: 'cancelled' }
  | { kind: 'refused'; message: CaptureMessage };

function fromResult(result: ImagePicker.ImagePickerResult): Picked {
  return result.canceled
    ? { kind: 'cancelled' }
    : { kind: 'assets', assets: result.assets };
}

function refused(text: string, openSettings = false): Picked {
  return {
    kind: 'refused',
    message: openSettings
      ? { tone: 'error', text, openSettings }
      : { tone: 'error', text },
  };
}

async function pickFromLibrary(): Promise<Picked> {
  try {
    return fromResult(await ImagePicker.launchImageLibraryAsync(LIBRARY_OPTIONS));
  } catch (error) {
    Sentry.captureException(error);
    return refused(PHOTO_COPY.libraryUnavailable);
  }
}

async function pickFromCamera(): Promise<Picked> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return permission.canAskAgain
        ? refused(PHOTO_COPY.cameraDeclined)
        : refused(PHOTO_COPY.cameraBlocked, true);
    }
    return fromResult(await ImagePicker.launchCameraAsync(CAMERA_OPTIONS));
  } catch (error) {
    Sentry.captureException(error);
    return refused(PHOTO_COPY.cameraUnavailable);
  }
}

export interface PhotoCapture {
  /** A capture is running; the buttons show it and further taps are ignored. */
  busy: boolean;
  /** What the last capture came to, or null. */
  message: CaptureMessage | null;
  clearMessage: () => void;
  /** Never rejects. */
  addFromLibrary: () => Promise<void>;
  /** Never rejects. */
  takePhoto: () => Promise<void>;
}

export function useCapture(tripId: string): PhotoCapture {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CaptureMessage | null>(null);
  const running = useRef(false);

  const save = async (assets: readonly CaptureAsset[]) => {
    try {
      const outcomes = await saveCapturedPhotos(db, tripId, assets);
      setMessage(describeCapture(outcomes));
      if (outcomes.some((outcome) => outcome.kind === 'added')) {
        void uploadPendingPhotos(db, tripId);
      }
    } catch (error) {
      Sentry.captureException(error);
      setMessage({ tone: 'error', text: PHOTO_COPY.saveFailed });
    }
  };

  const capture = async (pick: () => Promise<Picked>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const picked = await pick();
      if (picked.kind === 'refused') setMessage(picked.message);
      if (picked.kind === 'assets') await save(picked.assets);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return {
    busy,
    message,
    clearMessage: () => setMessage(null),
    addFromLibrary: () => capture(pickFromLibrary),
    takePhoto: () => capture(pickFromCamera),
  };
}
