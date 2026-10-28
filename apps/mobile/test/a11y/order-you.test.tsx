/**
 * T560 - the reading order of You (feature 005; FR-058, FR-070, FR-075, FR-076, SC-015; UI-SPEC
 * section 8; quickstart section 8): identity (the avatar is decoration), the period switch (radios
 * that say which is selected), the passport card with each figure ONE stop named in words, the
 * stamps (each ONE image named "Stamp: Portugal, 12 October 2026"; the art is hidden), the Account
 * and App groups and the set-apart block. The mocked world is `profile-screen.test.tsx`'s.
 *
 * The stamps are two columns, and a column is a container, so in the tree they read column by
 * column (newest, third newest, ...; then second, fourth...). The platforms may sort by position
 * instead (row by row, newest first); that is a device check of `as-built/f14-a11y.md`.
 */
import { render } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useSessionStore } from '@/features/auth/session-store';
import { toGlobeTrips, type GlobeStopRow } from '@/features/globe/globe-data';
import {
  summariseCountries,
  type CountryInfo,
} from '@/features/passport/country-summary';
import { periodKeys } from '@/features/passport/passport-totals';
import type { PassportData } from '@/features/passport/use-passport';
import { clearRasterCache } from '@/components/profile/raster-stamp';
import { resetLanded } from '@/components/profile/stamp-landing';

import {
  accessibleNodes,
  exposedArt,
  expectReadingOrder,
  unnamed,
} from '../helpers/a11y-nodes';
import { appearance } from '../helpers/appearance';

const TODAY = '2026-10-14';

jest.mock('@/hooks/use-appearance');
const { useAppearance } = jest.requireMock('@/hooks/use-appearance') as {
  useAppearance: jest.Mock;
};

const mockPassport = {
  data: { trips: [], summaries: [], periods: ['all'] } as PassportData,
  loading: false,
  error: null as Error | null,
};
jest.mock('@/features/passport/use-passport', () => ({
  usePassport: () => mockPassport,
}));

jest.mock('@/features/trips/stop-dates', () => ({
  ...jest.requireActual('@/features/trips/stop-dates'),
  todayIso: () => '2026-10-14',
}));

jest.mock('expo-image', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const Host = View as unknown as React.ComponentType<Record<string, unknown>>;
  return { Image: (props: Record<string, unknown>) => React.createElement(Host, props) };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3', ios: { buildNumber: '45' } } },
}));

const mockSignOut = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null as unknown,
};
jest.mock('@/features/auth/use-sign-out', () => ({
  ...jest.requireActual('@/features/auth/use-sign-out'),
  useSignOut: () => mockSignOut,
}));

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn() },
  initSentry: jest.fn(),
}));

const { captureRef } = jest.requireMock('react-native-view-shot') as {
  captureRef: jest.Mock;
};
const { mockToast } = jest.requireMock('heroui-native') as {
  mockToast: { show: jest.Mock };
};

const PROFILE = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'marta@example.com',
  display_name: 'Marta',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2021-06-15T10:00:00.000Z',
};

const COUNTRIES: CountryInfo[] = [
  { id: 351, iso_code: 'PT', name: 'Portugal', continent: 'Europe' },
  { id: 81, iso_code: 'JP', name: 'Japan', continent: 'Asia' },
  { id: 1, iso_code: 'US', name: 'United States', continent: 'North America' },
];

type City = Pick<GlobeStopRow, 'city_id' | 'country_id' | 'lng' | 'lat'>;
const LISBON: City = { city_id: 5, country_id: 351, lng: -9.1393, lat: 38.7223 };
const PORTO: City = { city_id: 6, country_id: 351, lng: -8.611, lat: 41.1496 };
const TOKYO: City = { city_id: 7, country_id: 81, lng: 139.6917, lat: 35.6895 };
const NEW_YORK: City = { city_id: 8, country_id: 1, lng: -74.006, lat: 40.7128 };

let n = 0;
function stop(tripId: string, city: City, arrive: string, depart = arrive): GlobeStopRow {
  n += 1;
  return {
    id: `s${n}`,
    trip_id: tripId,
    arrive_date: arrive,
    depart_date: depart,
    ...city,
  };
}

