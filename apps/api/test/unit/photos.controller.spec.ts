import { HttpStatus } from '@nestjs/common';
import { RegisterPhotoRequest, type Photo } from '@triptrackr/contracts';
import type { Response } from 'express';

import { resetEnvCache } from '@/common/config/env.schema';
import { ResponseContractViolation } from '@/common/validation/respond';
import {
  PhotosController,
  TripPhotosController,
} from '@/modules/photos/photos.controller';
import type { PhotosService } from '@/modules/photos/photos.service';

import { applyUnitTestEnv } from '../support/env';

/**
 * The photo routes' own decisions (rest-api.md §5; tasks.md T112): which status
 * a registration answers with, and that every body leaves through its
 * contract. Everything else is the service's, and is pinned there.
 *
 * A registration is 201 when it stored a photo and 200 when a retry by client
 * id found the photo already stored (research D-15) — the device can tell a
 * first write from a replay without comparing bodies.
 */
const TRIP_ID = '22222222-2222-4222-8222-222222222222';
const PHOTO_ID = '55555555-5555-4555-8555-555555555555';
const KEY = '11111111-1111-4111-8111-111111111111/77777777-7777-4777-8777-777777777777';

const photo: Photo = {
  id: PHOTO_ID,
  created_at: '2026-06-02T08:00:00.000Z',
  updated_at: '2026-06-02T08:00:00.000Z',
  trip_id: TRIP_ID,
  city_id: null,
  taken_at: null,
  exif_lat: null,
  exif_lng: null,
  is_public: false,
  upload_state: 'uploaded',
  moderation_state: 'pending',
  has_thumbnail: false,
  thumbnail_url: null,
};

function stubService() {
  return {
    createUploadUrl: jest.fn(() =>
      Promise.resolve({
        upload_url: 'https://store.example.test/put',
        storage_key: KEY,
        expires_in_seconds: 300,
      }),
    ),
    register: jest.fn(() => Promise.resolve({ photo, created: true })),
    list: jest.fn(() => Promise.resolve([photo])),
    original: jest.fn(() =>
      Promise.resolve({ url: 'https://store.example.test/get', expires_in_seconds: 300 }),
    ),
    patch: jest.fn(() => Promise.resolve({ ...photo, is_public: true })),
    remove: jest.fn(() => Promise.resolve()),
  };
}

function fakeResponse() {
  const status = jest.fn();
  return { status, response: { status } as unknown as Response };
}

const body = RegisterPhotoRequest.parse({ storage_key: KEY });

// respond() reads NODE_ENV when a body breaks its contract.
beforeAll(() => applyUnitTestEnv());
afterAll(() => resetEnvCache());

describe('TripPhotosController', () => {
  it('leaves a first registration at the route’s 201', async () => {
    const service = stubService();
    const { status, response } = fakeResponse();

    const answer = await new TripPhotosController(
      service as unknown as PhotosService,
    ).register(TRIP_ID, body, response);

    expect(answer).toEqual({ photo });
    expect(status).not.toHaveBeenCalled();
  });

  it('answers a replayed registration with 200', async () => {
    const service = stubService();
    service.register.mockResolvedValueOnce({ photo, created: false });
    const { status, response } = fakeResponse();

    const answer = await new TripPhotosController(
      service as unknown as PhotosService,
    ).register(TRIP_ID, body, response);

    expect(answer).toEqual({ photo });
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('serves the upload URL and the list through their contracts', async () => {
    const service = stubService();
    const controller = new TripPhotosController(service as unknown as PhotosService);

    await expect(
      controller.createUploadUrl(TRIP_ID, { content_type: 'image/jpeg' }),
    ).resolves.toMatchObject({ storage_key: KEY });
    await expect(controller.list(TRIP_ID)).resolves.toEqual({ photos: [photo] });

    // A serialiser that leaked the storage key into a photo fails the contract.
    service.list.mockResolvedValueOnce([{ ...photo, storage_key: KEY } as Photo]);
    await expect(controller.list(TRIP_ID)).rejects.toBeInstanceOf(
      ResponseContractViolation,
    );
  });
});

describe('PhotosController', () => {
  it('serves the original, the patch and the delete through the service', async () => {
    const service = stubService();
    const controller = new PhotosController(service as unknown as PhotosService);

    await expect(controller.original(PHOTO_ID)).resolves.toEqual({
      url: 'https://store.example.test/get',
      expires_in_seconds: 300,
    });
    await expect(controller.patch(PHOTO_ID, { is_public: true })).resolves.toEqual({
      photo: { ...photo, is_public: true },
    });
    await expect(controller.remove(PHOTO_ID)).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(PHOTO_ID);
  });
});
