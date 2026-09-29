/**
 * REST DTO contracts for User Story 5 (contracts/rest-api.md §5–6; research D-32..D-34).
 *
 * Photos: a server-chosen storage key the client can only report back, EXIF as
 * fields (the uploaded bytes carry none), and a thumbnail URL that is null until
 * the worker has made one. Documents: bytes as base64 bounded by
 * MAX_DOCUMENT_BYTES, extracted fields only on a boarding pass, and — as for
 * expenses — no visibility key accepted on any write shape (FR-032).
 */
import {
  CreateDocumentRequest,
  CreatePhotoUploadRequest,
  Document,
  DocumentContentResponse,
  DocumentParsedFields,
  DocumentPushRecord,
  MAX_DOCUMENT_BYTES,
  MAX_PHOTO_BYTES,
  PatchDocumentRequest,
  PatchPhotoRequest,
  Photo,
  PhotoOriginalResponse,
  PhotoUploadResponse,
  RegisterPhotoRequest,
  StorageKey,
  maxBase64Length,
} from '../src';

const UUID = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';
const OWNER = '11111111-1111-4111-8111-111111111111';
const KEY = `${OWNER}/${UUID}`;
const NOW = '2026-09-29T10:12:03.000Z';
const FIELDS = {
  flight_number: 'AC834',
  flight_date: '2026-11-22',
  passenger_name: 'DESMARAIS/LUC',
};
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');

describe('limits', () => {
  it('bounds a photo at 15 MiB and a document at 10 MiB', () => {
    expect(MAX_PHOTO_BYTES).toBe(15 * 1024 * 1024);
    expect(MAX_DOCUMENT_BYTES).toBe(10 * 1024 * 1024);
  });

  it('sizes base64 for a byte count: four characters per three bytes, padded', () => {
    expect(maxBase64Length(1)).toBe(4);
    expect(maxBase64Length(3)).toBe(4);
    expect(maxBase64Length(4)).toBe(8);
    expect(maxBase64Length(MAX_DOCUMENT_BYTES)).toBe(13_981_016);
  });
});

describe('storage keys — server-chosen, `<owner id>/<uuid>`', () => {
  it('accepts the shape StorageService builds', () => {
    expect(StorageKey.safeParse(KEY).success).toBe(true);
  });

  it.each([
    ['a path that climbs', `${OWNER}/../${UUID}`],
    ['no owner prefix', UUID],
    ['an extra segment', `${KEY}/x`],
    ['upper case', KEY.toUpperCase()],
    ['empty', ''],
  ])('refuses %s', (_case, key) => {
    expect(StorageKey.safeParse(key).success).toBe(false);
  });
});

