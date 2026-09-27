import {
  CreateTripRequest,
  PatchTripRequest,
  TripPushRecord,
} from '@triptrackr/contracts';

import { deriveTripStatus, todayIsoDate } from '@/modules/trips/trip-status.service';

/**
 * FR-013: every trip has a lifecycle state — planning, active, past — derived
 * from its dates and kept current without user action.
 *
 * Derived means computed on read from the stop date range, never stored as
 * truth (data-model.md §3): the spec's edge case is a trip whose dates pass
 * while the app is closed, and a computed value cannot be stale. This is the
 * pure function every read path calls; the DTOs at the end prove a client
 * cannot supply the value instead.
 */
describe('deriveTripStatus', () => {
  const stop = (arrive: string, depart: string) => ({
    arrive_date: arrive,
    depart_date: depart,
  });

  it('is planning for a trip with no stops yet', () => {
    expect(deriveTripStatus([], '2026-06-01')).toBe('planning');
  });

  it('is planning before the first arrival', () => {
    const stops = [stop('2026-06-10', '2026-06-12'), stop('2026-06-13', '2026-06-15')];

    expect(deriveTripStatus(stops, '2026-06-09')).toBe('planning');
  });

  it('is active from the first arrival to the last departure', () => {
    const stops = [stop('2026-06-10', '2026-06-12'), stop('2026-06-13', '2026-06-15')];

    expect(deriveTripStatus(stops, '2026-06-11')).toBe('active');
    expect(deriveTripStatus(stops, '2026-06-13')).toBe('active');
  });

  it('is past after the last departure', () => {
    const stops = [stop('2026-06-10', '2026-06-12'), stop('2026-06-13', '2026-06-15')];

    expect(deriveTripStatus(stops, '2026-06-16')).toBe('past');
  });

  it('treats the boundary days as travelling — arrival day and departure day are both active', () => {
    const stops = [stop('2026-06-10', '2026-06-15')];

    expect(deriveTripStatus(stops, '2026-06-10')).toBe('active');
    expect(deriveTripStatus(stops, '2026-06-15')).toBe('active');
  });

  it('is active on a gap day between two stops — the trip is under way even when nobody is checked in', () => {
    const stops = [stop('2026-06-10', '2026-06-12'), stop('2026-06-20', '2026-06-22')];

    expect(deriveTripStatus(stops, '2026-06-16')).toBe('active');
  });

  it('uses the earliest arrival and the latest departure, whatever the sort order', () => {
    // Overlapping and out-of-order ranges are legitimate (spec edge cases); the
    // envelope of the trip is the min and the max, not the first and the last.
    const stops = [
      stop('2026-06-20', '2026-06-25'),
      stop('2026-06-01', '2026-06-30'),
      stop('2026-06-05', '2026-06-08'),
    ];

    expect(deriveTripStatus(stops, '2026-05-31')).toBe('planning');
    expect(deriveTripStatus(stops, '2026-06-30')).toBe('active');
    expect(deriveTripStatus(stops, '2026-07-01')).toBe('past');
  });

  it('does not mutate the stops it is handed', () => {
    const stops = [stop('2026-06-20', '2026-06-25'), stop('2026-06-01', '2026-06-03')];
    const before = JSON.stringify(stops);

    deriveTripStatus(stops, '2026-06-10');

    expect(JSON.stringify(stops)).toBe(before);
  });
});

describe('todayIsoDate', () => {
  it('is a calendar date in UTC, the same shape the stop dates use', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayIsoDate()).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('a client cannot supply status', () => {
  it('is refused on create', () => {
    const result = CreateTripRequest.safeParse({
      title: 'Italy, spring',
      home_currency: 'EUR',
      status: 'active',
    });

    expect(result.success).toBe(false);
  });

  it('is refused on patch', () => {
    const result = PatchTripRequest.safeParse({ title: 'Renamed', status: 'past' });

    expect(result.success).toBe(false);
  });

  it('is refused on a sync push, too — the wire format has no slot for it', () => {
    const result = TripPushRecord.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      updated_at: '2026-06-01T00:00:00.000Z',
      deleted: false,
      title: 'Pushed',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'active',
    });

    expect(result.success).toBe(false);
  });
});
