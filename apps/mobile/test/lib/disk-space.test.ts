/**
 * Device storage exhausted — tasks.md T139 (sync-protocol.md §4; FR-041).
 *
 * What is pinned: free space is read from `Paths.availableDiskSpace` and a
 * reading the platform cannot give is "unknown", never "full"; and a full disk
 * is recognised by the wrapped native failure's words (the SDK 57 reference
 * names no error code for it) however the failure is nested.
 */
import {
  StorageFullError,
  hasRoomFor,
  isOutOfSpaceError,
  requireRoomFor,
} from '@/lib/disk-space';

const mockDisk: { free: number | undefined } = { free: undefined };

jest.mock('expo-file-system', () => ({
  Paths: {
    get availableDiskSpace() {
      return mockDisk.free;
    },
  },
}));

const MIB = 1024 * 1024;

beforeEach(() => {
  mockDisk.free = undefined;
});

describe('hasRoomFor', () => {
  test('is true when the platform cannot say how much is free', () => {
    mockDisk.free = undefined;
    expect(hasRoomFor(25 * MIB)).toBe(true);
  });

  test('treats a reading of zero as "cannot say", not as a full disk', () => {
    // Android answers 0 for a partition it cannot resolve; the write that
    // follows fails loudly if the disk really is full (isOutOfSpaceError).
    mockDisk.free = 0;
    expect(hasRoomFor(25 * MIB)).toBe(true);
  });

  test('is false when less than the bytes asked for is free', () => {
    mockDisk.free = 25 * MIB - 1;
    expect(hasRoomFor(25 * MIB)).toBe(false);
  });

  test('is true when exactly enough, or more, is free', () => {
    mockDisk.free = 25 * MIB;
    expect(hasRoomFor(25 * MIB)).toBe(true);
    mockDisk.free = 64 * 1024 * MIB;
    expect(hasRoomFor(25 * MIB)).toBe(true);
  });
});

describe('requireRoomFor', () => {
  test('throws StorageFullError when there is not enough room', () => {
    mockDisk.free = MIB;
    expect(() => requireRoomFor(25 * MIB)).toThrow(StorageFullError);
  });

  test('does nothing when there is room', () => {
    mockDisk.free = 100 * MIB;
    expect(() => requireRoomFor(25 * MIB)).not.toThrow();
  });
});

describe('isOutOfSpaceError', () => {
  test.each([
    ['Android (java.io.IOException)', 'write failed: No space left on device'],
    ['POSIX', 'ENOSPC: no space left on device, write'],
    [
      'iOS (NSFileWriteOutOfSpaceError, localised)',
      'The file “abc.jpg” couldn’t be saved because there isn’t enough space.',
    ],
    ['iOS (straight apostrophe)', "There isn't enough space to save the file"],
    ['iOS (error name)', 'NSFileWriteOutOfSpaceError'],
    ['SQLite', 'SQLITE_FULL: database or disk is full'],
    ['a generic full disk', 'The disk is full'],
    ['a generic full storage', 'Device storage full'],
    ['out of space', 'The device is out of space'],
  ])('recognises %s', (_label, message) => {
    expect(isOutOfSpaceError(new Error(message))).toBe(true);
  });

  test('recognises a coded error', () => {
    const coded = Object.assign(new Error('write failed'), { code: 'ENOSPC' });
    expect(isOutOfSpaceError(coded)).toBe(true);
  });

  test('looks through a wrapped cause', () => {
    const inner = new Error('No space left on device');
    const outer = new Error('Unable to write to a file handle', { cause: inner });
    expect(isOutOfSpaceError(outer)).toBe(true);
  });

  test('a cause chain that loops back on itself terminates', () => {
    const a = new Error('A');
    const b = new Error('B', { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    expect(isOutOfSpaceError(a)).toBe(false);
  });

  test.each([
    ['an unrelated failure', new Error('The image could not be decoded.')],
    ['a permission failure', new Error('Missing permission for uri')],
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
  ])('does not mistake %s for a full disk', (_label, value) => {
    expect(isOutOfSpaceError(value)).toBe(false);
  });

  test('accepts a bare string, as a rejected promise sometimes carries one', () => {
    expect(isOutOfSpaceError('ENOSPC')).toBe(true);
    expect(isOutOfSpaceError('something else')).toBe(false);
  });
});

describe('StorageFullError', () => {
  test('is a named Error a caller can tell apart', () => {
    const error = new StorageFullError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StorageFullError');
    expect(error.message).toMatch(/free space/i);
  });
});
