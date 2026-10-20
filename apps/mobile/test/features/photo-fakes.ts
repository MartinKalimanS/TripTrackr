/**
 * In-memory stand-ins for the native modules the photo pipeline drives, for
 * the photo suites' own `jest.mock` factories (jest.setup.ts is not touched):
 *
 *   jest.mock('expo-file-system', () =>
 *     jest.requireActual('./photo-fakes').createFileSystemMock());
 *
 * Each mirrors the SDK 57 contract closely enough that code wrong on a device
 * is wrong here too (https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md,
 * .../imagemanipulator.md):
 *   - `File`/`Directory` join their arguments into a URI; neither needs to
 *     exist to be constructed.
 *   - `File.move(destination)` is ASYNC, updates `uri`, refuses a missing
 *     source, an existing destination, or a destination whose directory does
 *     not exist yet; `delete()` of a missing file throws.
 *   - `Directory.create({ intermediates, idempotent })`.
 *   - `File.upload(url, options)` resolves with `{ status, headers, body }` for
 *     any HTTP answer and rejects only when the request itself fails.
 *   - `ImageManipulator.manipulate(uri | ImageRef)` → a context whose
 *     `resize` keeps the aspect ratio when given one edge, whose `renderAsync`
 *     yields an `ImageRef` with `width`/`height`, and whose `saveAsync` writes
 *     a new file into the cache directory.
 */

export const DOCUMENTS = 'file:///data/app/documents';
export const CACHE = 'file:///data/app/cache';

type Uri = { uri: string };

function joinUris(parts: readonly (string | Uri)[]): string {
  const joined = parts
    .map((part) => (typeof part === 'string' ? part : part.uri))
    .join('/')
    .replace(/([^:/])\/{2,}/g, '$1/');
  return joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

function parentOf(uri: string): string {
  return uri.slice(0, uri.lastIndexOf('/'));
}

export interface MockUploadOptions {
  httpMethod?: string;
  headers?: Record<string, string>;
  uploadType?: number;
  sessionType?: string;
  signal?: AbortSignal;
}

export function createFileSystemMock() {
  const files = new Map<string, number>();
  const directories = new Set<string>([DOCUMENTS, CACHE]);
  const state = {
    availableDiskSpace: 64 * 1024 * 1024 * 1024,
    /** Return an error to make the next move to a matching destination fail. */
    failMove: null as ((to: string) => Error | null) | null,
    /** Return an error to make creating a matching directory fail (a full disk cannot make one). */
    failCreate: null as ((uri: string) => Error | null) | null,
  };
  const upload = jest.fn(
    async (_fileUri: string, _url: string, _options?: MockUploadOptions) => ({
      status: 200,
      headers: {} as Record<string, string>,
      body: '',
    }),
  );

  class MockDirectory {
    uri: string;
    constructor(...uris: (string | Uri)[]) {
      this.uri = joinUris(uris);
    }
    get exists() {
      return directories.has(this.uri);
    }
    create(options: { intermediates?: boolean; idempotent?: boolean } = {}) {
      if (directories.has(this.uri)) {
        if (options.idempotent) return;
        throw new Error(`Directory ${this.uri} already exists`);
      }
      const injected = state.failCreate?.(this.uri) ?? null;
      if (injected) throw injected;
      if (!directories.has(parentOf(this.uri)) && !options.intermediates) {
        throw new Error(`Parent of ${this.uri} does not exist`);
      }
      let cursor = this.uri;
      while (!directories.has(cursor)) {
        directories.add(cursor);
        cursor = parentOf(cursor);
      }
    }
  }

  class MockFile {
    uri: string;
    constructor(...uris: (string | Uri)[]) {
      this.uri = joinUris(uris);
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri) ?? 0;
    }
    async move(destination: Uri) {
      const target =
        destination instanceof MockDirectory
          ? `${destination.uri}/${this.uri.slice(this.uri.lastIndexOf('/') + 1)}`
          : destination.uri;
      if (!files.has(this.uri)) throw new Error(`File ${this.uri} does not exist`);
      if (files.has(target)) throw new Error(`Destination ${target} already exists`);
      if (!directories.has(parentOf(target))) {
        throw new Error(`Destination directory ${parentOf(target)} does not exist`);
      }
      const injected = state.failMove?.(target) ?? null;
      if (injected) throw injected;
      files.set(target, files.get(this.uri) ?? 0);
      files.delete(this.uri);
      this.uri = target;
    }
    delete() {
      if (!files.has(this.uri)) throw new Error(`File ${this.uri} does not exist`);
      files.delete(this.uri);
    }
    upload(url: string, options?: MockUploadOptions) {
      if (!files.has(this.uri)) {
        return Promise.reject(new Error('File does not exist'));
      }
      return upload(this.uri, url, options);
    }
  }

  const Paths = {
    document: new MockDirectory(DOCUMENTS),
    cache: new MockDirectory(CACHE),
    get availableDiskSpace() {
      return state.availableDiskSpace;
    },
  };

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths,
    UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
    __fs: {
      files,
      directories,
      state,
      upload,
      /** Put a file on the fake disk, as the picker does with its cache copy. */
      write: (uri: string, bytes = 1024) => files.set(uri, bytes),
      reset: () => {
        files.clear();
        directories.clear();
        directories.add(DOCUMENTS);
        directories.add(CACHE);
        state.availableDiskSpace = 64 * 1024 * 1024 * 1024;
        state.failMove = null;
        state.failCreate = null;
        upload.mockReset();
        upload.mockImplementation(async () => ({ status: 200, headers: {}, body: '' }));
      },
    },
  };
}

