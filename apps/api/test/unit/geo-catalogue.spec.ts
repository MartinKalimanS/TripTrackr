import { parseCityLine, parseCountryLine, stripAccents } from '@/db/geo-catalogue';

/**
 * The GeoNames extracts are positional and carry no header row, so nothing in the
 * file itself will ever object to a column being read from the wrong index. These
 * tests are the only thing standing between a shifted offset and a globe that
 * renders convincingly in the wrong hemisphere.
 *
 * Lines below are real-shaped rows from the published dumps, trimmed to the
 * columns the importer reads.
 */

/** cities*.txt: 19 tab-separated columns. */
function cityLine(overrides: Partial<Record<number, string>> = {}): string {
  const fields = [
    '2657896', // 0  geonameid
    'Zürich', // 1  name
    'Zurich', // 2  asciiname
    'Zurigo,Turicum', // 3  alternatenames
    '47.36667', // 4  latitude
    '8.55', // 5  longitude
    'P', // 6  feature class
    'PPLA', // 7  feature code
    'CH', // 8  country code
    '', // 9  cc2
    'ZH', // 10 admin1
    '', // 11 admin2
    '', // 12 admin3
    '', // 13 admin4
    '421878', // 14 population
    '408', // 15 elevation
    '429', // 16 dem
    'Europe/Zurich', // 17 timezone
    '2023-10-11', // 18 modification date
  ];

  for (const [index, value] of Object.entries(overrides)) {
    if (value !== undefined) fields[Number(index)] = value;
  }

  return fields.join('\t');
}

describe('stripAccents', () => {
  it.each([
    ['Zürich', 'Zurich'],
    ['São Paulo', 'Sao Paulo'],
    ['Málaga', 'Malaga'],
    ['Tokyo', 'Tokyo'],
  ])('folds %s to %s', (input, expected) => {
    expect(stripAccents(input)).toBe(expected);
  });

  it('leaves a letter that is not a decomposable accent alone', () => {
    // Arrange — eth is its own letter, not a base plus a combining mark, so NFD
    // does not decompose it and nothing here can strip it. Documented rather than
    // fixed: GeoNames' own asciiname column romanises these properly, and this
    // function is only the fallback for when that column is blank.
    expect(stripAccents('Ísafjörður')).toBe('Isafjorður');
  });
});

describe('parseCountryLine', () => {
  it('reads the iso code, name, and expanded continent', () => {
    // Arrange
    const line =
      'CH\tCHE\t756\tSZ\tSwitzerland\tBern\t41290\t8516543\tEU\t.ch\tCHF\tFranc\t41';

    // Act
    const row = parseCountryLine(line);

    // Assert
    expect(row).toEqual({ isoCode: 'CH', name: 'Switzerland', continent: 'Europe' });
  });

  it('skips the commented header block', () => {
    expect(parseCountryLine('#ISO\tISO3\tISO-Numeric\tfips\tCountry')).toBeNull();
  });

  it('skips a row with no country name', () => {
    expect(parseCountryLine('XX\tXXX\t999\t\t\t\t\t\tEU')).toBeNull();
  });

  it('records an unrecognised continent code rather than dropping the country', () => {
    // Arrange — a findable country with an odd continent beats no country at all.
    const line = 'CH\tCHE\t756\tSZ\tSwitzerland\tBern\t41290\t8516543\tZZ';

    // Act + Assert
    expect(parseCountryLine(line)?.continent).toBe('Unknown');
  });
});

describe('parseCityLine', () => {
  it('reads every column the importer needs from its correct offset', () => {
    // Act
    const row = parseCityLine(cityLine());

    // Assert — the offsets, asserted individually, because a shifted index
    // produces values that are all individually plausible.
    expect(row).toEqual({
      geonameId: 2657896,
      name: 'Zürich',
      asciiName: 'Zurich',
      latitude: 47.36667,
      longitude: 8.55,
      countryCode: 'CH',
      timezone: 'Europe/Zurich',
      population: 421878,
    });
  });

  it('does not swap latitude and longitude', () => {
    // Arrange — Zürich is at 47°N 8°E. Reversed, it is in the Gulf of Guinea.
    const row = parseCityLine(cityLine());

    // Assert
    expect(row?.latitude).toBeGreaterThan(row?.longitude ?? 0);
  });

  it('falls back to folding the local name when asciiname is blank', () => {
    // Arrange
    const row = parseCityLine(cityLine({ 2: '' }));

    // Assert
    expect(row?.asciiName).toBe('Zurich');
  });

  it.each([
    ['latitude out of range', { 4: '95.0' }],
    ['longitude out of range', { 5: '-181.0' }],
    ['non-numeric coordinates', { 4: 'north' }],
    ['missing timezone', { 17: '' }],
    ['missing name', { 1: '' }],
    ['malformed country code', { 8: 'CHE' }],
  ])('rejects a row with %s', (_label, overrides) => {
    expect(parseCityLine(cityLine(overrides))).toBeNull();
  });

  it('rejects anything that is not a populated place', () => {
    // Arrange — feature class A is an administrative region, not a city.
    expect(parseCityLine(cityLine({ 6: 'A' }))).toBeNull();
  });

  it('ranks an unpopulated city last rather than discarding it', () => {
    // Arrange + Act
    const row = parseCityLine(cityLine({ 14: '' }));

    // Assert — still findable, just never offered first (FR-014).
    expect(row?.population).toBe(0);
  });

  it('ignores blank lines', () => {
    expect(parseCityLine('   ')).toBeNull();
  });
});
