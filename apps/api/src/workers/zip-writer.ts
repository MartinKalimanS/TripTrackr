import { once } from 'node:events';
import { createWriteStream } from 'node:fs';
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';

/**
 * A zip written to a file as it is built (the data export, spec 009; FR-004).
 *
 * The archive can hold hundreds of photos, so it is never assembled in memory: each entry is
 * pushed through fflate's streaming `Zip` straight into a write stream, and after every entry the
 * writer waits for the stream to drain, so what is in memory at any moment is one entry (one photo)
 * and not the archive. Text is deflated; a photo or a document is already compressed (a JPEG, a
 * PNG) and is stored.
 *
 * The file is created readable by its owner only (0600): while it exists it holds a traveller's
 * documents in the clear.
 */
export interface ZipEntries {
  /** A text file (JSON, CSV, the README), deflated. */
  text(name: string, content: string): Promise<void>;
  /** A file that is already compressed, stored as it is. */
  binary(name: string, bytes: Uint8Array): Promise<void>;
}

export async function writeZip(
  path: string,
  produce: (entries: ZipEntries) => Promise<void>,
): Promise<void> {
  const out = createWriteStream(path, { mode: 0o600 });
  const written = new Promise<void>((resolve, reject) => {
    out.once('finish', resolve);
    out.once('error', reject);
  });
  let failure: Error | null = null;

  const zip = new Zip((error, chunk, final) => {
    if (error) {
      failure = error;
      return;
    }
    out.write(chunk);
    if (final) out.end();
  });

  const drained = async () => {
    if (out.writableNeedDrain) await once(out, 'drain');
  };

  const entries: ZipEntries = {
    async text(name, content) {
      const file = new ZipDeflate(name, { level: 6 });
      zip.add(file);
      file.push(strToU8(content), true);
      await drained();
    },
    async binary(name, bytes) {
      const file = new ZipPassThrough(name);
      zip.add(file);
      file.push(bytes, true);
      await drained();
    },
  };

  try {
    await produce(entries);
    zip.end();
  } catch (error) {
    zip.terminate();
    out.destroy();
    throw error;
  }

  await written;
  // Assigned inside fflate's callback, which the compiler cannot see: read it as what it may be.
  const failed = failure as Error | null;
  if (failed) throw failed;
}
