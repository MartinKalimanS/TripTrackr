/**
 * A document's state in words — tasks.md T118 (FR-035, FR-041; feature 002
 * FR-010; Constitution II, IV).
 *
 * The list and the viewer say the same things the same way: what kind of
 * document it is; whether its extracted fields are confirmed or still to be
 * checked (unconfirmed extraction is never presented as fact); and whether its
 * bytes have reached the traveller's account (nothing un-uploaded is presented
 * as saved). Every state is text as well as an icon or a colour.
 */
import type { DocumentParsedFields, DocumentType } from '@triptrackr/contracts';

import type { SyncState } from '@/components/ui/sync-badge';
import type { DocumentRow } from '@/db/schema';
import { formatIsoDate } from '@/features/trips/stop-dates';

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  boarding_pass: 'Boarding pass',
  booking: 'Booking',
  other: 'Other document',
};

/** Null: a document type that carries no extracted fields. */
export type FieldsStatus = 'confirmed' | 'unconfirmed' | 'none';

export const FIELDS_STATUS_TEXT: Readonly<Record<FieldsStatus, string>> = {
  confirmed: 'Confirmed',
  unconfirmed: 'Check these details',
  none: 'No flight details yet',
};

export function fieldsStatus(
  document: Pick<DocumentRow, 'type' | 'parsed_json' | 'parsed_confirmed_at'>,
): FieldsStatus | null {
  if (document.type !== 'boarding_pass') return null;
  if (document.parsed_json === null) return 'none';
  return document.parsed_confirmed_at === null ? 'unconfirmed' : 'confirmed';
}

/** `changed`: the bytes are uploaded, a later confirmation is not yet. */
export type UploadStatus = 'saved' | 'pending' | 'changed' | 'failed';

export const UPLOAD_STATUS_TEXT: Readonly<Record<UploadStatus, string>> = {
  saved: 'Uploaded to your account.',
  pending:
    'Not uploaded yet. It’s kept on this device, encrypted, and uploads when you’re online.',
  changed: 'Your latest changes haven’t uploaded yet.',
  failed: 'Too large to upload (over 10 MB). It stays on this device.',
};

export function uploadStatus(
  document: Pick<DocumentRow, 'upload_state' | 'is_dirty'>,
): UploadStatus {
  if (document.upload_state === 'failed') return 'failed';
  if (document.upload_state === 'pending') return 'pending';
  return document.is_dirty ? 'changed' : 'saved';
}

/** The pending-sync badge a document carries, if any (contract C11). */
export function syncBadgeState(
  document: Pick<DocumentRow, 'upload_state' | 'is_dirty'>,
): SyncState | null {
  const status = uploadStatus(document);
  if (status === 'saved') return null;
  return status === 'failed' ? 'failed' : 'pending';
}

/**
 * What the capture flow and the review form say. A pass whose barcode cannot
 * be read is `manualEntry` — an invitation, never a fault (spec Edge Cases;
 * research D-33) — and every refusal names what to do next.
 */
export const DOCUMENT_CAPTURE_COPY = {
  cameraChecking: 'Checking camera access',
  cameraAsk:
    'To scan a boarding pass or photograph a booking, TripTrackr needs to use the camera. Pictures stay on this device, encrypted, until they upload to your account. You can also choose a picture from your library.',
  cameraDenied:
    'Camera access is turned off for TripTrackr. Turn it on in Settings to scan or photograph a document here, or choose a picture from your library instead.',
  captureFailed: 'The camera couldn’t take that picture. Please try again.',
  saveFailed: 'That picture couldn’t be saved on this device. Please try again.',
  /** T139: the device is full. Nothing was stored — no half-saved document is left behind. */
  noSpace:
    'There isn’t enough free space on this device to save this document. Free some space and try again — nothing was saved.',
  libraryFailed: 'That picture couldn’t be opened from your library. Please try again.',
  manualEntry:
    'No boarding-pass barcode could be read from this picture, so enter the flight details yourself. You can also do this later.',
  fromBarcode:
    'These details were read from the pass’s barcode. Check them against the pass, then confirm — until you do, they’re only a suggestion.',
  correcting: 'These are the details you confirmed. Change anything that’s wrong.',
} as const;

/** The sentence that opens the review form for a pass in this state. */
export function reviewIntro(status: FieldsStatus): string {
  if (status === 'none') return DOCUMENT_CAPTURE_COPY.manualEntry;
  return status === 'unconfirmed'
    ? DOCUMENT_CAPTURE_COPY.fromBarcode
    : DOCUMENT_CAPTURE_COPY.correcting;
}

/** "AC834 · 22 Nov 2026" — the flight and its local calendar day. */
export function flightSummary(fields: DocumentParsedFields): string {
  return `${fields.flight_number} · ${formatIsoDate(fields.flight_date)}`;
}
