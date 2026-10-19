/**
 * Trip card models for the dev gallery (feature 005, T524): the Portugal trip of the
 * prototype in three states. Invented, in memory, never stored or sent; every cover is the
 * generated one (`GeneratedCover`), so no photograph and no network is involved.
 */
import type { TripCardModel } from '@/features/trips/trip-card-model';
import type { TripStatus } from '@/features/trips/trip-status';

/** The same instant for every fixture, so a screenshot does not move. */
const STAMPED = '2026-06-01T10:00:00.000Z';

export function galleryTrip(overrides: Partial<TripCardModel> = {}): TripCardModel {
  const id = overrides.id ?? 'gallery-trip';
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
      created_at: STAMPED,
      updated_at: STAMPED,
      deleted_at: null,
      is_dirty: false,
      synced_at: STAMPED,
    },
    stopCount: 3,
    status,
    cover: { kind: 'typographic', initial: title.charAt(0), status },
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

/** The planned trip: a ticket with a countdown. */
export function galleryPlannedTrip(): TripCardModel {
  return galleryTrip({
    id: 'gallery-planned',
    title: 'Iceland Ring Road',
    status: 'planning',
    dateRange: { start: '2027-01-16', end: '2027-01-20' },
    lengthDays: 5,
    daysToGo: 94,
    dayOf: null,
    strip: ['next'],
    stripLabels: ['REY'],
    country: { iso2: 'IS', name: 'Iceland' },
    generated: { palette: 2, iso2: 'IS', initial: 'Iceland Ring Road' },
    distanceKm: 1332,
  });
}

/** A past trip that still has changes waiting to sync. */
export function galleryPastTrip(pending: boolean): TripCardModel {
  return galleryTrip({
    id: pending ? 'gallery-past-pending' : 'gallery-past',
    title: 'Kyoto in Spring',
    status: 'past',
    dateRange: { start: '2025-03-28', end: '2025-04-05' },
    lengthDays: 9,
    dayOf: null,
    strip: ['done', 'done'],
    stripLabels: ['KIX', 'UKY'],
    country: { iso2: 'JP', name: 'Japan' },
    generated: { palette: 0, iso2: 'JP', initial: 'Kyoto in Spring' },
    distanceKm: 9380,
    pending,
  });
}
