import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { loadEnv } from '@/common/config/env.schema';

/** AES-256-GCM: 32-byte key, 12-byte nonce, 16-byte tag. */
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface WrappedKey {
  /** The DEK, encrypted under the master key. Stored in `documents.wrapped_dek`. */
  readonly wrappedDek: Buffer;
  /** Which master key did the wrapping. Stored in `documents.dek_key_id`. */
  readonly dekKeyId: string;
}

export interface SealedDocument extends WrappedKey {
  /** The encrypted bytes, to be uploaded to object storage. */
  readonly ciphertext: Buffer;
}

/**
 * Per-document envelope encryption (FR-033, research D-04).
 *
 * Two layers, for one reason: the master key must never be in the database.
 *
 * - Each document gets its own **data encryption key** (DEK), 32 random bytes,
 *   used once to encrypt that document's bytes.
 * - The DEK is then encrypted ("wrapped") under a **master key** held as a Docker
 *   secret, and only the wrapped form is stored, next to the row.
 *
 * So a database dump yields wrapped DEKs, which are inert, and an object-store
 * dump yields ciphertext, which is inert. FR-033 asks that obtaining the
 * underlying data store not reveal a document's contents, and this is what makes
 * that true rather than aspirational — unlike disk-level encryption at rest,
 * which protects against a stolen disk but not against a credentialed read, and
 * the credential is the thing that leaks.
 *
 * The per-document DEK is also what makes master-key rotation affordable: rotating
 * re-wraps a few thousand 32-byte keys rather than re-encrypting every document.
 * `dekKeyId` records which master key wrapped a given row so that both keys can
 * coexist while a rotation is in flight.
 */
@Injectable()
export class EnvelopeService {
  /** Encrypts document bytes and returns everything the row and the object need. */
  seal(plaintext: Buffer, aad: Buffer): SealedDocument {
    const dek = randomBytes(KEY_BYTES);
    const ciphertext = encrypt(dek, plaintext, aad);

    return { ciphertext, ...this.wrapDek(dek, aad) };
  }

  /** Reverses {@link seal}. Throws if the ciphertext or the AAD was altered. */
  open(sealed: SealedDocument, aad: Buffer): Buffer {
    const dek = this.unwrapDek(sealed, aad);

    try {
      return decrypt(dek, sealed.ciphertext, aad);
    } finally {
      dek.fill(0);
    }
  }

  /** Encrypts a DEK under the current master key. */
  wrapDek(dek: Buffer, aad: Buffer): WrappedKey {
    const env = loadEnv();

    return {
      wrappedDek: encrypt(masterKey(), dek, aad),
      dekKeyId: env.DOCUMENT_MASTER_KEY_ID,
    };
  }

  /**
   * Recovers a DEK.
   *
   * Refuses a `dekKeyId` this process cannot serve rather than trying the current
   * key and reporting an authentication failure. The two are different problems —
   * "this row predates the running configuration" is an operational mistake, and
   * "this ciphertext was tampered with" is an attack — and collapsing them into
   * one error would hide the second behind the first during a rotation.
   */
  unwrapDek(wrapped: WrappedKey, aad: Buffer): Buffer {
    const env = loadEnv();

    if (!keyIdMatches(wrapped.dekKeyId, env.DOCUMENT_MASTER_KEY_ID)) {
      throw new Error(
        `Document was wrapped with master key "${wrapped.dekKeyId}", but this ` +
          `process holds "${env.DOCUMENT_MASTER_KEY_ID}". The retiring key must ` +
          `stay available until every row has been re-wrapped.`,
      );
    }

    return decrypt(masterKey(), wrapped.wrappedDek, aad);
  }

  /**
   * Additional authenticated data binding a ciphertext to the document it belongs
   * to.
   *
   * AAD is not encrypted; it is *authenticated*. GCM folds it into the tag, so a
   * ciphertext sealed under one document id cannot be opened under another — the
   * tag simply fails to verify.
   *
   * This exists because FR-033's adversary holds the data store, and holding it
   * means being able to write to it. Without binding, that adversary can move
   * `wrapped_dek` and `storage_key` from a document they are allowed to read onto
   * a row belonging to someone else, and every layer downstream decrypts it
   * happily: the DEK is genuine, the ciphertext is intact, nothing is
   * inconsistent. Binding turns that rearrangement into a decryption failure.
   *
   * Bound to the document id alone, and deliberately not to the trip id. Adding
   * the trip would also pin a document to its trip, but it would make moving a
   * document between trips a decrypt-re-encrypt-reupload operation forever after.
   * The document id already blocks the attack that matters — a wrapped DEK cannot
   * be pointed at a different document — and the trip adds a permanent constraint
   * for a marginal gain.
   *
   * The consequence to remember: a document's id can never change. Re-keying is
   * fine (the id is stable across a master-key rotation), but assigning a new id
   * to an existing row makes its bytes unrecoverable.
   */
  documentAad(documentId: string): Buffer {
    return Buffer.from(documentId, 'utf8');
  }
}

/** Constant-time comparison, so key ids cannot be probed character by character. */
function keyIdMatches(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The master key, decoded from base64.
 *
 * Read on each call rather than cached in a field so that a rotated secret takes
 * effect without a restart, and so the key is not retained on a long-lived object
 * any longer than necessary.
 */
function masterKey(): Buffer {
  const key = Buffer.from(loadEnv().DOCUMENT_MASTER_KEY, 'base64');

  if (key.length !== KEY_BYTES) {
    throw new Error(
      `DOCUMENT_MASTER_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}.`,
    );
  }

  return key;
}

/**
 * `nonce || ciphertext || tag`, one buffer.
 *
 * A fresh random nonce per call, never reused: GCM's security collapses entirely
 * if a nonce repeats under the same key — two messages under one nonce leak their
 * XOR and, worse, the authentication key itself. 96 random bits is the standard
 * construction, and each DEK encrypts exactly one document, so the birthday bound
 * is never approached in practice.
 */
function encrypt(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);

  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}

/** Reverses {@link encrypt}; throws if the tag does not verify. */
function decrypt(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error('Ciphertext is too short to contain a nonce and a tag.');
  }

  const nonce = sealed.subarray(0, NONCE_BYTES);
  const body = sealed.subarray(NONCE_BYTES, sealed.length - TAG_BYTES);
  const tag = sealed.subarray(sealed.length - TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  // `final()` is what verifies the tag. It throws on any alteration to the
  // ciphertext, the nonce, or the AAD — which is the whole point of GCM over CBC.
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
