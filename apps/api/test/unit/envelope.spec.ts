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
});
