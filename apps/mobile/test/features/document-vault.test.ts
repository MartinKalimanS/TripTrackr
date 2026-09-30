/**
 * T212 — a document file never rests in the clear on the device (FR-033;
 * data-model.md §10; research D-32).
 *
 * The vault runs for real against two faithful doubles (document-doubles.ts):
 * an in-memory expo-file-system and expo-crypto's AES-GCM API implemented with
 * Node's own AES-256-GCM, so what is sealed here is real ciphertext. The
 * keychain is jest.setup.ts's in-memory SecureStore, through the real
 * `lib/secure-store.ts`. Pinned: a round trip returns the bytes; the file on
 * disk carries none of them; it is bound to its document id and to this
 * device's key; the camera's, picker's or editor's temporary plaintext is
 * deleted whether sealing succeeds or fails; the key is made once; and the
 * path recorded survives a moved app container because it is relative.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import {
  VAULT_DIRECTORY,
  VaultPathError,
  decodedByteLength,
  discardTemporary,
  openSealedFile,
  removeSealedFile,
  sealTemporaryFile,
  vaultPathFor,
} from '@/features/documents/document-vault';
import { SECURE_KEYS } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

import {
  FAKE_CACHE_ROOT,
  FAKE_DOCUMENT_ROOT,
  type FakeFileSystemModule,
} from './document-doubles';

jest.mock('expo-file-system', () => require('./document-doubles').fileSystemDouble());
jest.mock('expo-crypto', () => require('./document-doubles').cryptoDouble());
jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const fileSystem = jest.requireMock('expo-file-system') as FakeFileSystemModule;
const crypto = Crypto as unknown as {
  aesEncryptAsync: jest.Mock;
  getRandomBytesAsync: jest.Mock;
};
const secureStore = SecureStore as unknown as {
  getItemAsync: jest.Mock;
  __reset: () => void;
};

const DOCUMENT_ID = '0b4d3c2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const OTHER_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
const CAMERA_OUTPUT = `${FAKE_CACHE_ROOT}/Camera/5A1B.jpg`;
/** A stand-in JPEG whose text would be visible in a file dump if it leaked. */
const PLAINTEXT = Buffer.from(
  '\xff\xd8\xff\xe0 BOARDING PASS DESMARAIS/LUC AC834',
  'latin1',
);

function sealedUri(id: string): string {
  return `${FAKE_DOCUMENT_ROOT}/${VAULT_DIRECTORY}/${id}.sealed`;
}

function onDisk(): Map<string, Uint8Array> {
  return new Map(fileSystem.__files());
}

beforeEach(() => {
  fileSystem.__reset();
  secureStore.__reset();
  fileSystem.__seed(CAMERA_OUTPUT, PLAINTEXT);
});

describe('document vault — sealing a temporary file (T212)', () => {
  test('round trip: the sealed file opens to the original bytes, as base64, in memory', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    expect(sealed).toEqual({
      path: `${VAULT_DIRECTORY}/${DOCUMENT_ID}.sealed`,
      byteSize: PLAINTEXT.length,
    });
    await expect(openSealedFile(DOCUMENT_ID, sealed.path)).resolves.toBe(
      PLAINTEXT.toString('base64'),
    );
  });

  test('deletes the temporary plaintext at once, and nothing on disk carries the document', async () => {
    await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    const files = onDisk();
    expect([...files.keys()]).toEqual([sealedUri(DOCUMENT_ID)]);
    const stored = Buffer.from(files.get(sealedUri(DOCUMENT_ID)) ?? new Uint8Array());
    expect(stored.includes(Buffer.from('DESMARAIS'))).toBe(false);
    expect(stored.includes(PLAINTEXT)).toBe(false);
    // IV (12) + ciphertext (same length as the plaintext) + GCM tag (16).
    expect(stored.length).toBe(12 + PLAINTEXT.length + 16);
  });

  test('opening writes nothing to disk — the image exists only in memory', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);
    const before = onDisk();

    await openSealedFile(DOCUMENT_ID, sealed.path);

    expect(onDisk()).toEqual(before);
  });

  test('records a path relative to the documents directory, so an iOS container move cannot orphan it', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    expect(sealed.path).not.toMatch(/^file:|^\//);
    expect(sealed.path).not.toContain(FAKE_DOCUMENT_ROOT);
    expect(vaultPathFor(DOCUMENT_ID)).toBe(sealed.path);
  });

  test('uses AES-GCM with the document id as associated data', async () => {
    await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    const [, key, options] = crypto.aesEncryptAsync.mock.calls[0] as [
      unknown,
      { size: number },
      { additionalData: Uint8Array },
    ];
    expect(key.size).toBe(256);
    expect(Buffer.from(options.additionalData).toString('utf8')).toBe(DOCUMENT_ID);
  });

  test('creates the device key once, in the keychain, and reuses it for every document', async () => {
    await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);
    fileSystem.__seed(`${FAKE_CACHE_ROOT}/Camera/5A1C.jpg`, PLAINTEXT);
    await sealTemporaryFile(OTHER_ID, `${FAKE_CACHE_ROOT}/Camera/5A1C.jpg`);

    expect(crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1);
    expect(crypto.getRandomBytesAsync).toHaveBeenCalledWith(32);
    await expect(SecureStore.getItemAsync(SECURE_KEYS.documentsKey)).resolves.toMatch(
      /^[0-9a-f]{64}$/,
    );
  });
});

