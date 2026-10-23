/**
 * The words the photo pipeline and gallery say — tasks.md T116, T117 (FR-041;
 * feature 002 FR-010: state in words, never colour alone).
 *
 * Kept in one place so a failure reads the same wherever it surfaces, and so
 * "Waiting to upload" — the counter-signal Constitution II requires for a
 * photo whose bytes have not arrived — is one phrase, not several.
 */
export const PHOTO_COPY = {
  noSpace: 'There isn’t enough free space on this device. Free some space and try again.',
  unreadable: 'This image couldn’t be read. Try a different photo.',
  saveFailed: 'The photo couldn’t be saved on this device. Please try again.',
  libraryUnavailable: 'Your photo library couldn’t be opened. Please try again.',
  cameraUnavailable: 'The camera couldn’t be opened. Please try again.',
  cameraDeclined:
    'TripTrackr needs your permission to use the camera. Tap “Take a photo” to be asked again.',
  cameraBlocked:
    'Camera access is turned off for TripTrackr. You can turn it on in Settings.',
  /** The library permission was refused and the system will still ask (spec 006 FR-004). */
  libraryDeclined:
    'TripTrackr needs your permission to read the photos you choose. Tap “Allow photo access” to be asked again.',
  /** ... and the system will not ask again. */
  libraryBlocked:
    'Photo access is turned off for TripTrackr. You can turn it on in Settings.',
  settingsUnavailable: 'Settings couldn’t be opened. Open them from your home screen.',
  /** A refile, a delete or a retry — all local writes — that did not commit. */
  writeFailed: 'That change couldn’t be saved on this device. Please try again.',
} as const;

/** The tail of a partial result, per reason: "1 couldn’t be read — try a different photo." */
export const PARTIAL_FAILURE_COPY = {
  noSpace: 'couldn’t be saved — there isn’t enough free space on this device.',
  unreadable: 'couldn’t be read — try a different photo.',
  failed: 'couldn’t be saved on this device — please try again.',
} as const;

/** Where a photo's bytes are, as the gallery says it. */
export const UPLOAD_STATE_COPY = {
  pending: {
    badge: 'Waiting to upload',
    detail: 'Saved on this device only. It uploads when you’re online.',
  },
  failed: {
    badge: 'Upload failed',
    detail: 'This photo couldn’t be uploaded. Try again, or delete it and add it again.',
  },
  uploaded: {
    badge: 'Uploaded',
    detail: 'Uploaded to your account.',
  },
} as const;

/**
 * The sheet that asks who can see the photos just chosen (spec 006 FR-006 to FR-010). The
 * owner's words for the two choices; `note` is the honest line: the public trip view and the
 * screening provider are not built, so a public photo is seen only by its owner for now, and
 * leaving the sheet any way at all adds the photos as private.
 */
export const VISIBILITY_COPY = {
  titleMany: 'Who can see these photos?',
  titleOne: 'Who can see this photo?',
  privateTitle: 'Private',
  privateDetail: 'Only you',
  publicTitle: 'Public',
  publicDetail: 'Can appear on a trip you choose to share',
  publicExtra: 'Nothing is shared until you publish a trip',
  note: 'Sharing isn’t available yet, so for now only you can see a public photo. Closing this adds the photos as private.',
  closeText: 'Close',
} as const;

/** The primary of the sheet: "Add 1 photo", "Add 12 photos". */
export function addPhotosLabel(count: number): string {
  return count === 1 ? 'Add 1 photo' : `Add ${count} photos`;
}

/** The visibility posture, told to the traveller in words. */
export const PRIVATE_COPY = 'Private — only you can see your photos.';

/**
 * The gallery's own words: its states, its controls, and the photo view.
 * Each control has a short visible `…Text` and the longer spoken `…Label`
 * (touch targets are named for what they do, not just what they say).
 */
export const GALLERY_COPY = {
  loading: 'Loading photos',
  readFailedTitle: 'Couldn’t read the photos',
  readFailedDetail: 'The local store did not answer.',
  emptyTitle: 'No photos yet',
  emptyDetail:
    'Add photos from your library or take one with the camera. They stay on this device until they upload.',
  addText: 'Add photos',
  addLabel: 'Add photos from your library',
  takeText: 'Take a photo',
  takeLabel: 'Take a photo with the camera',
  /** The title of the camera refusal the system will not ask about again. */
  cameraOffTitle: 'Camera access is off',
  /** The title of the photo-library refusal (spec 006): one action, "Allow photo access" or "Open Settings". */
  libraryOffTitle: 'Photo access is off',
  allowText: 'Allow photo access',
  allowLabel: 'Allow photo access',
  openSettingsLabel: 'Open Settings',
  dismissText: 'Dismiss',
  dismissLabel: 'Dismiss this message',
  retryText: 'Try again',
  retryLabel: 'Try uploading this photo again',
  /** The word on a failed tile's pill and in the summary line (photos.png). */
  tileRetryText: 'Retry',
  retryAllLabel: 'Retry failed uploads',
  retryAllOneLabel: 'Retry failed upload',
  noPreview: 'No preview',
  openHint: 'Opens the photo',
  closeText: 'Close',
  closeLabel: 'Close photo',
  deleteText: 'Delete',
  deleteLabel: 'Delete this photo',
  deleteTitle: 'Delete this photo?',
  deleteDetail: 'It is removed from this trip and from this device.',
  fileUnder: 'File under',
  fileUnderNone: 'File under no city',
  notStored: 'This photo isn’t stored on this device.',
  cannotDraw: 'This photo couldn’t be shown. Its file on this device may be damaged.',
} as const;
