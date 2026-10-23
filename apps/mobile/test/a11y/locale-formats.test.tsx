/**
 * T560 - figures, dates, plurals and units follow the device (feature 005; FR-077; AGENTS.md "Locale,
 * decimal separator": `expo-localization` for the language, `Intl` for the format).
 *
 * - FIGURES are grouped by the locale ("61.480", "61,480") by the helpers the screens use;
 * - DATES come from `Intl.DateTimeFormat` in the device's language ("Oct 2026", "Okt. 2026");
 * - PLURALS go through \`countParts\`, whose fallback is a plain comparison: Hermes has NO
 *   \`Intl.PluralRules\`, so the whole suite of copy runs with it removed, and a scan of the
 *   source fails on a call that is not behind the guard;
 * - UNITS are kilometres or miles by the device's measurement system, in every sentence that
 *   states a distance (the photo viewer's "about 231 km from Firenze" was the one that did not).
 */
import { getLocales } from 'expo-localization';
import fs from 'node:fs';
import path from 'node:path';

import type { PhotoWithPlace } from '@/db/repositories/photos';
import { formatFigure } from '@/components/ui/count-up';
import { countOf, countParts, monthYear } from '@/features/home/home-format';
import {
  continentLabel,
  countriesSubtitle,
  countryLabel,
  countryMeta,
} from '@/features/passport/country-copy';
import { lapText, stampsCount } from '@/features/passport/passport-copy';
import { filingMismatchLine } from '@/features/photos/photo-labels';
import { tripsCountLine, yearHeaderCopy } from '@/features/trips/trip-card-copy';
import { formatDistance } from '@/lib/locale';

import { manyCountries } from '../helpers/country-fixture';

const defaultLocales = (getLocales as jest.Mock).getMockImplementation();

function device(languageTag: string, measurementSystem: 'metric' | 'us' | 'uk') {
  (getLocales as jest.Mock).mockReturnValue([
    {
      languageTag,
      decimalSeparator: languageTag.startsWith('en') ? '.' : ',',
      currencyCode: 'EUR',
      measurementSystem,
    },
  ]);
}

afterEach(() => (getLocales as jest.Mock).mockImplementation(defaultLocales));

describe('figures follow the locale', () => {
  test.each([
    ['en-GB', '61,480'],
    ['de-DE', '61.480'],
    ['es-ES', '61.480'],
    ['en-IN', '61,480'],
  ])('61480 in %s is %s', (tag, expected) => {
    expect(formatFigure(61480, tag)).toBe(expected);
  });

  test('French groups with a (narrow) no-break space, and a count in a sentence agrees', () => {
    expect(formatFigure(61480, 'fr-FR').replace(/\s/g, ' ')).toBe('61 480');
    expect(countOf(61480, 'trip', 'trips', 'fr-FR').replace(/\s/g, ' ')).toBe(
      '61 480 trips',
    );
  });

  test('a tag the platform rejects costs the format and never the screen', () => {
    expect(formatFigure(61480, 'not a tag')).toMatch(/61.?480/);
    expect(countParts(3, 'trip', 'trips', 'not a tag').figure).toBe('3');
  });
});

describe('dates follow the locale', () => {
  test('a month and year in English, German and French', () => {
    expect(monthYear('2026-10-09', 'en-GB')).toBe('Oct 2026');
    expect(monthYear('2026-10-09', 'de-DE')).toMatch(/^Okt\.? 2026$/);
    expect(monthYear('2026-10-09', 'fr-FR')).toMatch(/^oct\.? 2026$/);
  });

  test('a country row says its last visit in the device language', () => {
    const [country] = manyCountries(1);
    expect(countryMeta(country!, 'en-GB').when).toBe('last Oct 2026');
    expect(countryMeta(country!, 'de-DE').when).toMatch(/^last Okt\.? 2026$/);
    expect(countryLabel(country!, 'de-DE')).toMatch(/last visited Okt\.? 2026$/);
  });
});

