/**
 * Test doubles for the document vault's native dependencies — tasks.md T212
 * (research D-32). Used from `jest.mock` factories through `require`, so each
 * suite gets its own fresh instance.
 *
 * A stub that lies is worse than none (jest.setup.ts), so both mirror the v57
 * contracts closely enough that a test failing here would also fail on the
 * device:
 *
 *   - `expo-file-system` (https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md)
 *     becomes an in-memory tree of `File`, `Directory` and `Paths`. A file must
 *     be created inside a directory that exists; `create` refuses an existing
 *     file without `overwrite`; `delete` refuses a missing one. What is on
 *     "disk" can be listed, so a suite asserts that no plaintext is left.
 *   - `expo-crypto`'s AES API (https://docs.expo.dev/versions/v57.0.0/sdk/crypto.md)
 *     is AES-GCM from Node's `crypto`: `BinaryInput` strings are base64, the
 *     combined form is IV ‖ ciphertext ‖ tag (12 + n + 16 bytes by default),
 *     and a wrong key, wrong associated data or a flipped byte fails to open.
 *     `randomUUID` and the random-bytes functions keep jest.setup.ts's
 *     behaviour, since this double replaces that one in a suite that uses it.
 *   - `expo-image-manipulator` (https://docs.expo.dev/versions/v57.0.0/sdk/imagemanipulator.md)
 *     decodes to the size a suite sets, applies `resize` the documented way
 *     (one dimension given, the other kept in proportion), and `saveAsync`
 *     writes its output into the fake cache, as the native module does.
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID as nodeRandomUUID,
} from 'crypto';

// ---------------------------------------------------------------------------
// expo-file-system
// ---------------------------------------------------------------------------

type PathPart = string | { uri: string };

export const FAKE_DOCUMENT_ROOT = 'file:///data/app/Documents';
export const FAKE_CACHE_ROOT = 'file:///data/app/Caches';

function joinUri(parts: readonly PathPart[]): string {
  const [first, ...rest] = parts.map((part) =>
    typeof part === 'string' ? part : part.uri,
  );
  const segments = rest.map((segment) => segment.replace(/^\/+|\/+$/g, ''));
  return [(first ?? '').replace(/\/+$/, ''), ...segments.filter(Boolean)].join('/');
}

function parentOf(uri: string): string {
  return uri.slice(0, uri.lastIndexOf('/'));
}

export interface FakeFileSystemModule {
  File: new (...parts: PathPart[]) => FakeFileHandle;
  Directory: new (...parts: PathPart[]) => FakeDirectoryHandle;
  Paths: {
    readonly document: FakeDirectoryHandle;
    readonly cache: FakeDirectoryHandle;
    /** `undefined` until a suite sets it: the platform "cannot say". */
    readonly availableDiskSpace: number | undefined;
  };
  /** Every file on the fake disk, by URI. */
  __files: () => ReadonlyMap<string, Uint8Array>;
  /** Put a file on disk — a camera's, picker's or editor's output. */
  __seed: (uri: string, bytes: Uint8Array | string) => void;
  /** What `Paths.availableDiskSpace` reports, in bytes. */
  __setFreeSpace: (bytes: number | undefined) => void;
  /** The next `write` throws this, as a full disk would. */
  __failNextWrite: (error: Error) => void;
  /** Creating a file or directory whose URI this answers with an error fails with it. */
  __failCreate: (fault: ((uri: string) => Error | null) | null) => void;
  /** The next `delete` of this URI throws. */
  __failDelete: (uri: string, error: Error) => void;
  __reset: () => void;
}

export interface FakeFileHandle {
  readonly uri: string;
  readonly exists: boolean;
  readonly size: number;
  create: (options?: { overwrite?: boolean; intermediates?: boolean }) => void;
  write: (
    content: string | Uint8Array,
    options?: { encoding?: 'utf8' | 'base64' },
  ) => void;
  bytes: () => Promise<Uint8Array>;
  base64: () => Promise<string>;
  delete: () => void;
}

export interface FakeDirectoryHandle {
  readonly uri: string;
  readonly exists: boolean;
  create: (options?: { intermediates?: boolean; idempotent?: boolean }) => void;
  delete: () => void;
}