describe('document vault — the temporary is deleted even when sealing fails', () => {
  test('encryption failure: the plaintext is gone, nothing sealed is left, and the error propagates', async () => {
    crypto.aesEncryptAsync.mockRejectedValueOnce(new Error('encryption failed'));

    await expect(sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT)).rejects.toThrow(
      'encryption failed',
    );
    expect([...onDisk().keys()]).toEqual([]);
  });

  test('keychain failure: the plaintext is gone', async () => {
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain unavailable'));

    await expect(sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT)).rejects.toThrow(
      'Keychain unavailable',
    );
    expect(onDisk().has(CAMERA_OUTPUT)).toBe(false);
  });

  test('a full disk: neither the plaintext nor a partial sealed file is left behind', async () => {
    fileSystem.__failNextWrite(new Error('ENOSPC: no space left on device'));

    await expect(sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT)).rejects.toThrow(/ENOSPC/);
    expect([...onDisk().keys()]).toEqual([]);
  });

  test('a temporary that is already gone fails the seal, and nothing else is touched', async () => {
    await expect(
      sealTemporaryFile(DOCUMENT_ID, `${FAKE_CACHE_ROOT}/Camera/missing.jpg`),
    ).rejects.toThrow(/does not exist/);
    expect([...onDisk().keys()]).toEqual([CAMERA_OUTPUT]);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});

describe('document vault — a sealed file opens only as itself, on this device', () => {
  test('bound to its document id: the same bytes under another id refuse to open', async () => {
    await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);
    const stored = onDisk().get(sealedUri(DOCUMENT_ID)) ?? new Uint8Array();
    fileSystem.__seed(sealedUri(OTHER_ID), stored);

    await expect(openSealedFile(OTHER_ID, vaultPathFor(OTHER_ID))).rejects.toThrow();
  });

  test('tamper-evident: one flipped byte refuses to open', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);
    const stored = new Uint8Array(onDisk().get(sealedUri(DOCUMENT_ID)) ?? []);
    stored[20] = (stored[20] ?? 0) ^ 0xff;
    fileSystem.__seed(sealedUri(DOCUMENT_ID), stored);

    await expect(openSealedFile(DOCUMENT_ID, sealed.path)).rejects.toThrow();
  });

  test('bound to this device’s key: a new key cannot open what the old one sealed', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);
    secureStore.__reset();

    await expect(openSealedFile(DOCUMENT_ID, sealed.path)).rejects.toThrow();
  });

  test('refuses a path that is not this document’s own vault file', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    await expect(openSealedFile(OTHER_ID, sealed.path)).rejects.toBeInstanceOf(
      VaultPathError,
    );
    await expect(
      openSealedFile(DOCUMENT_ID, `${VAULT_DIRECTORY}/../SQLite/triptrackr.db`),
    ).rejects.toBeInstanceOf(VaultPathError);
    await expect(
      openSealedFile(DOCUMENT_ID, sealedUri(DOCUMENT_ID)),
    ).rejects.toBeInstanceOf(VaultPathError);
  });

  test('refuses to derive a path from anything but a UUID', () => {
    expect(() => vaultPathFor('../../escape')).toThrow(VaultPathError);
    expect(() => vaultPathFor('')).toThrow(VaultPathError);
  });

  test('a missing sealed file is reported as an error, not as an empty document', async () => {
    await expect(openSealedFile(DOCUMENT_ID, vaultPathFor(DOCUMENT_ID))).rejects.toThrow(
      /does not exist/,
    );
  });
});

describe('document vault — removal and temporaries', () => {
  test('removeSealedFile deletes the sealed file; a missing one is not an error', async () => {
    const sealed = await sealTemporaryFile(DOCUMENT_ID, CAMERA_OUTPUT);

    removeSealedFile(sealed.path);
    removeSealedFile(sealed.path);

    expect([...onDisk().keys()]).toEqual([]);
    expect(() => removeSealedFile('../outside.sealed')).toThrow(VaultPathError);
  });

  test('discardTemporary deletes a temporary and ignores one already gone', () => {
    discardTemporary(CAMERA_OUTPUT);
    discardTemporary(CAMERA_OUTPUT);

    expect(onDisk().has(CAMERA_OUTPUT)).toBe(false);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  test('a temporary that cannot be deleted is reported — never swallowed, never thrown into the capture', () => {
    const failure = new Error('EACCES');
    fileSystem.__failDelete(CAMERA_OUTPUT, failure);

    expect(() => discardTemporary(CAMERA_OUTPUT)).not.toThrow();
    expect(Sentry.captureException).toHaveBeenCalledWith(failure);
  });

  test('decodedByteLength counts the bytes a base64 string carries', () => {
    expect(decodedByteLength('')).toBe(0);
    expect(decodedByteLength('QQ==')).toBe(1);
    expect(decodedByteLength('QUI=')).toBe(2);
    expect(decodedByteLength('QUJD')).toBe(3);
    expect(decodedByteLength(PLAINTEXT.toString('base64'))).toBe(PLAINTEXT.length);
  });
});