describe('plurals need no Intl.PluralRules (Hermes has none)', () => {
  const real = Intl.PluralRules;
  beforeEach(() => {
    Object.defineProperty(Intl, 'PluralRules', { value: undefined, configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(Intl, 'PluralRules', { value: real, configurable: true });
  });

  test.each([
    [0, '0 trips'],
    [1, '1 trip'],
    [2, '2 trips'],
    [21, '21 trips'],
  ])('%i reads "%s", in any language tag', (count, expected) => {
    for (const tag of ['en-GB', 'de-DE', 'pl-PL', 'ar-EG']) {
      expect(countParts(count, 'trip', 'trips', tag).noun).toBe(
        count === 1 ? 'trip' : 'trips',
      );
    }
    expect(countOf(count, 'trip', 'trips', 'en-GB')).toBe(expected);
  });

  test('every sentence of the Countries list and the passport still reads', () => {
    const [one, two] = [manyCountries(1)[0]!, { ...manyCountries(1)[0]!, tripCount: 1 }];
    expect(countryMeta(one, 'en-GB').trips).toBe('2 trips');
    expect(countryMeta(two, 'en-GB').trips).toBe('1 trip');
    expect(
      countriesSubtitle(
        {
          countries: 1,
          countriesOf: 195,
          trips: 1,
          distanceKm: 0,
          continents: 1,
          continentsOf: 7,
        },
        'en-GB',
      ),
    ).toBe('1 of 195 \u00b7 1 continent');
    expect(continentLabel('Europe', 9, 'en-GB')).toBe('Europe \u00b7 9');
    expect(stampsCount(14, 'en-GB')).toBe('14 of 195');
    expect(lapText(1.5, 'en-GB')).toBe('1.5\u00d7 around the Earth');
    expect(tripsCountLine({ count: 1, sinceYear: null })).toBe('1 trip');
    expect(yearHeaderCopy(2026, 1, 0).count).toBe('1 trip');
  });

  test('the laps figure takes its decimal separator from the locale', () => {
    expect(lapText(1.5, 'de-DE')).toBe('1,5\u00d7 around the Earth');
  });
});

describe('no unguarded Intl.PluralRules anywhere in the source', () => {
  const SRC = path.resolve(__dirname, '..', '..', 'src');
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return files(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
        ? [full]
        : [];
    });

  test('the one use is behind a typeof guard and a try', () => {
    const users = files(SRC).filter((file) =>
      /new Intl\.PluralRules|Intl\.PluralRules\(/.test(fs.readFileSync(file, 'utf8')),
    );
    expect(users.map((file) => path.basename(file))).toEqual(['home-format.ts']);
    const text = fs.readFileSync(users[0]!, 'utf8');
    expect(text).toMatch(/typeof Intl\.PluralRules !== 'function'/);
    expect(text.indexOf('typeof Intl.PluralRules')).toBeLessThan(
      text.indexOf('new Intl.PluralRules'),
    );
  });
});

describe('units follow the measurement system, in every sentence that states a distance', () => {
  const photo = {
    city_id: 101,
    city_name: 'Firenze',
    city_lat: 43.7696,
    city_lng: 11.2558,
    exif_lat: 41.8986,
    exif_lng: 12.4769,
  } as PhotoWithPlace;

  test('the photo viewer says kilometres in a metric country', () => {
    device('en-GB', 'metric');
    expect(filingMismatchLine(photo)).toMatch(
      /^This photo was taken about 23\d km from Firenze/,
    );
  });

  test.each(['us', 'uk'] as const)('and miles where the system is %s', (system) => {
    device('en-US', system);
    const line = filingMismatchLine(photo);
    expect(line).toMatch(/^This photo was taken about 14\d mi from Firenze/);
    expect(line).not.toMatch(/ km /);
  });

  test('the year header and the stop distances agree with it', () => {
    device('en-US', 'us');
    expect(yearHeaderCopy(2026, 2, 9380)).toMatchObject({
      distance: '5,828 mi',
      spoken: '5,828 miles',
    });
    expect(formatDistance(1.7).spoken).toBe('1 mile');
    device('de-DE', 'metric');
    expect(yearHeaderCopy(2026, 2, 9380)).toMatchObject({
      distance: '9.380 km',
      spoken: '9.380 kilometres',
    });
  });
});
