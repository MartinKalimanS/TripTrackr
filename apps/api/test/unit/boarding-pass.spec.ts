import { HttpStatus } from '@nestjs/common';
import {
  CreateDocumentRequest,
  PatchDocumentRequest,
  type CreateDocumentInput,
  type DocumentType,
} from '@triptrackr/contracts';

import { resetEnvCache } from '@/common/config/env.schema';
import { EnvelopeService } from '@/common/crypto/envelope.service';
import {
  BoardingPassService,
  type FieldsChange,
  type FieldsOnRow,
} from '@/modules/documents/boarding-pass.service';

import {
  DOCUMENT_ID,
  FIELDS,
  JPEG,
  OTHER_DOCUMENT_ID,
  TRIP_ID,
  UPDATED_AT,
  asOwner,
  documentHarness,
  refusal,
  storedDocument,
} from '../support/document-service-harness';
import { applyUnitTestEnv } from '../support/env';

/**
 * Boarding-pass fields on the API (FR-035, Constitution IV; research D-33) —
 * tasks.md T111, API half. The parser itself runs on the device and is tested in
 * packages/contracts/test/boarding-pass.spec.ts; what the API owns is what
 * happens to the three fields once they arrive:
 *
 *   - they are sealed at rest under the document's own key, and a database dump
 *     shows neither the name nor the flight;
 *   - they are a PROPOSAL, with `parsed_confirmed_at` null, until the traveller
 *     confirms them — on the device before the upload, or later by PATCH;
 *   - a correction replaces the proposal and clears any confirmation, and a
 *     clear removes both (rest-api.md §6);
 *   - only a boarding pass carries them, judged on the row a patch produces.
 */

beforeAll(() => applyUnitTestEnv());
afterAll(() => resetEnvCache());

const CORRECTED = { ...FIELDS, passenger_name: 'DESMARAIS/LUC MR' };

function createRequest(input: Partial<CreateDocumentInput> = {}): CreateDocumentRequest {
  return CreateDocumentRequest.parse({
    type: 'boarding_pass',
    content_type: 'image/jpeg',
    content_base64: JPEG.toString('base64'),
    ...input,
  });
}

function service(): BoardingPassService {
  return new BoardingPassService(new EnvelopeService());
}

describe('BoardingPassService — the fields at rest (research D-33)', () => {
  it('seals the fields under the document’s own key, with neither name nor flight readable', () => {
    const { row } = storedDocument();

    const sealed = service().seal(row, DOCUMENT_ID, FIELDS);

    expect(Buffer.isBuffer(sealed)).toBe(true);
    expect(sealed?.includes(Buffer.from('DESMARAIS'))).toBe(false);
    expect(sealed?.includes(Buffer.from('AC834'))).toBe(false);
    expect(service().open(row, DOCUMENT_ID, sealed)).toEqual(FIELDS);
  });

  it('keeps no fields as no blob — an unreadable barcode is not an error state', () => {
    const { row } = storedDocument();

    expect(service().seal(row, DOCUMENT_ID, null)).toBeNull();
    expect(service().open(row, DOCUMENT_ID, null)).toBeNull();
  });

  it('refuses fields sealed for another document', () => {
    const victim = storedDocument({ id: DOCUMENT_ID, fields: FIELDS });
    const other = storedDocument({ id: OTHER_DOCUMENT_ID });

    expect(() =>
      service().open(other.row, OTHER_DOCUMENT_ID, victim.row.parsedSealed),
    ).toThrow();
  });

  it('validates what it decrypts: nothing beyond the three fields leaves the column', () => {
    // A blob that decrypts cleanly but carries a booking reference — the very
    // item D-33 says is never stored — is a defect, not something to serve.
    const envelope = new EnvelopeService();
    const { row } = storedDocument();
    const smuggled = envelope.sealParsed(
      row,
      DOCUMENT_ID,
      Buffer.from(JSON.stringify({ ...FIELDS, booking_reference: 'ABC123' })),
    );
    const garbage = envelope.sealParsed(
      row,
      DOCUMENT_ID,
      Buffer.from('DESMARAIS/LUC is not json'),
    );

    for (const sealed of [smuggled, garbage]) {
      const thrown: unknown = (() => {
        try {
          return service().open(row, DOCUMENT_ID, sealed);
        } catch (error: unknown) {
          return error;
        }
      })();

      // A defect, reported by document id — and the 5xx log it lands in must
      // not quote what was decrypted.
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain(DOCUMENT_ID);
      expect((thrown as Error).message).not.toMatch(/DESMARAIS|ABC123|AC834|json/i);
    }
  });
});

