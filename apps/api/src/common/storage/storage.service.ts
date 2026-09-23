import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

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
 * Bytes never pass through the API. A photo or document is uploaded by the device
 * straight to the object store with a pre-signed PUT, and read back with a
 * short-lived pre-signed GET. That keeps a 12 MB upload from occupying a request
 * handler for its whole duration (SC-003), and it is why the buckets can stay
 * private with no public read policy whatsoever — the signature *is* the read
 * path, so revoking access is a matter of not signing rather than of editing a
 * bucket policy.
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
  private readonly client: S3Client;

  constructor() {
    const env = loadEnv();

    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      // MinIO in development and R2 in production both address buckets by path
      // rather than by DNS subdomain (research D-12). Virtual-hosted style would
      // resolve `bucket.localhost` in development, which does not exist.
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
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
      this.client,
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
  async createDownloadUrl(bucket: StorageBucket, storageKey: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: storageKey }),
      { expiresIn: loadEnv().S3_SIGNED_URL_TTL_SECONDS },
    );
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
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName(bucket), Key: storageKey }),
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Could not delete ${bucket}/${storageKey}; the sweep will retry it. ${String(error)}`,
      );
    }
  }

  private bucketName(bucket: StorageBucket): string {
    const env = loadEnv();
    return bucket === 'photos' ? env.S3_BUCKET_PHOTOS : env.S3_BUCKET_DOCUMENTS;
  }
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
