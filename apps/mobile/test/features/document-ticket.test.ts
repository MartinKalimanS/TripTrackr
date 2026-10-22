/**
 * F10 (T552): what a ticket in the documents list says. The data has THREE document types, so
 * a ticket is drawn from them only: the kind in the app's words, the flight when known, the
 * state, and a date stub that is never a proposal presented as fact.
 */
import type { DocumentRow } from '@/db/schema';
import { formatIsoDate } from '@/features/trips/stop-dates';
import {
  KIND_ICON,
  documentCount,
  documentsSubtitle,
  ticketModel,
} from '@/features/documents/document-ticket';

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    trip_id: 'trip-1',
    type: 'boarding_pass',
    parsed_json: {
      flight_number: 'AC834',
      flight_date: '2026-11-22',
      passenger_name: 'DESMARAIS/LUC',
    },
    parsed_confirmed_at: null,
    upload_state: 'uploaded',
    is_dirty: false,
    synced_at: '2026-10-09T10:00:00.000Z',
    local_file_uri: null,
    created_at: '2026-10-09T12:00:00.000Z',
    updated_at: '2026-10-09T12:00:00.000Z',
    deleted_at: null,
    ...overrides,
  };
}

describe('the kind icons: the three real types only', () => {
  test('boarding pass is a plane, booking a bed, other a document', () => {
    expect(KIND_ICON).toEqual({
      boarding_pass: 'plane',
      booking: 'bed',
      other: 'file-text',
    });
  });
});

describe('documentCount and documentsSubtitle', () => {
  test('one is singular, the rest plural, with no Intl.PluralRules', () => {
    expect(documentCount(1)).toBe('1 document');
    expect(documentCount(0)).toBe('0 documents');
    expect(documentCount(5)).toBe('5 documents');
  });

  test('the subtitle names the trip and counts; either half alone when the other is unknown', () => {
    expect(documentsSubtitle('Portugal Road Trip', 5)).toBe(
      'Portugal Road Trip · 5 documents',
    );
    expect(documentsSubtitle('Portugal Road Trip', null)).toBe('Portugal Road Trip');
    expect(documentsSubtitle(null, 2)).toBe('2 documents');
    expect(documentsSubtitle(null, null)).toBeNull();
  });
});

describe('ticketModel', () => {
  test('a confirmed pass shows its flight date on the stub, as a fact', () => {
    const model = ticketModel(row({ parsed_confirmed_at: '2026-10-09T12:05:00.000Z' }));
    expect(model.stub.source).toBe('flight');
    expect(model.stub.day).toBe('22');
    expect(model.stub.spoken).toMatch(/^Flight date /);
  });

  test('an unconfirmed proposal never reaches the stub: the day it was added does', () => {
    const model = ticketModel(row({ created_at: '2026-10-09T12:00:00.000Z' }));
    expect(model.stub.source).toBe('added');
    expect(model.stub.day).toBe('9');
    expect(model.stub.spoken).toMatch(/^Added /);
  });

  test('a booking and an other document show the day they were added', () => {
    expect(ticketModel(row({ type: 'booking', parsed_json: null })).stub.source).toBe(
      'added',
    );
    expect(ticketModel(row({ type: 'other', parsed_json: null })).stub.source).toBe(
      'added',
    );
  });

  test('the title is the kind in the app’s words; the flight line only for a pass with fields', () => {
    expect(ticketModel(row()).title).toBe('Boarding pass');
    expect(ticketModel(row()).line).toBe(`AC834 · ${formatIsoDate('2026-11-22')}`);
    expect(ticketModel(row({ parsed_json: null })).line).toBeNull();
    expect(ticketModel(row({ type: 'booking', parsed_json: null })).title).toBe(
      'Booking',
    );
    expect(ticketModel(row({ type: 'booking', parsed_json: null })).line).toBeNull();
  });

  test('the model carries no passenger name', () => {
    expect(JSON.stringify(ticketModel(row()))).not.toContain('DESMARAIS');
  });
});