function realData(): PassportData {
  const trips = toGlobeTrips(
    ['t25', 't26a', 't26b'].map((id) => ({ id, title: id })),
    [
      stop('t25', LISBON, '2025-05-01', '2025-05-03'),
      stop('t25', PORTO, '2025-05-03', '2025-05-05'),
      stop('t26a', TOKYO, '2026-03-03', '2026-03-10'),
      stop('t26b', NEW_YORK, '2026-10-12', '2026-10-13'),
    ],
    TODAY,
  );
  return {
    trips,
    summaries: summariseCountries(trips, COUNTRIES, TODAY),
    periods: periodKeys(trips),
  };
}

beforeEach(() => {
  useAppearance.mockReturnValue(appearance({ prefersLessMotion: true }));
  mockPassport.data = realData();
  mockPassport.loading = false;
  mockPassport.error = null;
  mockSignOut.mutate.mockReset();
  mockSignOut.isPending = false;
  mockSignOut.error = null;
  mockToast.show.mockClear();
  captureRef.mockClear();
  resetLanded();
  clearRasterCache();
  useSessionStore.setState({ status: 'signed-in', user: PROFILE });
});

describe('You reading order', () => {
  test('identity, period, passport, recap, stamps, Account, App, then sign out and delete', async () => {
    await render(<ProfileScreen />);
    const nodes = accessibleNodes();
    expectReadingOrder(nodes, [
      'profile-display-name',
      'profile-since',
      'passport-period-all',
      'passport-period-2026',
      'passport-period-2025',
      /^Passport/,
      'passport-figure-countries',
      'passport-figure-trips',
      'passport-figure-distance',
      'passport-figure-continents',
      /around the Earth/,
      'coming-soon-recap',
      'Stamps',
      'stamps-count',
      'stamp-US',
      'Account',
      'Email: marta@example.com',
      'Home currency: EUR',
      'App',
      'profile-version',
      'profile-sign-out',
      'profile-delete-account',
    ]);
    expect(unnamed(nodes)).toEqual([]);
  });

  test('the name is a heading, and the avatar and the decoration of the card are not stops', async () => {
    await render(<ProfileScreen />);
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.id === 'profile-display-name')).toMatchObject({
      name: 'Marta',
      role: 'header',
    });
    const ids = nodes.map((node) => node.id ?? '');
    expect(
      ids.filter((id) => /avatar|passport-glow|passport-mrz|stamps-notch/.test(id)),
    ).toEqual([]);
  });

  test('the figures are named in words with their final value, one stop each', async () => {
    await render(<ProfileScreen />);
    const figures = accessibleNodes().filter((node) =>
      node.id?.startsWith('passport-figure-'),
    );
    expect(figures.map((node) => node.name)).toEqual([
      '3 of 195 countries',
      '3 trips',
      '274 kilometres travelled',
      '3 of 7 continents',
    ]);
  });

  test('the period switch says which period is selected, as radios (not by colour)', async () => {
    await render(<ProfileScreen />);
    const radios = accessibleNodes().filter((node) => node.role === 'radio');
    expect(radios.map((node) => [node.name, node.state])).toEqual([
      ['All time', ['checked', 'selected']],
      ['Year 2026', []],
      ['Year 2025', []],
    ]);
  });

  test('every stamp is ONE image that reads "Stamp: country, date"; its art and text are hidden', async () => {
    await render(<ProfileScreen />);
    const stamps = accessibleNodes().filter((node) => node.id?.startsWith('stamp-'));
    expect(stamps.map((node) => [node.name, node.role])).toEqual([
      ['Stamp: United States, 12 October 2026', 'image'],
      ['Stamp: Portugal, 1 May 2025', 'image'],
      ['Stamp: Japan, 3 March 2026', 'image'],
    ]);
  });

  test('the sign-out guard is a button, delete account says it is unavailable', async () => {
    await render(<ProfileScreen />);
    const nodes = accessibleNodes();
    expect(nodes.find((node) => node.id === 'profile-sign-out')).toMatchObject({
      name: 'Sign out',
      role: 'button',
    });
    expect(nodes.find((node) => node.id === 'profile-delete-account')).toMatchObject({
      role: 'button',
      state: ['disabled'],
    });
  });

  test('no drawing is left exposed to assistive technology (FR-076)', async () => {
    await render(<ProfileScreen />);
    expect(exposedArt()).toEqual([]);
  });
});
