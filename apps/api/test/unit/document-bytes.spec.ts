import { HttpException, HttpStatus } from '@nestjs/common';
import { MAX_DOCUMENT_BYTES, maxBase64Length } from '@triptrackr/contracts';

import {
  decodeDocument,
  decodedLength,
  matchesSignature,
} from '@/modules/documents/document-bytes';
import { DocumentSizePipe } from '@/modules/documents/document-size.pipe';

/**
 * What the API accepts as a document's bytes (rest-api.md §6; research D-32;
 * tasks.md T114): an image — JPEG or PNG, the declared type confirmed by the
 * leading bytes rather than taken on trust — of at most MAX_DOCUMENT_BYTES
 * decoded, refused as `413 DOCUMENT_TOO_LARGE` at every size above that and as
 * `422 VALIDATION_FAILED` when the bytes are not what the type says.
 */

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const GIF = Buffer.from('GIF89a', 'ascii');

/** The HttpException a call was refused with; anything else fails the test. */
function refusal(call: () => unknown): { status: number; body: unknown } {
  try {
    call();
  } catch (error: unknown) {
    if (!(error instanceof HttpException)) throw error;
    return { status: error.getStatus(), body: error.getResponse() };
  }
  throw new Error('Expected a refusal, but the call succeeded.');
}

describe('matchesSignature — the declared type must be the bytes’ type', () => {
  it('accepts a JPEG declared as JPEG and a PNG declared as PNG', () => {
    expect(matchesSignature('image/jpeg', JPEG)).toBe(true);
    expect(matchesSignature('image/png', PNG)).toBe(true);
  });

  it('refuses each declared as the other', () => {
    expect(matchesSignature('image/png', JPEG)).toBe(false);
    expect(matchesSignature('image/jpeg', PNG)).toBe(false);
  });

  it('refuses an image of neither type, and bytes too short to carry a signature', () => {
    expect(matchesSignature('image/jpeg', GIF)).toBe(false);
    expect(matchesSignature('image/png', GIF)).toBe(false);
    expect(matchesSignature('image/jpeg', Buffer.from([0xff, 0xd8]))).toBe(false);
    expect(matchesSignature('image/png', PNG.subarray(0, 7))).toBe(false);
    expect(matchesSignature('image/jpeg', Buffer.alloc(0))).toBe(false);
  });
});

describe('decodedLength — the size a padded base64 string decodes to', () => {
  it.each([
    ['', 0],
    ['QQ==', 1],
    ['QUI=', 2],
    ['QUJD', 3],
    ['QUJDRA==', 4],
  ])('%j decodes to %i bytes', (base64, bytes) => {
    expect(decodedLength(base64)).toBe(bytes);
    expect(Buffer.from(base64, 'base64')).toHaveLength(bytes);
  });

  it('reads the unpadded maximum-length string as two bytes over the ceiling', () => {
    // The contract caps the string at maxBase64Length(MAX_DOCUMENT_BYTES), which
    // an unpadded string of that length exceeds once decoded — the gap the
    // server's own check exists to close.
    expect(decodedLength('A'.repeat(maxBase64Length(MAX_DOCUMENT_BYTES)))).toBe(
      MAX_DOCUMENT_BYTES + 2,
    );
  });
});

describe('decodeDocument', () => {
  it('returns the decoded bytes of a document within the limit', () => {
    expect(decodeDocument('image/jpeg', JPEG.toString('base64')).equals(JPEG)).toBe(true);
  });

  it('refuses a document over MAX_DOCUMENT_BYTES as 413 DOCUMENT_TOO_LARGE', () => {
    const oversized = Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41);
    JPEG.copy(oversized);

    const { status, body } = refusal(() =>
      decodeDocument('image/jpeg', oversized.toString('base64')),
    );

    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(body).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
  });

  it('holds the ceiling on the decoded bytes when a malformed string under-reports its size', () => {
    // One stray '=' makes the estimate read MAX_DOCUMENT_BYTES while the
    // decoder still yields a byte more. The wire refuses such a string; the
    // service does not rely on it having done so.
    const malformed = `${Buffer.alloc(MAX_DOCUMENT_BYTES + 1, 0x41).toString('base64')}=`;
    expect(decodedLength(malformed)).toBe(MAX_DOCUMENT_BYTES);

    expect(refusal(() => decodeDocument('image/jpeg', malformed)).status).toBe(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  });

  it('accepts a document of exactly MAX_DOCUMENT_BYTES', () => {
    const largest = Buffer.alloc(MAX_DOCUMENT_BYTES, 0x41);
    PNG.copy(largest);

    expect(decodeDocument('image/png', largest.toString('base64'))).toHaveLength(
      MAX_DOCUMENT_BYTES,
    );
  });

  it('refuses bytes that are not the declared type as 422 VALIDATION_FAILED on content_base64', () => {
    const { status, body } = refusal(() =>
      decodeDocument('image/png', JPEG.toString('base64')),
    );

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message:
          'Some of the information provided is not valid. Please check it and try again.',
        details: {
          issues: [
            {
              path: 'content_base64',
              message: 'The file is not a PNG image',
            },
          ],
        },
      },
    });
  });
});

describe('DocumentSizePipe — every document over the limit is the same 413', () => {
  const pipe = new DocumentSizePipe();
  const metadata = { type: 'body' } as const;

  it('refuses a body whose document decodes past the limit, before schema validation', () => {
    // Inside the contract's string ceiling, so the schema alone would answer
    // 400; the pipe keeps the answer the contract documents.
    const body = { content_base64: 'A'.repeat(maxBase64Length(MAX_DOCUMENT_BYTES)) };

    const { status, body: refused } = refusal(() => pipe.transform(body, metadata));

    expect(status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(refused).toMatchObject({ error: { code: 'DOCUMENT_TOO_LARGE' } });
  });

  it('refuses a document string longer than the contract allows at all', () => {
    const body = {
      content_base64: 'A'.repeat(maxBase64Length(MAX_DOCUMENT_BYTES) + 4),
    };

    expect(refusal(() => pipe.transform(body, metadata)).status).toBe(
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  });

  it('passes a document within the limit through untouched', () => {
    const body = { type: 'other', content_base64: 'QUJD', extra: true };

    expect(pipe.transform(body, metadata)).toBe(body);
  });

  it.each([null, 'text', 42, [], {}, { content_base64: 17 }])(
    'leaves %j to the schema, which refuses it on its own terms',
    (body) => {
      expect(pipe.transform(body, metadata)).toBe(body);
    },
  );
});