export function fileSystemDouble(): FakeFileSystemModule {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>([FAKE_DOCUMENT_ROOT, FAKE_CACHE_ROOT]);
  const faults: {
    write: Error | null;
    deletes: Map<string, Error>;
    create: ((uri: string) => Error | null) | null;
    freeSpace: number | undefined;
  } = {
    write: null,
    deletes: new Map(),
    create: null,
    freeSpace: undefined,
  };

  const failIfCreateFaulted = (uri: string) => {
    const error = faults.create?.(uri) ?? null;
    if (error) throw error;
  };

  const requireDirectory = (uri: string) => {
    if (!directories.has(uri)) throw new Error(`Directory ${uri} does not exist`);
  };

  class FakeDirectory implements FakeDirectoryHandle {
    readonly uri: string;
    constructor(...parts: PathPart[]) {
      this.uri = joinUri(parts);
    }
    get exists() {
      return directories.has(this.uri);
    }
    create(options: { intermediates?: boolean; idempotent?: boolean } = {}) {
      if (this.exists) {
        if (options.idempotent) return;
        throw new Error(`Directory ${this.uri} already exists`);
      }
      failIfCreateFaulted(this.uri);
      if (!options.intermediates) requireDirectory(parentOf(this.uri));
      directories.add(this.uri);
    }
    delete() {
      for (const uri of [...files.keys()]) {
        if (uri.startsWith(`${this.uri}/`)) files.delete(uri);
      }
      directories.delete(this.uri);
    }
  }

  class FakeFile implements FakeFileHandle {
    readonly uri: string;
    constructor(...parts: PathPart[]) {
      this.uri = joinUri(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    create(options: { overwrite?: boolean; intermediates?: boolean } = {}) {
      if (this.exists && !options.overwrite) {
        throw new Error(`File ${this.uri} already exists`);
      }
      failIfCreateFaulted(this.uri);
      if (!options.intermediates) requireDirectory(parentOf(this.uri));
      files.set(this.uri, new Uint8Array());
    }
    write(content: string | Uint8Array, options: { encoding?: 'utf8' | 'base64' } = {}) {
      if (faults.write) {
        const error = faults.write;
        faults.write = null;
        throw error;
      }
      requireDirectory(parentOf(this.uri));
      const bytes =
        typeof content === 'string'
          ? Buffer.from(content, options.encoding === 'base64' ? 'base64' : 'utf8')
          : content;
      files.set(this.uri, new Uint8Array(bytes));
    }
    async bytes() {
      const bytes = files.get(this.uri);
      if (!bytes) throw new Error(`File ${this.uri} does not exist`);
      return new Uint8Array(bytes);
    }
    async base64() {
      return Buffer.from(await this.bytes()).toString('base64');
    }
    delete() {
      const fault = faults.deletes.get(this.uri);
      if (fault) {
        faults.deletes.delete(this.uri);
        throw fault;
      }
      if (!files.delete(this.uri)) throw new Error(`File ${this.uri} does not exist`);
    }
  }

  return {
    File: FakeFile,
    Directory: FakeDirectory,
    Paths: {
      get document() {
        return new FakeDirectory(FAKE_DOCUMENT_ROOT);
      },
      get cache() {
        return new FakeDirectory(FAKE_CACHE_ROOT);
      },
      get availableDiskSpace() {
        return faults.freeSpace;
      },
    },
    __files: () => new Map(files),
    __setFreeSpace: (bytes) => {
      faults.freeSpace = bytes;
    },
    __failCreate: (fault) => {
      faults.create = fault;
    },
    __seed: (uri, bytes) => {
      directories.add(parentOf(uri));
      files.set(
        uri,
        new Uint8Array(typeof bytes === 'string' ? Buffer.from(bytes) : bytes),
      );
    },
    __failNextWrite: (error) => {
      faults.write = error;
    },
    __failDelete: (uri, error) => {
      faults.deletes.set(uri, error);
    },
    __reset: () => {
      files.clear();
      directories.clear();
      directories.add(FAKE_DOCUMENT_ROOT);
      directories.add(FAKE_CACHE_ROOT);
      faults.write = null;
      faults.deletes.clear();
      faults.create = null;
      faults.freeSpace = undefined;
    },
  };
}

// ---------------------------------------------------------------------------
// expo-crypto (AES-GCM)
// ---------------------------------------------------------------------------

type BinaryInput = string | Uint8Array | ArrayBuffer;

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** v57: "When providing a string, it must be base64-encoded." */
function toBuffer(input: BinaryInput): Buffer {
  if (typeof input === 'string') {
    if (!BASE64.test(input)) throw new TypeError('BinaryInput string is not base64');
    return Buffer.from(input, 'base64');
  }
  return Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
}

function encode(bytes: Buffer, encoding: 'bytes' | 'base64' = 'bytes') {
  return encoding === 'base64' ? bytes.toString('base64') : new Uint8Array(bytes);
}

class FakeAESEncryptionKey {
  readonly material: Buffer;
  private constructor(material: Buffer) {
    this.material = material;
  }
  static async generate(size = 256) {
    return new FakeAESEncryptionKey(randomBytes(size / 8));
  }
  static async import(input: string | Uint8Array, encoding?: 'hex' | 'base64') {
    if (
      typeof input === 'string' &&
      encoding === 'hex' &&
      !/^[0-9a-fA-F]*$/.test(input)
    ) {
      throw new TypeError('Key is not hex');
    }
    const material =
      typeof input === 'string'
        ? Buffer.from(input, encoding === 'hex' ? 'hex' : 'base64')
        : Buffer.from(input);
    if (![16, 24, 32].includes(material.length)) {
      throw new RangeError(`Invalid AES key size: ${material.length * 8} bits`);
    }
    return new FakeAESEncryptionKey(material);
  }
  get size() {
    return this.material.length * 8;
  }
  async bytes() {
    return new Uint8Array(this.material);
  }
  async encoded(encoding: 'hex' | 'base64') {
    return this.material.toString(encoding);
  }
}

class FakeAESSealedData {
  readonly ivBytes: Buffer;
  readonly cipherBytes: Buffer;
  readonly tagBytes: Buffer;
  constructor(iv: Buffer, ciphertext: Buffer, tag: Buffer) {
    this.ivBytes = iv;
    this.cipherBytes = ciphertext;
    this.tagBytes = tag;
  }
  static fromCombined(
    combined: BinaryInput,
    config: { ivLength?: number; tagLength?: number } = {},
  ) {
    const bytes = toBuffer(combined);
    const ivLength = config.ivLength ?? 12;
    const tagLength = config.tagLength ?? 16;
    if (bytes.length < ivLength + tagLength)
      throw new RangeError('Sealed data is too short');
    return new FakeAESSealedData(
      bytes.subarray(0, ivLength),
      bytes.subarray(ivLength, bytes.length - tagLength),
      bytes.subarray(bytes.length - tagLength),
    );
  }
  get ivSize() {
    return this.ivBytes.length;
  }
  get tagSize() {
    return this.tagBytes.length;
  }
  get combinedSize() {
    return this.ivBytes.length + this.cipherBytes.length + this.tagBytes.length;
  }
  async combined(encoding: 'bytes' | 'base64' = 'bytes') {
    return encode(
      Buffer.concat([this.ivBytes, this.cipherBytes, this.tagBytes]),
      encoding,
    );
  }
  async iv(encoding: 'bytes' | 'base64' = 'bytes') {
    return encode(this.ivBytes, encoding);
  }
  async tag(encoding: 'bytes' | 'base64' = 'bytes') {
    return encode(this.tagBytes, encoding);
  }
}

interface EncryptOptions {
  nonce?: { length: number } | { bytes: BinaryInput };
  tagLength?: number;
  additionalData?: BinaryInput;
}

interface DecryptOptions {
  output?: 'bytes' | 'base64';
  additionalData?: BinaryInput;
}

async function fakeEncrypt(
  plaintext: BinaryInput,
  key: FakeAESEncryptionKey,
  options: EncryptOptions = {},
) {
  const iv =
    options.nonce && 'bytes' in options.nonce
      ? toBuffer(options.nonce.bytes)
      : randomBytes(options.nonce?.length ?? 12);
  const cipher = createCipheriv(
    `aes-${key.size}-gcm` as 'aes-256-gcm',
    key.material,
    iv,
    {
      authTagLength: options.tagLength ?? 16,
    },
  );
  if (options.additionalData !== undefined)
    cipher.setAAD(toBuffer(options.additionalData));
  const ciphertext = Buffer.concat([cipher.update(toBuffer(plaintext)), cipher.final()]);
  return new FakeAESSealedData(iv, ciphertext, cipher.getAuthTag());
}

async function fakeDecrypt(
  sealed: FakeAESSealedData,
  key: FakeAESEncryptionKey,
  options: DecryptOptions = {},
) {
  const decipher = createDecipheriv(
    `aes-${key.size}-gcm` as 'aes-256-gcm',
    key.material,
    sealed.ivBytes,
    { authTagLength: sealed.tagBytes.length },
  );
  decipher.setAuthTag(sealed.tagBytes);
  if (options.additionalData !== undefined)
    decipher.setAAD(toBuffer(options.additionalData));
  // `final()` throws "Unsupported state or unable to authenticate data" on any mismatch.
  const plaintext = Buffer.concat([
    decipher.update(sealed.cipherBytes),
    decipher.final(),
  ]);
  return options.output === 'base64'
    ? plaintext.toString('base64')
    : new Uint8Array(plaintext);
}

export function cryptoDouble() {
  return {
    randomUUID: jest.fn(() => nodeRandomUUID()),
    getRandomBytes: jest.fn((count: number) => new Uint8Array(randomBytes(count))),
    getRandomBytesAsync: jest.fn(
      async (count: number) => new Uint8Array(randomBytes(count)),
    ),
    AESEncryptionKey: FakeAESEncryptionKey,
    AESSealedData: FakeAESSealedData,
    aesEncryptAsync: jest.fn(fakeEncrypt),
    aesDecryptAsync: jest.fn(fakeDecrypt),
  };
}

// ---------------------------------------------------------------------------
// expo-image-manipulator
// ---------------------------------------------------------------------------

export interface FakeImageRef {
  readonly width: number;
  readonly height: number;
  saveAsync: jest.Mock;
  release: jest.Mock;
}

/** An editing context: `resize` chains, `renderAsync` decodes. */
export interface FakeImageContext {
  resize: jest.Mock;
  renderAsync: jest.Mock;
  release: jest.Mock;
}

export interface FakeImageManipulatorModule {
  ImageManipulator: { manipulate: jest.Mock };
  SaveFormat: { JPEG: 'jpeg'; PNG: 'png'; WEBP: 'webp' };
  /** Every context and image the code under test was handed, to check release. */
  __handed: () => { release: jest.Mock }[];
  /** The size the next decoded image has. */
  __decodeAs: (width: number, height: number) => void;
  /** The next `renderAsync` rejects with this. */
  __failNextRender: (error: Error) => void;
  /** The next `saveAsync` rejects with this, as a full disk would. */
  __failNextSave: (error: Error) => void;
  __reset: () => void;
}

/** "JPEG 2048x1536" — what the fake encoder writes, so a suite can read the size back. */
export function fakeJpegText(width: number, height: number): string {
  return `JPEG ${width}x${height}`;
}

export function imageManipulatorDouble(): FakeImageManipulatorModule {
  const state = {
    size: { width: 1000, height: 750 },
    renderFault: null as Error | null,
    saveFault: null as Error | null,
    saved: 0,
    handed: [] as { release: jest.Mock }[],
  };

  const imageRef = (width: number, height: number): FakeImageRef => {
    const ref: FakeImageRef = {
      width,
      height,
      saveAsync: jest.fn(async (options: { format?: string } = {}) => {
        const files = jest.requireMock('expo-file-system') as FakeFileSystemModule;
        if (state.saveFault) {
          const error = state.saveFault;
          state.saveFault = null;
          throw error;
        }
        state.saved += 1;
        const uri = `${FAKE_CACHE_ROOT}/ImageManipulator/${state.saved}.${options.format ?? 'jpeg'}`;
        files.__seed(uri, fakeJpegText(width, height));
        return { uri, width, height };
      }),
      release: jest.fn(),
    };
    state.handed.push(ref);
    return ref;
  };

  /** A context loads its source when rendered: a file that is gone fails, as on the device. */
  const context = (source: string | FakeImageRef): FakeImageContext => {
    const target =
      typeof source === 'string'
        ? { ...state.size }
        : { width: source.width, height: source.height };
    const ctx: FakeImageContext = {
      resize: jest.fn((size: { width?: number | null; height?: number | null }) => {
        const scale = size.width
          ? size.width / target.width
          : (size.height ?? 0) / target.height;
        target.width = Math.round(target.width * scale);
        target.height = Math.round(target.height * scale);
        return ctx;
      }),
      renderAsync: jest.fn(async () => {
        const files = jest.requireMock('expo-file-system') as FakeFileSystemModule;
        if (typeof source === 'string' && !files.__files().has(source)) {
          throw new Error(`Could not load the image at ${source}`);
        }
        if (state.renderFault) {
          const error = state.renderFault;
          state.renderFault = null;
          throw error;
        }
        return imageRef(target.width, target.height);
      }),
      release: jest.fn(),
    };
    state.handed.push(ctx);
    return ctx;
  };

  return {
    ImageManipulator: { manipulate: jest.fn(context) },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    __handed: () => [...state.handed],
    __decodeAs: (width, height) => {
      state.size = { width, height };
    },
    __failNextRender: (error) => {
      state.renderFault = error;
    },
    __failNextSave: (error) => {
      state.saveFault = error;
    },
    __reset: () => {
      state.size = { width: 1000, height: 750 };
      state.renderFault = null;
      state.saveFault = null;
      state.handed = [];
    },
  };
}
