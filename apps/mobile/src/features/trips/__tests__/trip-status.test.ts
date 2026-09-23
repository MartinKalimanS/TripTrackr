/**
 * FR-013 — lifecycle status derived from the stops, never user-set.
 *
 * The same rule the server applies (T061), so the pill a traveller sees while
 * offline matches what the server will say once they reconnect.
 */
import { STATUS_PRESENTATION, deriveTripStatus } from '@/features/trips/trip-status';

const stop = (arrive: string, depart: string) => ({
  arrive_date: arrive,
  depart_date: depart,
});

describe('deriveTripStatus', () => {
  test('a trip with no stops is being planned', () => {
    expect(deriveTripStatus([], '2026-05-01')).toBe('planning');
  });

  test('before the first arrival the trip is planning (Acceptance Scenario 1.3)', () => {
    expect(deriveTripStatus([stop('2026-05-10', '2026-05-12')], '2026-05-09')).toBe(
      'planning',
    );
  });

  test('on the first arrival day the trip is active (Acceptance Scenario 1.7)', () => {
    expect(deriveTripStatus([stop('2026-05-10', '2026-05-12')], '2026-05-10')).toBe(
      'active',
    );
  });

  test('on the last departure day the trip is still active', () => {
    expect(deriveTripStatus([stop('2026-05-10', '2026-05-12')], '2026-05-12')).toBe(
      'active',
    );
  });

  test('after the last departure the trip is past', () => {
    expect(deriveTripStatus([stop('2026-05-10', '2026-05-12')], '2026-05-13')).toBe(
      'past',
    );
  });

  test('uses the earliest arrival and latest departure regardless of stop order or overlap', () => {
    const stops = [
      stop('2026-05-15', '2026-05-18'),
      stop('2026-05-10', '2026-05-16'),
      stop('2026-05-12', '2026-05-13'),
    ];
    expect(deriveTripStatus(stops, '2026-05-09')).toBe('planning');
    expect(deriveTripStatus(stops, '2026-05-17')).toBe('active');
    expect(deriveTripStatus(stops, '2026-05-19')).toBe('past');
  });

  test('defaults to the device’s calendar day when none is given', () => {
    expect(['planning', 'active', 'past']).toContain(
      deriveTripStatus([stop('2000-01-01', '2000-01-02')]),
    );
    expect(deriveTripStatus([stop('2000-01-01', '2000-01-02')])).toBe('past');
  });
});

describe('STATUS_PRESENTATION (FR-010: never hue alone)', () => {
  test.each(['planning', 'active', 'past'] as const)(
    '%s has a label and an icon',
    (status) => {
      expect(STATUS_PRESENTATION[status].label.length).toBeGreaterThan(0);
      expect(STATUS_PRESENTATION[status].icon.length).toBeGreaterThan(0);
    },
  );
});
