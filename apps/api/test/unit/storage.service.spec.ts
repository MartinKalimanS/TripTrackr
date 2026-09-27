import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { resetEnvCache } from '@/common/config/env.schema';
import { StorageService, buildKey } from '@/common/storage/storage.service';

import { applyUnitTestEnv } from '../support/env';

/**
 * The object-storage seam (T034; FR-030, FR-041; sync-protocol.md §4).
 *
 * The properties that matter are the ones a leaked link or a lying client
 * would test: keys are server-generated under the owner's prefix, signed URLs
 * carry the configured short TTL and point at the right private bucket in
 * path style, the object's real size is what registration reads, and a
 * delete of something already gone is not an error. Pre-signing is local
 * arithmetic over the configured credentials, so it runs for real; only the
 * round trips (`send`) are stubbed.
 */
describe('StorageService', () => {
  let service: StorageService;
  let send: jest.SpiedFunction<S3Client['send']>;

  beforeEach(() => {
    applyUnitTestEnv({ S3_SIGNED_URL_TTL_SECONDS: '120' });
    send = jest.spyOn(S3Client.prototype, 'send');
    service = new StorageService();
  });

  afterEach(() => send.mockRestore());
  afterAll(() => resetEnvCache());

  it('buildKey puts the object under the owner’s prefix with an unguessable name', () => {
    const key = buildKey('11111111-1111-4111-8111-111111111111');
    expect(key).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}$/);
    expect(buildKey('x')).not.toBe(buildKey('x'));
  });

  it('createUploadUrl signs a PUT to the photos bucket, path-style, for a server-generated key, with the short TTL', async () => {
    const upload = await service.createUploadUrl('photos', 'owner-1', 'image/jpeg');

    expect(upload.storageKey).toMatch(/^owner-1\//);
    expect(upload.expiresInSeconds).toBe(120);
    const url = new URL(upload.url);
    expect(url.origin).toBe('http://localhost:9000');
    expect(url.pathname).toBe(`/photos/${upload.storageKey}`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
    // No round trip: a pre-signed URL is computed, never fetched.
    expect(send).not.toHaveBeenCalled();
  });

  it('createDownloadUrl signs a GET on the documents bucket', async () => {
    const url = new URL(await service.createDownloadUrl('documents', 'owner-1/abc'));

    expect(url.pathname).toBe('/documents/owner-1/abc');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('120');
  });

  it('objectSize reads the real length, and null when the object is not there', async () => {
    send.mockResolvedValueOnce({ ContentLength: 4_096 } as never);
    expect(await service.objectSize('photos', 'owner-1/abc')).toBe(4_096);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);

    send.mockRejectedValueOnce(new Error('NotFound') as never);
    expect(await service.objectSize('photos', 'owner-1/missing')).toBeNull();

    send.mockResolvedValueOnce({} as never);
    expect(await service.objectSize('photos', 'owner-1/empty')).toBeNull();
  });

  it('deleteObject issues the delete and does not throw when the object is already gone', async () => {
    send.mockResolvedValueOnce({} as never);
    await service.deleteObject('documents', 'owner-1/abc');
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);

    send.mockRejectedValueOnce(new Error('NoSuchKey') as never);
    await expect(
      service.deleteObject('documents', 'owner-1/gone'),
    ).resolves.toBeUndefined();
  });
});
