/**
 * Adding photos to a trip — tasks.md T116 (FR-028, FR-029; research D-34; User Story 5,
 * Acceptance Scenarios 1 and 2), amended by spec 006 (owner decision 2026-10-22: the app asks
 * for the photo library, and asks who can see what was chosen).
 *
 * Two ways in, both the system's own UI through expo-image-picker
 * (https://docs.expo.dev/versions/v57.0.0/sdk/imagepicker.md):
 *
 *   - "Add photos": the library permission is checked first (library-permission.ts) and asked
 *     for when it is undetermined; only when it is granted, or limited to the photos the
 *     traveller shared (iOS 14+, Android 14+), does `launchImageLibraryAsync` open, for several
 *     images at once. A refusal opens nothing and is said in words: "Allow photo access" while
 *     the system will still ask, "Open Settings" once it will not. The notice's own action,
 *     `allowLibraryAccess`, asks again.
 *   - "Take a photo": `requestCameraPermissionsAsync` first — the camera always needs the
 *     traveller's permission, and it is the only permission this path needs — then
 *     `launchCameraAsync`. A refusal is explained in words, pointing to Settings when the system
 *     will not ask again.
 *
 * Both ask for `exif: true`, which is where capture time and position come from (FR-029). Per
 * the v57 reference, iOS omits the GPS tags from a CAMERA photo's EXIF, so a photo taken in the
 * app is filed by hand; and Android redacts the position of a library photo (plan D6-06).
 *
 * When either picker hands back at least one photo, nothing is written yet: `prompt` opens and
 * the screen's sheet asks "Who can see these photos?". `answerPrompt('public')` stores them
 * public; `answerPrompt('private')` and every other way out — `dismissPrompt` (the swipe, a
 * tap outside, Android's Back), or the screen being left — store them private, and the photos
 * are added all the same. The first answer wins. The choice applies to every photo of the pick,
 * each stored with its own `is_public` (capture.ts).
 *
 * The picked assets are saved by capture.ts; this hook owns only the moment — one capture at a
 * time (a second tap while one runs, the question included, is ignored), `busy` for the buttons,
 * and the sentence that says what happened. A capture that added anything then asks the upload
 * queue to look for work (`kickUploadQueue`, sync/upload-queue.ts — T134): at once on Wi-Fi,
 * after its cellular hold-back otherwise, and quietly not at all when there is no connection:
 * the pending badge says it. A capture that could not be saved — the device is out of space
 * included (T139) — leaves no row and no file and kicks nothing.
 *
 * Visibility posture: private by default — no answer is private; a public choice is stored and
 * carried to the account as an ordinary change after the bytes are registered (upload.ts), and
 * grants nobody access before screening and the sharing story exist (spec 006 privacy posture).
 * Nothing here logs a photo, a file name or a position.
 */
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';

import { useDatabase } from '@/db/client';
import { Sentry } from '@/lib/sentry';
import { kickUploadQueue } from '@/sync/upload-queue';

import {
  describeCapture,
  saveCapturedPhotos,
  type CaptureAsset,
  type CaptureMessage,
  type PhotoVisibility,
} from './capture';
import {
  checkLibraryAccess,
  requestLibraryAccess,
  type LibraryAnswer,
} from './library-permission';
import { PHOTO_COPY } from './photo-copy';

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
  return result.canceled || result.assets.length === 0
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

/** The library permission is off: what the notice says, and which action it offers. */
function libraryRefused(canAskAgain: boolean): Picked {
  const message: CaptureMessage = canAskAgain
    ? { tone: 'error', text: PHOTO_COPY.libraryDeclined, permission: 'library' }
    : {
        tone: 'error',
        text: PHOTO_COPY.libraryBlocked,
        permission: 'library',
        openSettings: true,
      };
  return { kind: 'refused', message };
}

/**
 * Where the library permission stands, asking when that is the next step: always when it is
 * undetermined, and when it was refused only if the traveller asked again on purpose and the
 * system will still show its dialog.
 */
async function libraryAccess(askAgain: boolean): Promise<LibraryAnswer> {
  const current = await checkLibraryAccess();
  if (current.state === 'granted' || current.state === 'limited') return current;
  if (current.state === 'denied' && !(askAgain && current.canAskAgain)) return current;
  return requestLibraryAccess();
}

async function pickFromLibrary(askAgain: boolean): Promise<Picked> {
  try {
    const access = await libraryAccess(askAgain);
    if (access.state === 'denied') return libraryRefused(access.canAskAgain);
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

/** The question the screen's sheet asks while photos wait to be added. */
export interface VisibilityPrompt {
  /** How many photos the pick returned. */
  count: number;
}

export interface PhotoCapture {
  /** A capture is running, the question included; the buttons show it and taps are ignored. */
  busy: boolean;
  /** What the last capture came to, or null. */
  message: CaptureMessage | null;
  clearMessage: () => void;
  /** Photos are chosen and waiting for "who can see these?"; null when nothing is asked. */
  prompt: VisibilityPrompt | null;
  /** The traveller's choice: the waiting photos are added with it. The first answer wins. */
  answerPrompt: (visibility: PhotoVisibility) => void;
  /** Any other way out of the question (swipe, tap outside, Back): private. */
  dismissPrompt: () => void;
  /** Never rejects. */
  addFromLibrary: () => Promise<void>;
  /** "Allow photo access": ask again, then open the picker. Never rejects. */
  allowLibraryAccess: () => Promise<void>;
  /** Never rejects. */
  takePhoto: () => Promise<void>;
}

export function useCapture(tripId: string): PhotoCapture {
  const db = useDatabase();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<CaptureMessage | null>(null);
  const [prompt, setPrompt] = useState<VisibilityPrompt | null>(null);
  const running = useRef(false);
  const answering = useRef<((visibility: PhotoVisibility) => void) | null>(null);

  // A screen left with the question open is no answer: the photos are still added, private.
  useEffect(
    () => () => {
      answering.current?.('private');
      answering.current = null;
    },
    [],
  );

  const askVisibility = (count: number) =>
    new Promise<PhotoVisibility>((resolve) => {
      answering.current = resolve;
      setPrompt({ count });
    });

  const answerPrompt = (visibility: PhotoVisibility) => {
    const resolve = answering.current;
    answering.current = null;
    setPrompt(null);
    resolve?.(visibility);
  };

  const save = async (assets: readonly CaptureAsset[], visibility: PhotoVisibility) => {
    try {
      const outcomes = await saveCapturedPhotos(db, tripId, assets, visibility);
      setMessage(describeCapture(outcomes));
      if (outcomes.some((outcome) => outcome.kind === 'added')) {
        void kickUploadQueue('capture');
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
      if (picked.kind === 'assets') {
        await save(picked.assets, await askVisibility(picked.assets.length));
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return {
    busy,
    message,
    clearMessage: () => setMessage(null),
    prompt,
    answerPrompt,
    dismissPrompt: () => answerPrompt('private'),
    addFromLibrary: () => capture(() => pickFromLibrary(false)),
    allowLibraryAccess: () => capture(() => pickFromLibrary(true)),
    takePhoto: () => capture(pickFromCamera),
  };
}
