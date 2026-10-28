/**
 * T558 - which stamps come down, and in what order (feature 005; FR-061; research D5-14,
 * D5-17; data-model section 11): a stamp earned in the last seven days lands ONCE per session,
 * and several landing together come one after another, newest first, so that each thud is felt
 * on its own instead of one buzz for all of them.
 */
import type { PassportStamp } from '@/features/passport/stamp-spec';

import {
  LANDING_STAGGER_MS,
  hasLanded,
  landingSlots,
  markLanded,
  resetLanded,
} from '../stamp-landing';

beforeEach(() => resetLanded());

function stamp(iso2: string, firstVisit: string, recent: boolean): PassportStamp {
  return {
    key: iso2,
    iso2,
    name: iso2,
    firstVisit,
    recent,
    label: `Stamp: ${iso2}`,
    spec: {} as PassportStamp['spec'],
  };
}

const LIST = [
  stamp('IT', '2026-10-13', true),
  stamp('PT', '2026-10-12', true),
  stamp('FR', '2026-10-10', true),
  stamp('JP', '2026-03-03', false),
];

describe('landingSlots', () => {
  test('gives the stamps earned this week a slot each, in the order given (newest first)', () => {
    const slots = landingSlots(LIST);
    expect([...slots.entries()]).toEqual([
      ['IT', 0],
      ['PT', 1],
      ['FR', 2],
    ]);
  });

  test('leaves out a stamp that is not recent', () => {
    expect(landingSlots(LIST).has('JP')).toBe(false);
  });

  test('leaves out a stamp that has landed this session, and closes the gap', () => {
    markLanded('IT', '2026-10-13');
    expect([...landingSlots(LIST).entries()]).toEqual([
      ['PT', 0],
      ['FR', 1],
    ]);
  });

  test('is empty once every recent stamp has landed: once per session', () => {
    for (const item of LIST) if (item.recent) markLanded(item.iso2, item.firstVisit);
    expect(landingSlots(LIST).size).toBe(0);
  });

  test('is a pure read: asking does not mark anything as landed', () => {
    landingSlots(LIST);
    expect(hasLanded('IT', '2026-10-13')).toBe(false);
    expect(landingSlots(LIST).size).toBe(3);
  });

  test('a new session (resetLanded) lands them again', () => {
    markLanded('IT', '2026-10-13');
    resetLanded();
    expect(landingSlots(LIST).get('IT')).toBe(0);
  });

  test('is empty for a passport with no stamp', () => {
    expect(landingSlots([]).size).toBe(0);
  });
});

describe('LANDING_STAGGER_MS', () => {
  test('is long enough for two thuds to be felt apart, short enough to be one moment', () => {
    expect(LANDING_STAGGER_MS).toBeGreaterThanOrEqual(100);
    expect(LANDING_STAGGER_MS).toBeLessThanOrEqual(200);
  });
});
