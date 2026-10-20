/**
 * T118 — what a document's state is called, in words (feature 002 FR-010:
 * never by colour alone; Constitution II: nothing un-uploaded is presented as
 * saved; Constitution IV: nothing unconfirmed is presented as fact).
 */
import type { DocumentRow } from '@/db/schema';
import {
  DOCUMENT_TYPE_LABELS,
  FIELDS_STATUS_TEXT,
  UPLOAD_STATUS_TEXT,
  fieldsStatus,
  flightSummary,
  syncBadgeState,
  uploadStatus,
} from '@/features/documents/document-copy';
import { formatIsoDate } from '@/features/trips/stop-dates';

const FIELDS = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};

function document(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
    trip_id: '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a',
    type: 'boarding_pass',
    parsed_json: FIELDS,
    parsed_confirmed_at: null,
    upload_state: 'pending',
    is_dirty: true,
    synced_at: null,
    local_file_uri: 'document-vault/0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a.sealed',
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-20T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

test('every type has a name', () => {
  expect(DOCUMENT_TYPE_LABELS).toEqual({
    boarding_pass: 'Boarding pass',
    booking: 'Booking',
    other: 'Other document',
  });
});

describe('fieldsStatus (Constitution IV)', () => {
  test('extracted but unchecked fields are to be checked, not fact', () => {
    expect(fieldsStatus(document())).toBe('unconfirmed');
    expect(FIELDS_STATUS_TEXT.unconfirmed).toBe('Check these details');
  });

  test('confirmed fields say so', () => {
    expect(
      fieldsStatus(document({ parsed_confirmed_at: '2026-11-20T10:01:00.000Z' })),
    ).toBe('confirmed');
    expect(FIELDS_STATUS_TEXT.confirmed).toBe('Confirmed');
  });

  test('a pass with no fields invites them; other documents carry none', () => {
    expect(fieldsStatus(document({ parsed_json: null }))).toBe('none');
    expect(fieldsStatus(document({ type: 'booking', parsed_json: null }))).toBeNull();
  });
});

describe('uploadStatus and its badge (FR-041)', () => {
  test('bytes not yet uploaded are pending', () => {
    expect(uploadStatus(document())).toBe('pending');
    expect(syncBadgeState(document())).toBe('pending');
  });

  test('an uploaded document with an unsent change is changed, still badged', () => {
    const changed = document({ upload_state: 'uploaded', is_dirty: true });
    expect(uploadStatus(changed)).toBe('changed');
    expect(syncBadgeState(changed)).toBe('pending');
  });

  test('uploaded and clean is saved, with no badge', () => {
    const saved = document({ upload_state: 'uploaded', is_dirty: false });
    expect(uploadStatus(saved)).toBe('saved');
    expect(syncBadgeState(saved)).toBeNull();
  });

  test('a refused upload is failed, in words that say why', () => {
    const failed = document({ upload_state: 'failed' });
    expect(uploadStatus(failed)).toBe('failed');
    expect(syncBadgeState(failed)).toBe('failed');
    expect(UPLOAD_STATUS_TEXT.failed).toMatch(/10 MB/);
    expect(UPLOAD_STATUS_TEXT.pending).toMatch(/this device/);
  });
});

test('flightSummary reads as the pass does, with the date in the device’s own format', () => {
  expect(flightSummary(FIELDS)).toBe(`AC834 · ${formatIsoDate('2026-11-22')}`);
  expect(formatIsoDate('2026-11-22')).toMatch(/22/);
});
