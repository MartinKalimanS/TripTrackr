import type { NestExpressApplication } from '@nestjs/platform-express';
import { PhotoOriginalResponse, PhotoResponse } from '@triptrackr/contracts';
import request from 'supertest';

import {
  bearer,
  bootTestApp,
  registerTraveller,
  type RegisteredTraveller,
} from '../support/app';
import { createTripFor } from '../support/expenses';
import { registerPhoto } from '../support/photos';
import { createHarness, type Harness } from '../integration/harness';

/**
 * Contract test 8 — `PATCH /photos/:id` to public while moderation is pending
 * succeeds, and the photo stays publicly unreachable (rest-api.md §5;
 * FR-056) — tasks.md T107.
 *
 * Two halves of one obligation, and the point is that they are separate. The
 * endpoint does NOT gate the toggle: gating there would put the guarantee in
 * application code, where Constitution I says it must not solely live. The
 * guarantee is the RLS predicate on `photos_public_read` (0005), which
 * requires `moderation_state = 'approved'` whatever the owner chose. So:
 *
 *   1. the PATCH is accepted and the answer says plainly that the photo is
 *      still pending — the traveller is not misled about who can see it;
 *   2. a stranger cannot reach the photo by the API or at the database, on
 *      the case where a leak is most plausible: the photo public, on a public
 *      trip, with nothing but its moderation state standing in the way.
 *
 * The last block is what gives "unreachable" its meaning. It moves ONLY the
 * moderation state, through the owner connection standing in for the screener
 * that does not exist until User Story 7 (research D-34), and watches the
 * stranger's answer change with it: pending and rejected are refused,
 * approved is read. A gate that refused everything would pass the first two
 * blocks and fail that one.
 */
describe('contract 8 — a public toggle while pending is accepted, and changes nothing anyone else can reach', () => {
  let app: NestExpressApplication;
  let harness: Harness;
  let a: RegisteredTraveller;
  let b: RegisteredTraveller;
  let tripId: string;
  let photoId: string;
  let storageKey: string;

  beforeAll(async () => {
    app = await bootTestApp();
    harness = await createHarness();
    a = await registerTraveller(app);
    b = await registerTraveller(app);
    tripId = await createTripFor(app, a, 'CHF', 'A’s public trip');

    // Public, so that B can reach the trip and the photo's own state is the
    // only thing left between B and the bytes.
    const published = await server()
      .patch(`/v1/trips/${tripId}`)
      .set(asA())
      .send({ is_public: true });
    if (published.status !== 200) throw new Error('The trip fixture was not published.');

    const registered = await registerPhoto(app, a, tripId);
    photoId = registered.photo.id;
    storageKey = registered.storageKey;
  });

  afterAll(async () => {
    await harness?.close();
    await app?.close();
  });

  const server = () => request(app.getHttpServer());
  const asA = () => bearer(a.tokens.access_token);
  const asB = () => bearer(b.tokens.access_token);
  const ghost = '00000000-0000-4000-8000-00000000dead';

  const bReadsOriginal = () => server().get(`/v1/photos/${photoId}/original`).set(asB());
  const bReadsRow = () =>
    harness.asUser(
      b.tokens.user.id,
      (tx) => tx<{ id: string }[]>`SELECT id FROM photos WHERE id = ${photoId}::uuid`,
    );

  it('accepts is_public = true while the photo is pending, and says it is still pending', async () => {
    const response = await server()
      .patch(`/v1/photos/${photoId}`)
      .set(asA())
      .send({ is_public: true });

    expect(response.status).toBe(200);
    expect(PhotoResponse.parse(response.body).photo).toMatchObject({
      id: photoId,
      is_public: true,
      moderation_state: 'pending',
      upload_state: 'uploaded',
    });
  });

  it('leaves the photo unreachable to a stranger over HTTP, indistinguishably from a photo that does not exist', async () => {
    const theirs = await bReadsOriginal();
    const nothing = await server().get(`/v1/photos/${ghost}/original`).set(asB());

    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(nothing.body);
    expect(theirs.body).toMatchObject({ error: { code: 'PHOTO_NOT_FOUND' } });
  });

  it('leaves the row unreachable to a stranger at the database, on a trip the stranger can read', async () => {
    const trip = await harness.asUser(
      b.tokens.user.id,
      (tx) => tx`SELECT id FROM trips WHERE id = ${tripId}::uuid`,
    );
    const byId = await bReadsRow();
    const byTrip = await harness.asUser(
      b.tokens.user.id,
      (tx) => tx`SELECT id FROM photos WHERE trip_id = ${tripId}::uuid`,
    );

    // The trip is public and B reads it: the emptiness below is the photo
    // policy's moderation predicate, not the trip's.
    expect(trip).toHaveLength(1);
    expect(byId).toHaveLength(0);
    expect(byTrip).toHaveLength(0);
  });

  it('keeps the photo the owner’s own: A reads the row and is signed the original', async () => {
    const row = await harness.asUser(
      a.tokens.user.id,
      (tx) => tx<{ is_public: boolean; moderation_state: string }[]>`
        SELECT is_public, moderation_state FROM photos WHERE id = ${photoId}::uuid
      `,
    );
    const original = await server().get(`/v1/photos/${photoId}/original`).set(asA());

    expect(row).toEqual([{ is_public: true, moderation_state: 'pending' }]);
    expect(original.status).toBe(200);
    expect(PhotoOriginalResponse.parse(original.body).url).toContain(storageKey);
  });

  describe('the gate is the moderation state and nothing else', () => {
    it.each([
      ['pending', 'cannot reach', false],
      ['rejected', 'cannot reach', false],
      ['approved', 'can read', true],
    ] as const)(
      'with moderation_state = %s a stranger %s the public photo',
      async (state, _verb, reachable) => {
        await harness.owner`
          UPDATE photos SET moderation_state = ${state} WHERE id = ${photoId}::uuid
        `;

        const http = await bReadsOriginal();
        const rows = await bReadsRow();

        expect(rows).toHaveLength(reachable ? 1 : 0);
        expect(http.status).toBe(reachable ? 200 : 404);
        if (reachable) {
          expect(PhotoOriginalResponse.parse(http.body).url).toContain(storageKey);
        }
      },
    );

    it('and an approved photo the owner takes back to private is unreachable again', async () => {
      const retracted = await server()
        .patch(`/v1/photos/${photoId}`)
        .set(asA())
        .send({ is_public: false });

      expect(retracted.status).toBe(200);
      expect((await bReadsOriginal()).status).toBe(404);
      expect(await bReadsRow()).toHaveLength(0);
    });
  });
});
