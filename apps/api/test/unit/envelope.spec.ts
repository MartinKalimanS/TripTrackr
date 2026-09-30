import { randomBytes } from 'node:crypto';

import { EnvelopeService } from '@/common/crypto/envelope.service';
import { resetEnvCache } from '@/common/config/env.schema';

import { applyUnitTestEnv } from '../support/env';

/**
 * The envelope encryption contract (FR-033, research D-04).
 *
 * The adversary these tests model is the one FR-033 names: someone holding the
 * underlying data store. That is a *write*-capable adversary, not merely a
 * reader, so the interesting cases are not "can it round-trip" but "what happens
 * when the stored bytes are rearranged".
 */

const MASTER_KEY = randomBytes(32).toString('base64');

function withEnv(overrides: Record<string, string> = {}): void {
  applyUnitTestEnv({ DOCUMENT_MASTER_KEY: MASTER_KEY, ...overrides });
}

describe('EnvelopeService', () => {
  let service: EnvelopeService;

  beforeEach(() => {
    withEnv();
    service = new EnvelopeService();
  });

  afterAll(() => resetEnvCache());

  it('returns the original bytes when sealed and opened with the same document id', () => {
    // Arrange
    const documentId = '5a1f1b3e-0000-4000-8000-000000000001';
    const plaintext = Buffer.from('Passport №  12345 — expiry 2031-04-02', 'utf8');

    // Act
    const sealed = service.seal(plaintext, service.documentAad(documentId));
    const opened = service.open(sealed, service.documentAad(documentId));

    // Assert
    expect(opened.equals(plaintext)).toBe(true);
  });

  it('stores neither the plaintext nor the data key in recoverable form', () => {
    // Arrange
    const documentId = '5a1f1b3e-0000-4000-8000-000000000002';
    const plaintext = Buffer.from('BOARDING PASS SEAT 14C', 'utf8');

    // Act
    const sealed = service.seal(plaintext, service.documentAad(documentId));

    // Assert — this is what a database dump plus an object-store dump contains.
    expect(sealed.ciphertext.includes(plaintext)).toBe(false);
    expect(sealed.wrappedDek.length).toBeGreaterThan(32);
    expect(sealed.dekKeyId).toBe('v1');
  });

  it('refuses to open a document whose wrapped key was moved to another row', () => {
    // Arrange — the attack the AAD binding exists to stop. Two documents; the
    // attacker has write access to the database and swaps the row identity.
    const victimId = '5a1f1b3e-0000-4000-8000-000000000003';
    const attackerId = '5a1f1b3e-0000-4000-8000-000000000004';
    const sealed = service.seal(
      Buffer.from('victim contents'),
      service.documentAad(victimId),
    );

    // Act + Assert — genuine DEK, intact ciphertext, wrong row: it still fails.
    expect(() => service.open(sealed, service.documentAad(attackerId))).toThrow();
  });

  it('refuses to open a document whose ciphertext was altered', () => {
    // Arrange
    const documentId = '5a1f1b3e-0000-4000-8000-000000000005';
    const sealed = service.seal(Buffer.from('original'), service.documentAad(documentId));
    const tampered = Buffer.from(sealed.ciphertext);
    // Flips a bit in the body rather than in the nonce or the tag, so the test
    // exercises ciphertext authentication specifically. writeUInt8 rather than
    // index assignment because noUncheckedIndexedAccess types the read as
    // possibly-undefined.
    const target = tampered.length - 20;
    tampered.writeUInt8(tampered.readUInt8(target) ^ 0xff, target);

    // Act + Assert — GCM's tag, not a checksum we had to remember to check.
    expect(() =>
      service.open({ ...sealed, ciphertext: tampered }, service.documentAad(documentId)),
    ).toThrow();
  });

  it('names the retired key rather than reporting a decryption failure after rotation', () => {
    // Arrange — a row wrapped under v1, opened by a process now holding v2.
    const documentId = '5a1f1b3e-0000-4000-8000-000000000006';
    const sealed = service.seal(
      Buffer.from('older document'),
      service.documentAad(documentId),
    );

    withEnv({ DOCUMENT_MASTER_KEY_ID: 'v2' });

    // Act + Assert — an operational mistake must not look like an attack.
    expect(() => service.open(sealed, service.documentAad(documentId))).toThrow(/"v1"/);
  });

  it('never reuses a nonce, so two seals of identical bytes differ', () => {
    // Arrange
    const documentId = '5a1f1b3e-0000-4000-8000-000000000007';
    const plaintext = Buffer.from('identical');
    const aad = service.documentAad(documentId);

    // Act
    const first = service.seal(plaintext, aad);
    const second = service.seal(plaintext, aad);

    // Assert — equal ciphertexts would mean a repeated key/nonce pair, which in
    // GCM leaks the authentication key outright.
    expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
  });

  it('rejects a master key that is not 32 bytes', () => {
    // Arrange
    withEnv({ DOCUMENT_MASTER_KEY: Buffer.alloc(16).toString('base64').padEnd(44, 'A') });

    // Act + Assert
    expect(() => service.seal(Buffer.from('x'), service.documentAad('id'))).toThrow(
      /32 bytes/,
    );
  });

  it('does not keep the data key once the document is sealed', () => {
    // Arrange — seal hands its fresh DEK to wrapDek; the spy keeps a reference.
    const wrap = jest.spyOn(service, 'wrapDek');

    // Act
    service.seal(Buffer.from('boarding pass'), service.documentAad('id'));

    // Assert — wrapped and used, then wiped: nothing lingers on the heap.
    const dek = wrap.mock.calls[0]?.[0];
    expect(dek?.length).toBe(32);
    expect(dek?.every((byte) => byte === 0)).toBe(true);
  });
});

