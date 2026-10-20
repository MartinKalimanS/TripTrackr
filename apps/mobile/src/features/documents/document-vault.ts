/**
 * Document vault — tasks.md T212 (FR-033; data-model.md §10; research D-32).
 *
 * "A device backup or a filesystem dump must not reveal a boarding pass"
 * (data-model.md §10): a document's image never rests on this device in the
 * clear. It is sealed with AES-256-GCM (`expo-crypto`, SDK 57) under the
 * device documents key held in the keychain beside the database key
 * (`lib/secure-store.ts`), with the document's own id as the associated data,
 * so a sealed file opens only as the document it was sealed for — copying it
 * over another document's file is an authentication failure, not a swap.
 *
 * Verified against the v57 references:
 *   - https://docs.expo.dev/versions/v57.0.0/sdk/crypto.md — `AESEncryptionKey.import(hex, 'hex')`;
 *     `aesEncryptAsync(plaintext, key, { additionalData })`, where a string
 *     plaintext "must be base64-encoded"; `sealed.combined()` is IV ‖ ciphertext
 *     ‖ tag as bytes; `AESSealedData.fromCombined(bytes)`; and
 *     `aesDecryptAsync(sealed, key, { output: 'base64', additionalData })`.
 *   - https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md — `File`,
 *     `Directory` and `Paths.document`, "safe from being deleted by the system".
 *
 * The camera's, the picker's and the image editor's outputs are plaintext
 * JPEGs in the cache. `sealTemporaryFile` reads one, seals it, and deletes it
 * in a `finally` — when sealing fails as much as when it succeeds. Opening
 * decrypts to base64 in memory only (for display as a data URI, and for the
 * upload body); nothing decrypted is ever written back to disk.
 *
 * The path recorded in `documents.local_file_uri` is RELATIVE to
 * `Paths.document` (`document-vault/<id>.sealed`): an iOS app update moves the
 * container, and an absolute `file://` URI would then point at nothing. It is
 * derived from the id and checked against it on every use, so a corrupt or
 * tampered row can never steer the vault outside its own directory.
 *
 * Visibility posture: owner-only, structurally, and device-only. The sealed
 * files are readable by this app alone, through the key only this device's
 * keychain holds; nothing here talks to the network.
 */
import { Uuid } from '@triptrackr/contracts';
import {
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { getOrCreateDocumentsKey } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

export const VAULT_DIRECTORY = 'document-vault';
const SEALED_EXTENSION = '.sealed';

/** A vault path or document id that is not what the vault itself would produce. */
export class VaultPathError extends Error {
  constructor() {
    super('Refusing a document vault path that this device did not derive.');
    this.name = 'VaultPathError';
  }
}

export interface SealedDocumentFile {
  /** Relative to `Paths.document` — what `documents.local_file_uri` records. */
  path: string;
  /** Plaintext bytes (the JPEG): what `MAX_DOCUMENT_BYTES` is measured against. */
  byteSize: number;
}

/** The vault path of a document's sealed file. The id must be a UUID (D-15). */
export function vaultPathFor(documentId: string): string {
  if (!Uuid.safeParse(documentId).success) throw new VaultPathError();
  return `${VAULT_DIRECTORY}/${documentId}${SEALED_EXTENSION}`;
}

function isVaultPath(path: string): boolean {
  const [directory, name, ...rest] = path.split('/');
  if (directory !== VAULT_DIRECTORY || !name || rest.length > 0) return false;
  if (!name.endsWith(SEALED_EXTENSION)) return false;
  return Uuid.safeParse(name.slice(0, -SEALED_EXTENSION.length)).success;
}

function vaultFile(path: string): File {
  if (!isVaultPath(path)) throw new VaultPathError();
  return new File(Paths.document, ...path.split('/'));
}

/** The associated data a document's file is bound to: its id, as UTF-8 bytes. */
function associatedData(documentId: string): Uint8Array {
  return new TextEncoder().encode(documentId);
}

async function documentsKey(): Promise<AESEncryptionKey> {
  return AESEncryptionKey.import(await getOrCreateDocumentsKey(), 'hex');
}

/** Bytes a base64 string decodes to, without decoding it. */
export function decodedByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

function writeSealed(path: string, bytes: Uint8Array): void {
  new Directory(Paths.document, VAULT_DIRECTORY).create({
    intermediates: true,
    idempotent: true,
  });
  const file = vaultFile(path);
  try {
    file.create({ overwrite: true });
    file.write(bytes);
  } catch (error) {
    // A half-written file is ciphertext, but it is also a document that can
    // never open. Leave nothing behind for a row to point at.
    if (file.exists) file.delete();
    throw error;
  }
}

/**
 * Seal plaintext that is already in memory (base64). The caller holds no
 * file; `sealTemporaryFile` is the path for anything a camera or editor wrote.
 */
export async function sealBase64(
  documentId: string,
  base64: string,
): Promise<SealedDocumentFile> {
  const path = vaultPathFor(documentId);
  const key = await documentsKey();
  const sealed = await aesEncryptAsync(base64, key, {
    additionalData: associatedData(documentId),
  });
  writeSealed(path, await sealed.combined('bytes'));
  return { path, byteSize: decodedByteLength(base64) };
}

/**
 * Seal a temporary plaintext file — a camera, picker or image-editor output —
 * into the vault, and delete the temporary whatever happens.
 */
export async function sealTemporaryFile(
  documentId: string,
  temporaryUri: string,
): Promise<SealedDocumentFile> {
  try {
    const base64 = await new File(temporaryUri).base64();
    return await sealBase64(documentId, base64);
  } finally {
    discardTemporary(temporaryUri);
  }
}

/**
 * The document's image as base64, decrypted in memory. Rejects for a path
 * the vault did not derive for this id, a missing file, another device's key,
 * or any byte out of place (GCM authentication).
 */
export async function openSealedFile(documentId: string, path: string): Promise<string> {
  if (path !== vaultPathFor(documentId)) throw new VaultPathError();
  const file = vaultFile(path);
  const sealed = AESSealedData.fromCombined(await file.bytes());
  return aesDecryptAsync(sealed, await documentsKey(), {
    output: 'base64',
    additionalData: associatedData(documentId),
  });
}

/** Delete a document's sealed file. One already gone is not an error. */
export function removeSealedFile(path: string): void {
  const file = vaultFile(path);
  if (file.exists) file.delete();
}

/**
 * Delete a temporary plaintext file. Never throws into a capture that has
 * already been sealed; a file that will not go is reported (it is plaintext
 * left in the cache), never swallowed.
 */
export function discardTemporary(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    Sentry.captureException(error);
  }
}
