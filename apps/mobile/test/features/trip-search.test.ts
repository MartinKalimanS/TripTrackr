/**
 * Searching trips by name on the device (spec 015, T1506, FR-010).
 */
import type { TripCardModel } from '@/features/trips/trip-card-model';
import { searchTrips } from '@/features/trips/trip-search';

const card = (id: string, title: string) => ({ id, title }) as TripCardModel;
const cards = [
  card('a', 'Portugal Road Trip'),
  card('b', 'Iceland Ring Road'),
  card('c', 'Tokyo & Kyoto'),
  card('d', 'Città del Messico'),
];

describe('searchTrips', () => {
  test('an empty or blank query keeps every trip, in order', () => {
    expect(searchTrips(cards, '')).toBe(cards);
    expect(searchTrips(cards, '   ')).toBe(cards);
  });

  test('matches any part of the name, ignoring case', () => {
    expect(searchTrips(cards, 'road').map((c) => c.id)).toEqual(['a', 'b']);
    expect(searchTrips(cards, 'KYO').map((c) => c.id)).toEqual(['c']);
  });

  test('ignores accents on either side', () => {
    expect(searchTrips(cards, 'citta').map((c) => c.id)).toEqual(['d']);
    expect(searchTrips(cards, 'Ícéland').map((c) => c.id)).toEqual(['b']);
  });

  test('every word must match, in any order', () => {
    expect(searchTrips(cards, 'trip portugal').map((c) => c.id)).toEqual(['a']);
    expect(searchTrips(cards, 'road tokyo')).toEqual([]);
  });
});