/**
 * The extracted boarding-pass fields (research D-33): sealed under the
 * document's OWN data key, reached through its existing wrapped key, with the
 * associated data `<id>:parsed`. The adversary is the same write-capable one
 * as above, and the rearrangements that matter are between a row's two blobs
 * — the image and the fields — as well as between rows.
 */
describe('EnvelopeService — a document’s extracted fields', () => {
  const DOCUMENT_ID = '5a1f1b3e-0000-4000-8000-0000000000a1';
  const OTHER_ID = '5a1f1b3e-0000-4000-8000-0000000000b2';
  const FIELDS = Buffer.from(
    '{"flight_number":"AC834","flight_date":"2026-06-02","passenger_name":"DESMARAIS/LUC"}',
    'utf8',
  );
  const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04]);

  let service: EnvelopeService;

  beforeEach(() => {
    withEnv();
    service = new EnvelopeService();
  });

  afterAll(() => resetEnvCache());

  /** One uploaded document: the sealed image, and the key the row stores. */
  function uploaded(documentId: string = DOCUMENT_ID) {
    return service.seal(IMAGE, service.documentAad(documentId));
  }

  it('binds the fields to `<id>:parsed`, apart from the image’s `<id>`', () => {
    expect(service.parsedAad(DOCUMENT_ID).toString('utf8')).toBe(`${DOCUMENT_ID}:parsed`);
    expect(service.parsedAad(DOCUMENT_ID).equals(service.documentAad(DOCUMENT_ID))).toBe(
      false,
    );
  });

  it('round-trips the fields under the document’s existing wrapped key', () => {
    // Arrange
    const document = uploaded();

    // Act
    const sealed = service.sealParsed(document, DOCUMENT_ID, FIELDS);
    const opened = service.openParsed(document, DOCUMENT_ID, sealed);

    // Assert — and a dump of the column shows neither a name nor a flight.
    expect(opened.equals(FIELDS)).toBe(true);
    expect(sealed.includes(Buffer.from('DESMARAIS'))).toBe(false);
    expect(sealed.includes(Buffer.from('AC834'))).toBe(false);
  });

  it('refuses to open the sealed fields as the image', () => {
    // Arrange — the attacker copies the fields blob over the object.
    const document = uploaded();
    const sealed = service.sealParsed(document, DOCUMENT_ID, FIELDS);

    // Act + Assert — same key, same row, wrong associated data.
    expect(() =>
      service.open({ ...document, ciphertext: sealed }, service.documentAad(DOCUMENT_ID)),
    ).toThrow();
  });

  it('refuses to open the image as the sealed fields', () => {
    // Arrange — and the other way round: the object copied into the column.
    const document = uploaded();

    // Act + Assert
    expect(() =>
      service.openParsed(document, DOCUMENT_ID, document.ciphertext),
    ).toThrow();
  });

  it('refuses to open the fields under another document’s id', () => {
    // Arrange
    const document = uploaded();
    const sealed = service.sealParsed(document, DOCUMENT_ID, FIELDS);

    // Act + Assert — the wrapped key is bound to its id, so it will not unwrap.
    expect(() => service.openParsed(document, OTHER_ID, sealed)).toThrow();
  });

  it('refuses the fields moved onto another document’s row, key and all', () => {
    // Arrange — B's row, with A's sealed fields pasted into its column.
    const victim = uploaded(DOCUMENT_ID);
    const other = uploaded(OTHER_ID);
    const sealed = service.sealParsed(victim, DOCUMENT_ID, FIELDS);

    // Act + Assert — B's key is genuine, but it is not the key that sealed them.
    expect(() => service.openParsed(other, OTHER_ID, sealed)).toThrow();
  });

  it('refuses fields whose sealed bytes were altered', () => {
    // Arrange
    const document = uploaded();
    const tampered = Buffer.from(service.sealParsed(document, DOCUMENT_ID, FIELDS));
    const target = tampered.length - 20;
    tampered.writeUInt8(tampered.readUInt8(target) ^ 0x01, target);

    // Act + Assert
    expect(() => service.openParsed(document, DOCUMENT_ID, tampered)).toThrow();
  });

  it('seals the same fields differently every time — a fresh nonce under the one key', () => {
    const document = uploaded();

    const first = service.sealParsed(document, DOCUMENT_ID, FIELDS);
    const second = service.sealParsed(document, DOCUMENT_ID, FIELDS);

    expect(first.equals(second)).toBe(false);
  });

  it.each(['sealParsed', 'openParsed'] as const)(
    'wipes the unwrapped data key when %s returns',
    (method) => {
      // Arrange
      const document = uploaded();
      const sealed = service.sealParsed(document, DOCUMENT_ID, FIELDS);
      const unwrap = jest.spyOn(service, 'unwrapDek');

      // Act
      if (method === 'sealParsed') service.sealParsed(document, DOCUMENT_ID, FIELDS);
      else service.openParsed(document, DOCUMENT_ID, sealed);

      // Assert
      const dek = unwrap.mock.results[0]?.value as Buffer | undefined;
      expect(dek?.length).toBe(32);
      expect(dek?.every((byte) => byte === 0)).toBe(true);
    },
  );

  it('wipes the data key even when the fields fail to open', () => {
    const document = uploaded();
    const unwrap = jest.spyOn(service, 'unwrapDek');

    expect(() =>
      service.openParsed(document, DOCUMENT_ID, Buffer.alloc(40, 7)),
    ).toThrow();

    const dek = unwrap.mock.results[0]?.value as Buffer | undefined;
    expect(dek?.every((byte) => byte === 0)).toBe(true);
  });
});