describe('photos (FR-028, FR-029, FR-030)', () => {
  it('signs an upload for the image types the worker can thumbnail', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(CreatePhotoUploadRequest.safeParse({ content_type: type }).success).toBe(
        true,
      );
    }
    expect(
      CreatePhotoUploadRequest.safeParse({ content_type: 'image/heic' }).success,
    ).toBe(false);
    expect(
      PhotoUploadResponse.safeParse({
        upload_url: 'http://localhost:9000/photos/x?X-Amz-Signature=1',
        storage_key: KEY,
        expires_in_seconds: 300,
      }).success,
    ).toBe(true);
  });

  it('registers with EXIF as fields, defaulting what the device did not read', () => {
    const parsed = RegisterPhotoRequest.parse({ storage_key: KEY });
    expect(parsed).toEqual({
      storage_key: KEY,
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
    });
    expect(
      RegisterPhotoRequest.safeParse({
        id: UUID,
        storage_key: KEY,
        city_id: 100,
        taken_at: NOW,
        exif_lat: 41.9,
        exif_lng: 12.5,
      }).success,
    ).toBe(true);
  });

  it('refuses one coordinate without the other, and an impossible one', () => {
    expect(
      RegisterPhotoRequest.safeParse({ storage_key: KEY, exif_lat: 41.9 }).success,
    ).toBe(false);
    expect(
      RegisterPhotoRequest.safeParse({ storage_key: KEY, exif_lat: 91, exif_lng: 0 })
        .success,
    ).toBe(false);
  });

  it('refuses a registration that tries to set what the server owns', () => {
    for (const extra of [
      { upload_state: 'uploaded' },
      { moderation_state: 'approved' },
      { thumb_key: 'x' },
      { is_public: true },
    ]) {
      expect(RegisterPhotoRequest.safeParse({ storage_key: KEY, ...extra }).success).toBe(
        false,
      );
    }
  });

  it('a photo carries a thumbnail URL or null, never an original URL', () => {
    const photo = {
      id: UUID,
      trip_id: UUID,
      city_id: null,
      taken_at: null,
      exif_lat: null,
      exif_lng: null,
      is_public: false,
      upload_state: 'uploaded',
      moderation_state: 'pending',
      has_thumbnail: false,
      created_at: NOW,
      updated_at: NOW,
      thumbnail_url: null,
    };
    expect(Photo.safeParse(photo).success).toBe(true);
    expect(Photo.safeParse({ ...photo, original_url: 'http://x' }).success).toBe(false);
    expect(Photo.safeParse({ ...photo, deleted_at: null }).success).toBe(false);
    expect(
      PhotoOriginalResponse.safeParse({ url: 'http://x/y', expires_in_seconds: 300 })
        .success,
    ).toBe(true);
  });

  it('patches visibility or the filing, and nothing else', () => {
    expect(PatchPhotoRequest.safeParse({ is_public: true }).success).toBe(true);
    expect(PatchPhotoRequest.safeParse({ city_id: null }).success).toBe(true);
    expect(PatchPhotoRequest.safeParse({}).success).toBe(false);
    expect(PatchPhotoRequest.safeParse({ moderation_state: 'approved' }).success).toBe(
      false,
    );
  });
});