describe('BoardingPassService.confirmedOnCreate — proposed until confirmed (Constitution IV)', () => {
  it('stores fields sent without `confirmed` as a proposal', () => {
    expect(service().confirmedOnCreate(createRequest({ parsed_json: FIELDS }))).toBe(
      false,
    );
  });

  it('stores fields the traveller confirmed on the device as confirmed', () => {
    expect(
      service().confirmedOnCreate(
        createRequest({ parsed_json: FIELDS, confirmed: true }),
      ),
    ).toBe(true);
  });

  it('confirms nothing when there are no fields', () => {
    expect(service().confirmedOnCreate(createRequest({ type: 'booking' }))).toBe(false);
  });

  it('refuses fields on anything but a boarding pass, even past the wire’s own check', async () => {
    const { status, body } = await refusal(
      Promise.resolve().then(() =>
        service().confirmedOnCreate({
          type: 'booking',
          parsed_json: FIELDS,
          confirmed: false,
        }),
      ),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        details: {
          issues: [
            {
              path: 'parsed_json',
              message: 'Only a boarding pass carries extracted fields',
            },
          ],
        },
      },
    });
  });

  it('refuses a confirmation with nothing to confirm, even past the wire’s own check', async () => {
    const { status } = await refusal(
      Promise.resolve().then(() =>
        service().confirmedOnCreate({
          type: 'boarding_pass',
          parsed_json: null,
          confirmed: true,
        }),
      ),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});

describe('BoardingPassService.resolvePatch — rest-api.md §6', () => {
  const proposed: FieldsOnRow = {
    type: 'boarding_pass',
    hasFields: true,
    confirmed: false,
  };
  const confirmed: FieldsOnRow = {
    type: 'boarding_pass',
    hasFields: true,
    confirmed: true,
  };
  const bare: FieldsOnRow = { type: 'boarding_pass', hasFields: false, confirmed: false };
  const booking: FieldsOnRow = { type: 'booking', hasFields: false, confirmed: false };

  const cases: readonly [string, FieldsOnRow, PatchDocumentRequest, FieldsChange][] = [
    [
      'fields sent with confirmed are stored confirmed',
      bare,
      { parsed_json: FIELDS, confirmed: true },
      { fields: FIELDS, confirmation: 'now' },
    ],
    [
      'fields sent without confirmed replace the proposal and clear the confirmation',
      confirmed,
      { parsed_json: CORRECTED },
      { fields: CORRECTED, confirmation: 'clear' },
    ],
    [
      'null clears the fields and the confirmation',
      confirmed,
      { parsed_json: null },
      { fields: null, confirmation: 'clear' },
    ],
    [
      'confirmed alone confirms the stored proposal, leaving the fields as sealed',
      proposed,
      { confirmed: true },
      { confirmation: 'now' },
    ],
    [
      'confirmed alone on confirmed fields keeps the first confirmation — a replay moves nothing',
      confirmed,
      { confirmed: true },
      { confirmation: 'keep' },
    ],
    [
      'a type alone changes the type and nothing about the fields',
      booking,
      { type: 'other' },
      { type: 'other', confirmation: 'keep' },
    ],
    [
      'a booking may become a boarding pass with fields in the same patch',
      booking,
      { type: 'boarding_pass', parsed_json: FIELDS },
      { type: 'boarding_pass', fields: FIELDS, confirmation: 'clear' },
    ],
    [
      'a boarding pass may become a booking when its fields are cleared in the same patch',
      confirmed,
      { type: 'booking', parsed_json: null },
      { type: 'booking', fields: null, confirmation: 'clear' },
    ],
  ];

  it.each(cases)('%s', (_name, current, patch, change) => {
    expect(service().resolvePatch(current, PatchDocumentRequest.parse(patch))).toEqual(
      change,
    );
  });

  it.each([bare, booking])(
    'answers confirmed alone with nothing stored as 409 DOCUMENT_NOTHING_TO_CONFIRM',
    async (current) => {
      const { status, body } = await refusal(
        Promise.resolve().then(() =>
          service().resolvePatch(current, { confirmed: true }),
        ),
      );

      expect(status).toBe(HttpStatus.CONFLICT);
      expect(body).toMatchObject({ error: { code: 'DOCUMENT_NOTHING_TO_CONFIRM' } });
    },
  );

  it.each<[string, FieldsOnRow, PatchDocumentRequest]>([
    ['a type change that strands fields', proposed, { type: 'booking' }],
    ['fields sent to a booking', booking, { parsed_json: FIELDS }],
    [
      'a confirmation on a pass turned into “other”',
      proposed,
      { type: 'other', confirmed: true },
    ],
  ])(
    'refuses %s as 422 — judged on the row the patch produces',
    async (_name, current, patch) => {
      const { status, body } = await refusal(
        Promise.resolve().then(() => service().resolvePatch(current, patch)),
      );

      expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(body).toMatchObject({
        error: {
          code: 'VALIDATION_FAILED',
          details: { issues: [{ path: 'parsed_json' }] },
        },
      });
    },
  );
});

describe('DocumentsService — proposed, confirmed, corrected, cleared (T111)', () => {
  it('seals proposed fields on upload with parsed_confirmed_at null', async () => {
    const { service: documents, repository } = documentHarness();

    const { document } = await asOwner(() =>
      documents.create(TRIP_ID, createRequest({ id: DOCUMENT_ID, parsed_json: FIELDS })),
    );

    const written = repository.insert.mock.calls[0]?.[0];
    expect(written?.confirmed).toBe(false);
    expect(written?.parsedSealed?.includes(Buffer.from('DESMARAIS'))).toBe(false);
    expect(document.parsed_json).toEqual(FIELDS);
    expect(document.parsed_confirmed_at).toBeNull();
  });

  it('stores fields confirmed on the device as confirmed at upload', async () => {
    const { service: documents, repository } = documentHarness();

    const { document } = await asOwner(() =>
      documents.create(
        TRIP_ID,
        createRequest({ id: DOCUMENT_ID, parsed_json: FIELDS, confirmed: true }),
      ),
    );

    expect(repository.insert.mock.calls[0]?.[0].confirmed).toBe(true);
    expect(document.parsed_confirmed_at).not.toBeNull();
  });

  it('confirms the stored proposal later, re-sealing nothing', async () => {
    const stored = storedDocument({ fields: FIELDS });
    const { service: documents, repository } = documentHarness({ stored: [stored] });

    const document = await documents.patch(DOCUMENT_ID, { confirmed: true });

    expect(repository.update).toHaveBeenCalledWith(DOCUMENT_ID, {
      type: undefined,
      parsedSealed: undefined,
      confirmation: 'now',
    });
    expect(document.parsed_json).toEqual(FIELDS);
    expect(document.parsed_confirmed_at).toBe(UPDATED_AT.toISOString());
  });

  it('replaces the fields with a correction and clears the confirmation', async () => {
    const stored = storedDocument({ fields: FIELDS, confirmed: true });
    const { service: documents, repository } = documentHarness({ stored: [stored] });

    const document = await documents.patch(DOCUMENT_ID, { parsed_json: CORRECTED });

    const written = repository.update.mock.calls[0]?.[1];
    expect(written?.confirmation).toBe('clear');
    expect(written?.parsedSealed?.equals(stored.row.parsedSealed as Buffer)).toBe(false);
    expect(document.parsed_json).toEqual(CORRECTED);
    expect(document.parsed_confirmed_at).toBeNull();
  });

  it('stores corrected fields confirmed when the correction says so', async () => {
    const stored = storedDocument({ fields: FIELDS });
    const { service: documents } = documentHarness({ stored: [stored] });

    const document = await documents.patch(DOCUMENT_ID, {
      parsed_json: CORRECTED,
      confirmed: true,
    });

    expect(document.parsed_json).toEqual(CORRECTED);
    expect(document.parsed_confirmed_at).toBe(UPDATED_AT.toISOString());
  });

  it('clears the fields and the confirmation together', async () => {
    const stored = storedDocument({ fields: FIELDS, confirmed: true });
    const { service: documents, repository } = documentHarness({ stored: [stored] });

    const document = await documents.patch(DOCUMENT_ID, { parsed_json: null });

    expect(repository.update.mock.calls[0]?.[1]).toMatchObject({
      parsedSealed: null,
      confirmation: 'clear',
    });
    expect(document.parsed_json).toBeNull();
    expect(document.parsed_confirmed_at).toBeNull();
  });

  it.each<[string, DocumentType, PatchDocumentRequest, number]>([
    ['nothing to confirm', 'boarding_pass', { confirmed: true }, HttpStatus.CONFLICT],
    [
      'fields on a booking',
      'booking',
      { parsed_json: FIELDS },
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
  ])('refuses %s and writes nothing', async (_name, type, patch, status) => {
    const stored = storedDocument({ type });
    const { service: documents, repository } = documentHarness({ stored: [stored] });

    expect((await refusal(documents.patch(DOCUMENT_ID, patch))).status).toBe(status);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
