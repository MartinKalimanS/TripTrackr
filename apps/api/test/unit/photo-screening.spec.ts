import { randomUUID } from 'node:crypto';

import { FailClosedPhotoScreening, type PhotoScreening } from '@/workers/photo-screening';

import { jpeg } from '../support/images';

/**
 * The screening port's only implementation (FR-056, SC-014; research D-34;
 * tasks.md T113).
 *
 * Until User Story 7 chooses a provider, nothing may approve a photo — so the
 * implementation must answer `pending` for every photo, whatever it is shown.
 * `pending` is the closed state: the `photos_public_read` policy (0005) keeps
 * the photo unreachable to anyone but its owner. It must not answer `rejected`
 * either — it has no opinion, and a rejection would be a claim about content
 * nobody looked at.
 */
describe('FailClosedPhotoScreening', () => {
  const screening: PhotoScreening = new FailClosedPhotoScreening();

  it('answers pending for a real photo — it never approves', async () => {
    const verdict = await screening.screen({
      photoId: randomUUID(),
      image: await jpeg({ width: 512, height: 384 }),
      contentType: 'image/jpeg',
    });

    expect(verdict).toBe('pending');
  });

  it('answers pending for anything at all, bytes it cannot read included', async () => {
    const verdicts = await Promise.all(
      [Buffer.alloc(0), Buffer.from('not an image'), Buffer.alloc(64, 0xff)].map(
        (image) =>
          screening.screen({ photoId: randomUUID(), image, contentType: 'image/jpeg' }),
      ),
    );

    expect(verdicts).toEqual(['pending', 'pending', 'pending']);
  });
});