describe('documents (FR-031..FR-035) — owner-only, structurally', () => {
  const upload = {
    type: 'boarding_pass',
    content_type: 'image/jpeg',
    content_base64: JPEG_BASE64,
  };

  it('uploads bytes as base64, proposing no fields by default', () => {
    expect(CreateDocumentRequest.parse(upload)).toEqual({
      ...upload,
      parsed_json: null,
      confirmed: false,
    });
    expect(
      CreateDocumentRequest.safeParse({ ...upload, id: UUID, parsed_json: FIELDS })
        .success,
    ).toBe(true);
  });

  it('refuses a type the API will not store, and bytes that are not base64', () => {
    expect(
      CreateDocumentRequest.safeParse({ ...upload, content_type: 'application/pdf' })
        .success,
    ).toBe(false);
    expect(
      CreateDocumentRequest.safeParse({ ...upload, content_base64: 'not base64!' })
        .success,
    ).toBe(false);
    expect(
      CreateDocumentRequest.safeParse({ ...upload, content_base64: '' }).success,
    ).toBe(false);
  });

  it('refuses base64 longer than MAX_DOCUMENT_BYTES could encode', () => {
    const tooLong = 'A'.repeat(maxBase64Length(MAX_DOCUMENT_BYTES) + 4);
    expect(
      CreateDocumentRequest.safeParse({ ...upload, content_base64: tooLong }).success,
    ).toBe(false);
  });

  it('carries extracted fields only on a boarding pass', () => {
    expect(
      CreateDocumentRequest.safeParse({ ...upload, type: 'booking', parsed_json: FIELDS })
        .success,
    ).toBe(false);
    expect(CreateDocumentRequest.safeParse({ ...upload, type: 'booking' }).success).toBe(
      true,
    );
  });

  it('cannot confirm fields it does not send (Constitution IV)', () => {
    expect(CreateDocumentRequest.safeParse({ ...upload, confirmed: true }).success).toBe(
      false,
    );
    expect(
      CreateDocumentRequest.safeParse({ ...upload, parsed_json: FIELDS, confirmed: true })
        .success,
    ).toBe(true);
  });

  it.each(['is_public', 'visibility', 'public', 'shared'])(
    'refuses a visibility key — %s — on every write shape (FR-032)',
    (key) => {
      expect(CreateDocumentRequest.safeParse({ ...upload, [key]: false }).success).toBe(
        false,
      );
      expect(
        PatchDocumentRequest.safeParse({ confirmed: true, [key]: false }).success,
      ).toBe(false);
    },
  );

  it('patches the type, the fields, or a confirmation — never nothing', () => {
    expect(PatchDocumentRequest.safeParse({ confirmed: true }).success).toBe(true);
    expect(PatchDocumentRequest.safeParse({ parsed_json: FIELDS }).success).toBe(true);
    expect(PatchDocumentRequest.safeParse({ parsed_json: null }).success).toBe(true);
    expect(PatchDocumentRequest.safeParse({ type: 'other' }).success).toBe(true);
    expect(PatchDocumentRequest.safeParse({}).success).toBe(false);
    expect(PatchDocumentRequest.safeParse({ confirmed: false }).success).toBe(false);
    expect(
      PatchDocumentRequest.safeParse({ parsed_json: null, confirmed: true }).success,
    ).toBe(false);
  });

  it('a document on the wire has no key, no storage key and no visibility', () => {
    const document = {
      id: UUID,
      trip_id: UUID,
      type: 'boarding_pass',
      content_type: 'image/jpeg',
      byte_size: 1234,
      parsed_json: FIELDS,
      parsed_confirmed_at: null,
      upload_state: 'uploaded',
      created_at: NOW,
      updated_at: NOW,
    };
    expect(Document.safeParse(document).success).toBe(true);
    for (const extra of [
      { storage_key: KEY },
      { wrapped_dek: 'x' },
      { is_public: false },
    ]) {
      expect(Document.safeParse({ ...document, ...extra }).success).toBe(false);
    }
    expect(
      DocumentContentResponse.safeParse({
        id: UUID,
        content_type: 'image/png',
        content_base64: JPEG_BASE64,
      }).success,
    ).toBe(true);
  });
});

describe('DocumentParsedFields — exactly the three fields FR-035 names', () => {
  it('accepts a flight number, a date and a name', () => {
    expect(DocumentParsedFields.safeParse(FIELDS).success).toBe(true);
    for (const flight of ['U21234', '9W123', 'BAW12', 'LH400A']) {
      expect(
        DocumentParsedFields.safeParse({ ...FIELDS, flight_number: flight }).success,
      ).toBe(true);
    }
  });

  it.each([
    ['a leading zero', 'AC0834'],
    ['lower case', 'ac834'],
    ['a space', 'AC 834'],
    ['no number', 'AC'],
  ])('refuses a flight number with %s', (_case, flight) => {
    expect(
      DocumentParsedFields.safeParse({ ...FIELDS, flight_number: flight }).success,
    ).toBe(false);
  });

  it('refuses anything more — a booking reference is never kept', () => {
    expect(DocumentParsedFields.safeParse({ ...FIELDS, pnr: 'ABC123' }).success).toBe(
      false,
    );
    expect(
      DocumentParsedFields.safeParse({ ...FIELDS, passenger_name: ' ' }).success,
    ).toBe(false);
  });

  it('is what a synchronised document carries as parsed_json', () => {
    const record = {
      id: UUID,
      updated_at: NOW,
      deleted: false,
      trip_id: UUID,
      type: 'boarding_pass',
      parsed_confirmed_at: null,
    };
    expect(DocumentPushRecord.safeParse({ ...record, parsed_json: FIELDS }).success).toBe(
      true,
    );
    expect(
      DocumentPushRecord.safeParse({ ...record, parsed_json: { anything: 'goes' } })
        .success,
    ).toBe(false);
  });
});
