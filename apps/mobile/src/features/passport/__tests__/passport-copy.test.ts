/**
 * F13 - the words of the You screen (feature 005; FR-058): "Traveller since", the period
 * labels, the card's heading and lap line, the stamps count and the recap entry.
 */
import {
  lapText,
  mrzLine,
  passportHeading,
  passportName,
  periodLabel,
  recapTitle,
  stampsCount,
  travellerSince,
} from '../passport-copy';

describe('travellerSince', () => {
  test('is the year of the account creation date', () => {
    expect(travellerSince('2021-06-15T10:00:00.000Z')).toBe('Traveller since 2021');
  });

  test('says nothing when the session has no date, or one that cannot be read', () => {
    expect(travellerSince(undefined)).toBeNull();
    expect(travellerSince(null)).toBeNull();
    expect(travellerSince('')).toBeNull();
    expect(travellerSince('not a date')).toBeNull();
  });
});

describe('periods and headings', () => {
  test('labels', () => {
    expect(periodLabel('all')).toBe('All time');
    expect(periodLabel('2026')).toBe('2026');
    expect(passportHeading('all')).toBe('Passport \u00b7 all time');
    expect(passportHeading('2026')).toBe('Passport \u00b7 2026');
    expect(passportName('all')).toBe('Passport, all time');
    expect(passportName('2025')).toBe('Passport, 2025');
  });

  test('the stamps count is "N of 195", grouped for the language', () => {
    expect(stampsCount(14, 'en-US')).toBe('14 of 195');
    expect(stampsCount(0, 'en-US')).toBe('0 of 195');
  });

  test('the recap names the year in view, this year for All time', () => {
    expect(recapTitle('all', 2026)).toBe('Your 2026 in 7 slides');
    expect(recapTitle('2025', 2026)).toBe('Your 2025 in 7 slides');
  });
});

describe('lapText', () => {
  test('is the real lap to one decimal, in the device language', () => {
    expect(lapText(1.5333, 'en-US')).toBe('1.5\u00d7 around the Earth');
    expect(lapText(0.46, 'de-DE')).toBe('0,5\u00d7 around the Earth');
  });

  test('claims nothing for no distance, and never rounds a trip to a lap it did not make', () => {
    expect(lapText(0, 'en-US')).toBeNull();
    expect(lapText(Number.NaN, 'en-US')).toBeNull();
    expect(lapText(0.02, 'en-US')).toBe('Under 0.1\u00d7 around the Earth');
  });
});

describe('mrzLine - the machine-readable strip of the card (decorative, from the name)', () => {
  test('is P<TRIPTRACKR<< then the name in capitals, padded with fillers to 44 characters', () => {
    const line = mrzLine('Marta');
    expect(line.startsWith('P<TRIPTRACKR<<MARTA<')).toBe(true);
    expect(line).toHaveLength(44);
    expect(line).toMatch(/^[A-Z<]+$/);
  });

  test('folds accents, turns spaces into fillers and drops what is not a letter', () => {
    expect(mrzLine('Zoë O’Neil-3').startsWith('P<TRIPTRACKR<<ZOE<ONEIL<')).toBe(true);
    expect(mrzLine('Åsa  Lind')).toMatch(/^P<TRIPTRACKR<<ASA<LIND</);
  });

  test('a name with no Latin letter is only fillers, and a long name is cut to 44', () => {
    expect(mrzLine('张伟')).toBe('P<TRIPTRACKR<<'.padEnd(44, '<'));
    expect(mrzLine('A'.repeat(80))).toHaveLength(44);
  });
});
