/**
 * `parseBoardingPass` — IATA Resolution 792 (BCBP), format "M" (FR-035; research D-33).
 *
 * The mandatory block is 60 fixed-width characters: format code, number of
 * legs, passenger name (20), e-ticket indicator, booking reference (7), from
 * (3), to (3), operating carrier (3), flight number (5), day of the year (3),
 * compartment, seat (4), check-in sequence (5), passenger status, and the
 * size of the variable field (2 hex). Only three items leave the parser; the
 * booking reference, which is enough to manage the booking, never does.
 */
import { DocumentParsedFields, parseBoardingPass, resolveDayOfYear } from '../src';

/** The worked example in IATA Resolution 792 (a flight on day 326). */
const IATA_EXAMPLE = 'M1DESMARAIS/LUC       EABC123 YULFRAAC 0834 326J001A0025 100';

function pass({
  name = 'DESMARAIS/LUC',
  carrier = 'AC ',
  flight = '0834 ',
  day = '326',
  legs = '1',
} = {}) {
  return `M${legs}${name.padEnd(20)}EABC123 YULFRA${carrier}${flight}${day}J001A0025 100`;
}

describe('parseBoardingPass', () => {
  it('reads the IATA example: flight AC834 on 22 November, passenger as printed', () => {
    const fields = parseBoardingPass(IATA_EXAMPLE, '2026-11-20');

    expect(fields).toEqual({
      flight_number: 'AC834',
      flight_date: '2026-11-22',
      passenger_name: 'DESMARAIS/LUC',
    });
    expect(DocumentParsedFields.safeParse(fields).success).toBe(true);
  });

  it('never returns the booking reference, seat or sequence number', () => {
    const fields = parseBoardingPass(IATA_EXAMPLE, '2026-11-20');
    expect(Object.keys(fields ?? {}).sort()).toEqual([
      'flight_date',
      'flight_number',
      'passenger_name',
    ]);
    expect(JSON.stringify(fields)).not.toMatch(/ABC123|001A|0025/);
  });

  it('keeps an operational suffix and drops leading zeros', () => {
    expect(
      parseBoardingPass(pass({ flight: '0400A' }), '2026-11-20')?.flight_number,
    ).toBe('AC400A');
    expect(
      parseBoardingPass(pass({ carrier: 'U2 ', flight: '1234 ' }), '2026-11-20'),
    ).toEqual(expect.objectContaining({ flight_number: 'U21234' }));
    expect(
      parseBoardingPass(pass({ carrier: 'BAW', flight: '0012 ' }), '2026-11-20'),
    ).toEqual(expect.objectContaining({ flight_number: 'BAW12' }));
  });

  it('collapses the padding inside a name but keeps it as printed', () => {
    expect(
      parseBoardingPass(pass({ name: 'SMITH/JOHN  MR' }), '2026-11-20')?.passenger_name,
    ).toBe('SMITH/JOHN MR');
  });

  it('reads the first leg of a multi-leg pass', () => {
    const twoLegs = `${pass({ legs: '2' })}ABC123 FRAMUCLH 0400 327Y012C0100 100`;
    expect(parseBoardingPass(twoLegs, '2026-11-20')?.flight_number).toBe('AC834');
  });

  it('ignores the conditional and airline data after the mandatory block', () => {
    const withConditional = `${IATA_EXAMPLE.slice(0, 58)}0A>5180   0014A0000000000`;
    expect(parseBoardingPass(withConditional, '2026-11-20')?.flight_number).toBe('AC834');
  });

  it.each([
    ['empty', ''],
    ['a URL in a QR code', 'https://example.com/boarding/123'],
    ['too short', IATA_EXAMPLE.slice(0, 40)],
    ['not format M', `X${IATA_EXAMPLE.slice(1)}`],
    ['no legs', `M0${IATA_EXAMPLE.slice(2)}`],
    ['a day that does not exist', pass({ day: '400' })],
    ['day zero', pass({ day: '000' })],
    ['a flight number of zeros', pass({ flight: '0000 ' })],
    ['letters where the flight number goes', pass({ flight: 'ABCD ' })],
    ['a blank name', pass({ name: '' })],
    ['a carrier that is not a designator', pass({ carrier: '#! ' })],
  ])('yields null for %s — manual entry, not an error', (_case, payload) => {
    expect(parseBoardingPass(payload, '2026-11-20')).toBeNull();
  });
});

describe('resolveDayOfYear — BCBP carries no year', () => {
  it('picks the year that puts the date nearest the scan', () => {
    expect(resolveDayOfYear(326, '2026-11-20')).toBe('2026-11-22');
    // Scanned in late December for a flight on 3 January.
    expect(resolveDayOfYear(3, '2026-12-30')).toBe('2027-01-03');
    // Scanned in January, months after the flight, to record the trip.
    expect(resolveDayOfYear(350, '2027-01-10')).toBe('2026-12-16');
  });

  it('day 366 exists only in a leap year', () => {
    expect(resolveDayOfYear(366, '2028-12-20')).toBe('2028-12-31');
    // 2025, 2026 and 2027 are common years: no candidate at all.
    expect(resolveDayOfYear(366, '2026-12-20')).toBeNull();
    // 31 December 2028 is a candidate, but nearly two years from the scan.
    expect(resolveDayOfYear(366, '2027-01-05')).toBeNull();
  });

  it('refuses a day outside 1–366 and a reference that is not a date', () => {
    expect(resolveDayOfYear(0, '2026-11-20')).toBeNull();
    expect(resolveDayOfYear(367, '2026-11-20')).toBeNull();
    expect(resolveDayOfYear(10, 'soon')).toBeNull();
  });
});
