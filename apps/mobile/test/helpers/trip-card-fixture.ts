/**
 * A trip card model for a test (feature 005, T540): the Portugal trip of the prototype, active
 * on day 3 of 8, with whatever a test overrides. Not a test file.
 */
import type { TripCardModel } from '@/features/trips/trip-card-model';
import type { TripStatus } from '@/features/trips/trip-status';

export function cardModel(overrides: Partial<TripCardModel> = {}): TripCardModel {
  const id = overrides.id ?? 't1';
  const title = overrides.title ?? 'Portugal Road Trip';
  const status: TripStatus = overrides.status ?? 'active';
  return {
    id,
    title,
    trip: {
      id,
      title,
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status,
      created_at: '2026-06-01T10:00:00.000Z',
      updated_at: '2026-06-01T10:00:00.000Z',
      deleted_at: null,
      is_dirty: false,
      synced_at: '2026-06-01T10:00:00.000Z',
    },
    stopCount: 3,
    status,
    cover: { kind: 'typographic', initial: 'P', status },
    generated: { palette: 1, iso2: 'PT', initial: title },
    dateRange: { start: '2026-10-12', end: '2026-10-19' },
    lengthDays: 8,
    country: { iso2: 'PT', name: 'Portugal' },
    dayOf: status === 'active' ? { day: 3, of: 8 } : null,
    daysToGo: null,
    strip: ['done', 'now', 'next'],
    stripLabels: ['LIS', 'SIN', 'POR'],
    distanceKm: 293,
    pending: false,
    ...overrides,
  };
}

/** A card with a photograph for a cover. */
export function withPhoto(
  overrides: Partial<TripCardModel> = {},
  photo = { photoId: 'photo-1', thumbnailUri: 'file:///photos/t1/photo-1.thumb.jpg' },
): TripCardModel {
  return cardModel({ ...overrides, cover: { kind: 'photo', ...photo } });
}
