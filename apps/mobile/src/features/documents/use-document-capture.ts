/**
 * The capture flow's behaviour — tasks.md T118 (FR-031, FR-033, FR-035; research
 * D-32, D-33; Constitution II).
 *
 * Three ways in, one way out. A barcode `CameraView` sees, the shutter, or an
 * image picked from the library each end at `useDocumentActions().store`,
 * which re-encodes, seals and writes the row locally, and then the screen
 * replaces itself with the saved document. A boarding pass is opened for
 * review straight away, its fields pre-filled or empty — a barcode that cannot
 * be read is manual entry, never an error (spec Edge Cases).
 *
 * Only one capture runs at a time: the live scanner reports the same barcode
 * on every frame it stays in view, so a lock held in a ref (state would not
 * update between two calls in the same frame) turns all but the first into
 * nothing. The lock is released when the capture fails, so the next barcode or
 * tap still counts, and kept when it succeeds, so the screen cannot store the
 * same pass twice while it is on its way out.
 *
 * `takePictureAsync` is the v57 reference's (wait for `onCameraReady` first;
 * https://docs.expo.dev/versions/v57.0.0/sdk/camera.md). What it and the
 * picker return is plaintext in the cache; `storeDocument` deletes it.
 *
 * Visibility posture: owner-only. A capture is stored on this device, sealed;
 * nothing here can send it anywhere but the owner's own account via the
 * upload that `store` starts.
 */
import type { DocumentParsedFields, DocumentType } from '@triptrackr/contracts';
import type { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';

import type { DocumentRow } from '@/db/schema';
import { todayIso } from '@/features/trips/stop-dates';
import { StorageFullError, isOutOfSpaceError } from '@/lib/disk-space';
import { Sentry } from '@/lib/sentry';

import { fieldsFromScans, pickDocumentImage, scanImageForPass } from './capture';
import { DOCUMENT_CAPTURE_COPY } from './document-copy';
import { useDocumentActions } from './use-documents';

/**
 * What went wrong, if anything, in the words of `DOCUMENT_CAPTURE_COPY`.
 * `space` (T139) is the device being full: the traveller's circumstance, so
 * it is shown and never reported, and nothing was stored.
 */
export type CaptureProblem = 'capture' | 'save' | 'library' | 'space';

export const CAPTURE_PROBLEM_TEXT: Readonly<Record<CaptureProblem, string>> = {
  capture: DOCUMENT_CAPTURE_COPY.captureFailed,
  save: DOCUMENT_CAPTURE_COPY.saveFailed,
  library: DOCUMENT_CAPTURE_COPY.libraryFailed,
  space: DOCUMENT_CAPTURE_COPY.noSpace,
};

/**
 * Where a saved document opens: a pass for review, anything else as it is.
 * A template-literal type, not `string`, so `router.replace` still accepts it
 * when the typed-routes declarations are regenerated for the new routes.
 */
export type DocumentHref =
  `/trip/${string}/document-view?documentId=${string}${'' | '&review=1'}`;

export function documentHref(tripId: string, document: DocumentRow): DocumentHref {
  return document.type === 'boarding_pass'
    ? `/trip/${tripId}/document-view?documentId=${document.id}&review=1`
    : `/trip/${tripId}/document-view?documentId=${document.id}`;
}

export interface DocumentCapture {
  cameraRef: RefObject<CameraView | null>;
  /** A capture is under way (or has succeeded and the screen is leaving). */
  busy: boolean;
  problem: CaptureProblem | null;
  /** A barcode the live scanner decoded. */
  onBarcode: (scan: { data: string }) => void;
  /** The shutter: a picture, then a search of it for a pass barcode. */
  onShutter: () => void;
  /** The library: one picture, then a search of it for a pass barcode. */
  onLibrary: () => void;
}

/** `undefined`: no barcode was seen, so a pass's picture is searched for one. */
type Seen = DocumentParsedFields | null | undefined;

export function useDocumentCapture(tripId: string, type: DocumentType): DocumentCapture {
  const router = useRouter();
  const actions = useDocumentActions();
  const cameraRef = useRef<CameraView>(null);
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<CaptureProblem | null>(null);

  /**
   * A full device is the traveller's circumstance, whichever step found it
   * (the camera's own write, the re-encode, the seal): shown as `space`,
   * never reported. Anything else is a defect and is (FR-073).
   */
  const fail = (kind: CaptureProblem, error: unknown): false => {
    if (error instanceof StorageFullError || isOutOfSpaceError(error)) {
      setProblem('space');
      return false;
    }
    Sentry.captureException(error);
    setProblem(kind);
    return false;
  };

  /** Fields for a picture: those already read, or a pass's picture searched. */
  const fieldsFor = async (uri: string, seen: Seen) => {
    if (seen !== undefined) return seen;
    return type === 'boarding_pass' ? scanImageForPass(uri, todayIso()) : null;
  };

  /** Store a picture and open it. True once the screen is on its way out. */
  const storeAndOpen = async (uri: string, seen: Seen): Promise<boolean> => {
    try {
      const parsed = await fieldsFor(uri, seen);
      const document = await actions.store({ tripId, type, temporaryUri: uri, parsed });
      router.replace(documentHref(tripId, document));
      return true;
    } catch (error) {
      return fail('save', error);
    }
  };

  const takePicture = async (): Promise<string | null> => {
    try {
      const picture = await cameraRef.current?.takePictureAsync({
        exif: false,
        base64: false,
      });
      if (!picture) throw new Error('The camera is not ready');
      return picture.uri;
    } catch (error) {
      fail('capture', error);
      return null;
    }
  };

  const fromCamera = async (seen: Seen): Promise<boolean> => {
    const uri = await takePicture();
    return uri === null ? false : storeAndOpen(uri, seen);
  };

  const fromLibrary = async (): Promise<boolean> => {
    let uri: string | null;
    try {
      uri = await pickDocumentImage();
    } catch (error) {
      return fail('library', error);
    }
    return uri === null ? false : storeAndOpen(uri, undefined);
  };

  const exclusive = async (job: () => Promise<boolean>): Promise<void> => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setProblem(null);
    const leaving = await job();
    if (leaving) return;
    working.current = false;
    setBusy(false);
  };

  return {
    cameraRef,
    busy,
    problem,
    onBarcode: (scan) =>
      void exclusive(() => fromCamera(fieldsFromScans([scan], todayIso()))),
    onShutter: () => void exclusive(() => fromCamera(undefined)),
    onLibrary: () => void exclusive(fromLibrary),
  };
}