export type FileSystemMock = ReturnType<typeof createFileSystemMock>;

export function createManipulatorMock() {
  const { __fs } = jest.requireMock('expo-file-system') as FileSystemMock;
  /** Source images the "decoder" can read, by URI; anything else fails to load. */
  const images = new Map<string, { width: number; height: number }>();
  const saved: {
    uri: string;
    width: number;
    height: number;
    compress?: number;
    format?: string;
  }[] = [];
  const state = { failSaveAt: null as number | null };
  let counter = 0;

  class MockImageRef {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    release = jest.fn();
    async saveAsync(options: { compress?: number; format?: string } = {}) {
      counter += 1;
      if (state.failSaveAt === counter) throw new Error('No space left on device');
      const uri = `${CACHE}/ImageManipulator/${counter}.jpg`;
      __fs.write(uri, this.width * this.height);
      saved.push({ uri, width: this.width, height: this.height, ...options });
      return { uri, width: this.width, height: this.height };
    }
  }

  class MockContext {
    private size: { width?: number | null; height?: number | null } | null = null;
    constructor(private readonly source: string | MockImageRef) {}
    release = jest.fn();
    resize(size: { width?: number | null; height?: number | null }) {
      this.size = size;
      return this;
    }
    async renderAsync() {
      const base =
        typeof this.source === 'string' ? images.get(this.source) : this.source;
      if (!base) throw new Error(`Could not load the image ${String(this.source)}`);
      if (!this.size) return new MockImageRef(base.width, base.height);
      const ratio = base.width / base.height;
      const width = this.size.width ?? Math.round((this.size.height ?? 0) * ratio);
      const height = this.size.height ?? Math.round((this.size.width ?? 0) / ratio);
      return new MockImageRef(width, height);
    }
  }

  return {
    ImageManipulator: {
      manipulate: jest.fn((source: string | MockImageRef) => new MockContext(source)),
    },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
    __manipulator: {
      images,
      saved,
      state,
      reset: () => {
        images.clear();
        saved.length = 0;
        state.failSaveAt = null;
        counter = 0;
      },
    },
  };
}

export type ManipulatorMock = ReturnType<typeof createManipulatorMock>;
