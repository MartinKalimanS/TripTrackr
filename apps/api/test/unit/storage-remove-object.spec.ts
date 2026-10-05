import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { resetEnvCache } from '@/common/config/env.schema';
import { StorageService } from '@/common/storage/storage.service';

import { applyUnitTestEnv } from '../support/env';

/**
 * `StorageService.removeObject` — the delete that tells the truth (tasks.md
 * T129; Constitution V).
 *
 * `deleteObject` is best-effort by design: it logs a failure and returns, so a
 * request that has already decided to fail is not failed a second time by the
 * clean-up. That is the wrong contract for a caller whose next step is to
 * destroy the only record of where the object was. The tombstone purge deletes a
 * row *after* its bytes, and if a refused or unreachable delete looked like
 * success the row — and with it the key — would go while the bytes stayed,
 * leaving an object in a private bucket that nothing will ever remove.
 * `removeObject` therefore throws on every failure except the one that means
 * "already gone", which is success for an idempotent retry.
 */
describe('StorageService.removeObject', () => {
  let service: StorageService;
  let send: jest.SpiedFunction<S3Client['send']>;

  beforeEach(() => {
    applyUnitTestEnv();
    send = jest.spyOn(S3Client.prototype, 'send');
    service = new StorageService();
  });

  afterEach(() => send.mockRestore());
  afterAll(() => resetEnvCache());

  it('deletes the object from the named bucket', async () => {
    send.mockResolvedValueOnce({} as never);

    await service.removeObject('documents', 'owner-1/abc');

    const command = send.mock.calls[0]?.[0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({ Bucket: 'documents', Key: 'owner-1/abc' });
  });

  it('reads an object that is already gone as done, so a retry is harmless', async () => {
    const gone = Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    send.mockRejectedValueOnce(gone as never);

    await expect(service.removeObject('photos', 'owner-1/gone')).resolves.toBeUndefined();
  });

  it.each([
    [
      'a refused credential',
      Object.assign(new Error('denied'), { name: 'AccessDenied' }),
    ],
    [
      'an unreachable store',
      Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }),
    ],
    [
      'a server error',
      Object.assign(new Error('slow down'), {
        name: 'SlowDown',
        $metadata: { httpStatusCode: 503 },
      }),
    ],
    ['a non-error rejection', 'boom'],
  ])(
    'throws on %s — never reports success it cannot vouch for',
    async (_label, error) => {
      send.mockRejectedValueOnce(error as never);

      await expect(service.removeObject('photos', 'owner-1/x')).rejects.toBe(error);
    },
  );
});
