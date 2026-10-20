/**
 * T523 - `stampSpec`, the pure rule behind every passport stamp (feature 005; FR-059, SC-016;
 * data-model section 4; research D5-08).
 *
 * A country and the day of its first visit fix the stamp's shape (of six), ink (of four),
 * tilt (-8 to +8 degrees), wear mask (of four) and whether its outer ring is perforated, on
 * every launch and every device: `h = fnv1a32(ISO2 + '|' + day)`, integer arithmetic only. The
 * golden rows below were computed with an independent implementation of that formula, so a
 * change to the hash or to the bit slicing fails here, not in front of a traveller whose
 * Portugal stamp suddenly changed colour.
 */
import {
  STAMP_INKS,
  STAMP_SHAPES,
  stampDateText,
  stampLabel,
  stampSpec,
  type StampSpec,
} from './stamp-spec';

const GOLDEN: [string, string, Omit<StampSpec, 'top' | 'date'>][] = [
  [
    'PT',
    '2026-10-12',
    {
      iso2: 'PT',
      shape: 'oval',
      ink: 'coral',
      rotationDeg: 2,
      wear: 0,
      perforated: true,
    },
  ],
  [
    'JP',
    '2026-03-03',
    {
      iso2: 'JP',
      shape: 'oct',
      ink: 'navy',
      rotationDeg: -7,
      wear: 2,
      perforated: false,
    },
  ],
  [
    'MX',
    '2025-11-05',
    { iso2: 'MX', shape: 'hex', ink: 'navy', rotationDeg: 5, wear: 2, perforated: true },
  ],
  [
    'ES',
    '2024-04-18',
    {
      iso2: 'ES',
      shape: 'scallop',
      ink: 'coral',
      rotationDeg: 4,
      wear: 0,
      perforated: true,
    },
  ],
  [
    'IT',
    '2023-09-09',
    { iso2: 'IT', shape: 'rect', ink: 'navy', rotationDeg: 7, wear: 3, perforated: true },
  ],
  [
    'IS',
    '2027-01-10',
    {
      iso2: 'IS',
      shape: 'scallop',
      ink: 'teal',
      rotationDeg: 7,
      wear: 1,
      perforated: false,
    },
  ],
  [
    'PT',
    '2025-06-14',
    {
      iso2: 'PT',
      shape: 'oval',
      ink: 'teal',
      rotationDeg: 8,
      wear: 0,
      perforated: true,
    },
  ],
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** `count` distinct country and day pairs, spread over countries, years, months and days. */
function pairs(count: number): [string, string][] {
  return Array.from({ length: count }, (_, index) => {
    const country = LETTERS[index % 26] + LETTERS[(index * 7 + 3) % 26];
    const year = 2010 + (index % 17);
    const month = String(1 + (index % 12)).padStart(2, '0');
    const day = String(1 + ((index * 5) % 28)).padStart(2, '0');
    return [country, `${year}-${month}-${day}`];
  });
}

describe('stampSpec - the same country and day give the same stamp (SC-016)', () => {
  test.each(GOLDEN)('%s on %s is pinned', (country, day, expected) => {
    expect(stampSpec(country, day)).toMatchObject(expected);
  });

  test('240 generated pairs: asking twice, and in another order, answers the same', () => {
    const all = pairs(240);
    expect(new Set(all.map((pair) => pair.join('|'))).size).toBeGreaterThanOrEqual(200);
    const first = all.map(([country, day]) => stampSpec(country, day));
    const reversed = [...all].reverse().map(([country, day]) => stampSpec(country, day));
    expect(reversed.reverse()).toEqual(first);
  });

  test('the country is read in upper case and without stray spaces', () => {
    const expected = stampSpec('PT', '2026-10-12');
    expect(stampSpec('pt', '2026-10-12')).toEqual(expected);
    expect(stampSpec(' Pt ', '2026-10-12')).toEqual(expected);
    expect(expected.iso2).toBe('PT');
  });

  test('the day is the date of the first visit, kept as given for display', () => {
    expect(stampSpec('PT', '2026-10-12').date).toBe('2026-10-12');
  });
});

describe('stampSpec - different countries and days differ', () => {
  const day = '2026-10-12';
  const key = (spec: StampSpec) =>
    [spec.shape, spec.ink, spec.rotationDeg, spec.wear, spec.perforated].join('/');

  test('six well-known countries on one day all look different', () => {
    const keys = ['PT', 'ES', 'JP', 'MX', 'IT', 'IS'].map((code) =>
      key(stampSpec(code, day)),
    );
    expect(new Set(keys).size).toBe(6);
  });

  test('the same country on another day is another stamp', () => {
    expect(key(stampSpec('PT', '2026-10-12'))).not.toBe(
      key(stampSpec('PT', '2025-06-14')),
    );
  });
});

describe('stampSpec - six shapes by four inks, and bounded everywhere else', () => {
  const specs = pairs(1000).map(([country, day]) => stampSpec(country, day));

  test('lists the six shapes and four inks of the contract', () => {
    expect([...STAMP_SHAPES]).toEqual([
      'circle',
      'rect',
      'hex',
      'oct',
      'scallop',
      'oval',
    ]);
    expect([...STAMP_INKS]).toEqual(['coral', 'navy', 'teal', 'green']);
  });

  test('1000 pairs reach all 24 shape and ink combinations', () => {
    const seen = new Set(specs.map((spec) => `${spec.shape}/${spec.ink}`));
    expect(seen.size).toBe(STAMP_SHAPES.length * STAMP_INKS.length);
  });

  test('every shape and every ink is used by a fair share (no bucket is starved)', () => {
    for (const shape of STAMP_SHAPES) {
      expect(specs.filter((spec) => spec.shape === shape).length).toBeGreaterThan(100);
    }
    for (const ink of STAMP_INKS) {
      expect(specs.filter((spec) => spec.ink === ink).length).toBeGreaterThan(150);
    }
  });

  test('the tilt is a whole number of degrees from -8 to 8 and reaches both ends', () => {
    const tilts = new Set(specs.map((spec) => spec.rotationDeg));
    for (const tilt of tilts) {
      expect(Number.isInteger(tilt)).toBe(true);
      expect(tilt).toBeGreaterThanOrEqual(-8);
      expect(tilt).toBeLessThanOrEqual(8);
    }
    expect(tilts.has(-8)).toBe(true);
    expect(tilts.has(8)).toBe(true);
    expect(tilts.size).toBe(17);
  });

  test('the wear mask is one of four and the ring is perforated about half the time', () => {
    expect(new Set(specs.map((spec) => spec.wear))).toEqual(new Set([0, 1, 2, 3]));
    const perforated = specs.filter((spec) => spec.perforated).length;
    expect(perforated).toBeGreaterThan(400);
    expect(perforated).toBeLessThan(600);
  });

  test('no tilt is negative zero: a stamp at rest is not "rotate(-0deg)"', () => {
    for (const spec of specs) expect(Object.is(spec.rotationDeg, -0)).toBe(false);
  });
});

describe('stampSpec - the line of text round the top', () => {
  test('is upper case', () => {
    expect(stampSpec('PT', '2026-10-12', 'Lisboa').top).toBe('LISBOA');
  });

  test('is at most 16 characters, cut on a whole character and trimmed', () => {
    const long = stampSpec('PT', '2026-10-12', 'Santiago de Compostela').top;
    expect(Array.from(long).length).toBeLessThanOrEqual(16);
    expect(long).toBe('SANTIAGO DE COMP');
    expect(stampSpec('PT', '2026-10-12', 'Sao Paulo   Brazil').top).toBe(
      'SAO PAULO   BRAZ',
    );
    expect(stampSpec('PT', '2026-10-12', 'abcdefghijklmno pq').top).toBe(
      'ABCDEFGHIJKLMNO',
    );
    expect(stampSpec('PT', '2026-10-12', '\u{1F30D}'.repeat(20)).top).toBe(
      '\u{1F30D}'.repeat(16),
    );
  });

  test('is ARRIVAL when there is no text', () => {
    expect(stampSpec('PT', '2026-10-12').top).toBe('ARRIVAL');
    expect(stampSpec('PT', '2026-10-12', '   ').top).toBe('ARRIVAL');
  });

  test('is not part of the hash: the same country and day look the same under any text', () => {
    const plain = stampSpec('PT', '2026-10-12');
    const named = stampSpec('PT', '2026-10-12', 'Porto');
    expect({ ...named, top: '' }).toEqual({ ...plain, top: '' });
  });
});

describe('stampDateText - the date on the stamp, in the device language', () => {
  test('is upper case, day month year, in the locale', () => {
    expect(stampDateText('2026-10-12', 'en-GB')).toBe('12 OCT 2026');
    expect(stampDateText('2026-03-03', 'en-GB')).toBe('03 MAR 2026');
  });

  test('follows the locale order and words', () => {
    expect(stampDateText('2026-10-12', 'en-US')).toBe('OCT 12, 2026');
    expect(stampDateText('2026-10-12', 'es-ES')).toMatch(/^12 OCT\.? 2026$/);
  });

  test('is the local calendar day: no time zone moves it', () => {
    expect(stampDateText('2026-12-31', 'en-GB')).toBe('31 DEC 2026');
    expect(stampDateText('2026-01-01', 'en-GB')).toBe('01 JAN 2026');
  });

  test('gives back what it cannot read, never a wrong day', () => {
    expect(stampDateText('not a date', 'en-GB')).toBe('not a date');
    expect(stampDateText('2026-02-31', 'en-GB')).toBe('2026-02-31');
    expect(stampDateText('', 'en-GB')).toBe('');
  });

  test('gives back the day when the locale is not one Intl knows', () => {
    expect(stampDateText('2026-10-12', 'not_a_locale!')).toBe('2026-10-12');
  });
});

describe('stampLabel - what the parent says for a stamp that is decoration', () => {
  test('is "Stamp: country, date" with the month in words', () => {
    expect(stampLabel('Portugal', '2026-10-12', 'en-GB')).toBe(
      'Stamp: Portugal, 12 October 2026',
    );
  });

  test('follows the locale', () => {
    expect(stampLabel('Portugal', '2026-10-12', 'en-US')).toBe(
      'Stamp: Portugal, October 12, 2026',
    );
  });

  test('gives the raw day when it cannot read it', () => {
    expect(stampLabel('Portugal', 'soon', 'en-GB')).toBe('Stamp: Portugal, soon');
  });
});
