import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import { loadEnv } from '@/common/config/env.schema';

/** The two private buckets. There is no third, and neither has a public policy. */
export type StorageBucket = 'photos' | 'documents';

export interface SignedUpload {
  /** Pre-signed PUT. The client sends the bytes here directly. */
  readonly url: string;
  /** The key the client must report back when it registers the row. */
  readonly storageKey: string;
  readonly expiresInSeconds: number;
}

/**
 * Pre-signed access to private object storage (rest-api.md §5–6, research D-12).
 *
 * A photo's bytes never pass through the API. The device uploads them straight
 * to the object store with a pre-signed PUT, and reads them back with a
 * short-lived pre-signed GET. That keeps a 12 MB upload from occupying a request
 * handler for its whole duration (SC-003), and it is why the buckets can stay
 * private with no public read policy whatsoever — the signature *is* the read
 * path, so revoking access is a matter of not signing rather than of editing a
 * bucket policy.
 *
 * Documents are the exception, and have no pre-signed URL at all: the API seals
 * them before they reach the bucket and opens them on the way out
 * (research D-32), through {@link putObject} and {@link getObject}. The media
 * worker uses the same two to read an original and write its thumbnail.
 *
 * Two properties are load-bearing:
 *
 * 1. **The client never chooses the storage key.** `buildKey` derives it from the
 *    owner's id plus a fresh uuid. A client-supplied key is a client-supplied
 *    path, and a client-supplied path is how one traveller writes over another
 *    traveller's object.
 * 2. **The URL expires in minutes, not hours.** A signed URL is a bearer
 *    capability with no further authorisation check behind it; anyone who obtains
 *    one has exactly the access it encodes for exactly as long as it lives. The
 *    TTL is the only thing bounding a leaked link, so it is deliberately short
 *    and configured rather than constant (`S3_SIGNED_URL_TTL_SECONDS`).
 *
 * Note what this service does *not* do: it never decides whether the caller is
 * allowed to read the object. That question is answered by RLS before a row —
 * and therefore a storage key — is ever in hand. Signing something you should not
 * have reached is not possible if you could not read the key.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** Round trips: the address the API itself reaches the store by. */
  private readonly client: S3Client;
  /**
   * Pre-signing only, never a round trip. A SigV4 signature covers the host, so
   * a URL handed to a phone must be signed for a host the phone can reach —
   * `S3_PUBLIC_ENDPOINT` in development, the same endpoint in production.
   */
  private readonly signer: S3Client;

  constructor() {
    const env = loadEnv();

    this.client = createClient(env.S3_ENDPOINT);
    this.signer = createClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);
  }

  /**
   * A pre-signed PUT plus the key the caller must register.
   *
   * `contentLengthRange` is not expressible in a plain pre-signed PUT — only a
   * POST policy carries one — so the size ceiling is enforced when the row is
   * registered, by reading the object's actual length with {@link objectSize}.
   * Trusting a client-declared size would be trusting the client.
   */
  async createUploadUrl(
    bucket: StorageBucket,
    ownerId: string,
    contentType: string,
  ): Promise<SignedUpload> {
    const env = loadEnv();
    const storageKey = buildKey(ownerId);

    const url = await getSignedUrl(
      this.signer,
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: storageKey,
        ContentType: contentType,
      }),
      { expiresIn: env.S3_SIGNED_URL_TTL_SECONDS },
    );

    return { url, storageKey, expiresInSeconds: env.S3_SIGNED_URL_TTL_SECONDS };
  }

  /** A short-lived pre-signed GET. FR-030. */
  async createDownloadUrl(
    bucket: StorageBucket,
    storageKey: string,
    /** Makes a browser save the object under this name instead of showing it (the data export). */
    downloadName?: string,
  ): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: storageKey,
        ...(downloadName && {
          ResponseContentDisposition: `attachment; filename="${downloadName}"`,
        }),
      }),
      { expiresIn: loadEnv().S3_SIGNED_URL_TTL_SECONDS },
    );
  }

  /**
   * Writes bytes the API holds — a sealed document, or a thumbnail the media
   * worker made. A failed write throws: the caller must not record a row for
   * an object that is not there.
   */
  async putObject(
    bucket: StorageBucket,
    storageKey: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: storageKey,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /**
   * Writes a file from disk: the data export's archive, which can be hundreds of megabytes and is
   * streamed rather than read into memory. A failed write throws.
   */
  async putObjectFromFile(
    bucket: StorageBucket,
    storageKey: string,
    path: string,
    contentType: string,
  ): Promise<void> {
    const { size } = await stat(path);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: storageKey,
        Body: createReadStream(path),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
  }

  /**
   * The object's bytes, or null when it is not there. Any other failure —
   * the store unreachable, a refused credential — throws rather than reading
   * as "absent", which would turn an outage into missing data.
   */
  async getObject(bucket: StorageBucket, storageKey: string): Promise<Buffer | null> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: storageKey }),
      );
      return object.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /**
   * The stored object's byte length, or null if it is not there.
   *
   * Registration calls this to confirm the bytes actually landed before marking a
   * row `uploaded` (sync-protocol.md §4) and to check the size limit against what
   * was really written rather than what was claimed.
   */
  async objectSize(bucket: StorageBucket, storageKey: string): Promise<number | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName(bucket), Key: storageKey }),
      );

      return head.ContentLength ?? null;
    } catch {
      // Absent, or unreadable — the caller treats both as "the upload did not
      // complete", which is the only actionable distinction.
      return null;
    }
  }

  /**
   * Removes an object. Used by the storage sweep (T188) after tombstone
   * retention elapses, and by `DELETE /me` (FR-006).
   *
   * Deliberately does not throw on a missing object: the sweep is idempotent by
   * design and re-running it must not fail on work it already did.
   */
  async deleteObject(bucket: StorageBucket, storageKey: string): Promise<void> {
    try {
      await this.removeObject(bucket, storageKey);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not delete ${bucket}/${storageKey}; the sweep will retry it. ${String(error)}`,
      );
    }
  }

  /**
   * Removes an object and **throws if it cannot say it is gone**.
   *
   * {@link deleteObject} is best-effort: it logs a failure and returns, which
   * suits clean-up after a request that has already decided its outcome. It is
   * the wrong contract for a caller about to destroy the only record of where
   * the object was — the tombstone purge removes a row *after* its bytes, and
   * a refused or unreachable delete that looked like success would take the key
   * with it and leave the bytes in a private bucket for good (Constitution V,
   * tasks.md T129). An object that is already absent is success: a retry after
   * a partial run must not fail on the work it already did.
   */
  async removeObject(bucket: StorageBucket, storageKey: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: storageKey }),
      );
    } catch (error: unknown) {
      if (isNotFound(error)) return;
      throw error;
    }
  }

  /**
   * Every key under `prefix`, following the listing's pages to the end.
   *
   * The account-deletion sweep lists `<ownerId>/` (buildKey's prefix) so that an object
   * no row points at any more cannot outlive its traveller, and lists it again to prove
   * nothing is left. Unlike {@link objectSize} it does not swallow a failure: a store
   * that cannot be listed throws, because "I could not look" is not "there is nothing".
   */
  async listObjects(bucket: StorageBucket, prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName(bucket),
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key !== undefined) keys.push(object.Key);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return keys;
  }

  private bucketName(bucket: StorageBucket): string {
    const env = loadEnv();
    return bucket === 'photos' ? env.S3_BUCKET_PHOTOS : env.S3_BUCKET_DOCUMENTS;
  }
}

function createClient(endpoint: string): S3Client {
  const env = loadEnv();

  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    // RustFS in development and R2 in production both address buckets by path
    // rather than by DNS subdomain (research D-12, D-31). Virtual-hosted style
    // would resolve `bucket.localhost` in development, which does not exist.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

/** `NoSuchKey` from GetObject, `NotFound` from HeadObject, or a bare 404. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { name, $metadata } = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return name === 'NoSuchKey' || name === 'NotFound' || $metadata?.httpStatusCode === 404;
}

/**
 * `<ownerId>/<uuid>` — server-generated, always.
 *
 * The owner prefix is for operability, not for security: it makes a per-traveller
 * sweep or export a prefix listing rather than a full scan. The security comes
 * from the uuid, which is unguessable, and from the bucket being private — a key
 * that someone guesses is still useless without a signature.
 */
export function buildKey(ownerId: string): string {
  return `${ownerId}/${randomUUID()}`;
}
