/**
 * Device storage exhausted — tasks.md T139 (sync-protocol.md §4, "Device
 * storage exhausted mid-capture fails the capture with a clear message and
 * leaves no half-written record"; FR-041; Constitution II).
 *
 * What the SDK 57 reference gives (https://docs.expo.dev/versions/v57.0.0/sdk/filesystem.md):
 *
 *   - `Paths.availableDiskSpace` — bytes free on the volume that holds
 *     app-private storage (iOS `systemFreeSize`, Android `File.freeSpace`).
 *     It is the only free-space API; the legacy `getFreeDiskStorageAsync` is
 *     deprecated and throws.
 *   - NO error code for a full disk. A failing write surfaces as a wrapped
 *     native error whose message carries the operating system's words:
 *     Android `java.io.IOException: No space left on device` (ENOSPC), iOS
 *     `NSFileWriteOutOfSpaceError` ("… there isn’t enough space"), and SQLite's
 *     `SQLITE_FULL: database or disk is full` for the row.
 *
 * So a full disk is recognised three ways, all here so that photos and
 * documents behave alike: free space is checked BEFORE any work is done
 * (`requireRoomFor`), a failure is matched by its words (`isOutOfSpaceError`),
 * and a capture that failed for any reason asks once more whether the disk is
 * now short (`hasRoomFor`) — the reading can lag the failure.
 *
 * A reading of zero or a missing one means "the platform cannot say" and is
 * treated as room: the write that follows would fail loudly, and blocking a
 * capture on a wrong reading would lose a traveller's photo for nothing.
 */
import { Paths } from 'expo-file-system';

/** The capture found the device short of space. Shown to the traveller, never reported. */
export class StorageFullError extends Error {
  constructor(cause?: unknown) {
    super('There is not enough free space on this device to save this capture.', {
      cause,
    });
    this.name = 'StorageFullError';
  }
}

const OUT_OF_SPACE = new RegExp(
  [
    'no space',
    'ENOSPC',
    "(?:not|n['’]t) enough (?:free )?(?:disk |storage )?space",
    'out of (?:disk |storage )?space',
    '(?:disk|storage) (?:is )?full',
    'SQLITE_FULL',
    'database or disk is full',
    'NSFileWriteOutOfSpaceError',
  ].join('|'),
  'i',
);

/** How many `cause`s deep a wrapped native error is followed. */
const MAX_CAUSE_DEPTH = 5;

/** Whether the device has at least `bytes` free; true when it cannot say. */
export function hasRoomFor(bytes: number): boolean {
  const free = Paths.availableDiskSpace;
  return !(typeof free === 'number' && free > 0 && free < bytes);
}

/** @throws {StorageFullError} when the device is known to have less than `bytes` free. */
export function requireRoomFor(bytes: number): void {
  if (!hasRoomFor(bytes)) throw new StorageFullError();
}

function wordsOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!(value instanceof Error)) return '';
  const code = (value as Error & { code?: unknown }).code;
  return `${value.name} ${value.message} ${typeof code === 'string' ? code : ''}`;
}

/** True for a failure that means the disk (or the database's volume) is full. */
export function isOutOfSpaceError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined; depth += 1) {
    if (seen.has(current)) return false;
    seen.add(current);
    if (OUT_OF_SPACE.test(wordsOf(current))) return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}
