/**
 * F13 (T557) - the You screen as a whole (feature 005; FR-058, FR-059, FR-064, FR-080 as amended
 * by Q-11, FR-081, FR-084; UI-SPEC section 8; the pictures `profile.png`, `profile-dark.png`):
 * identity, period switch, passport card, recap entry, stamps page, the Account and App groups and
 * the set-apart block, in that order, with the figures of the traveller's own local rows.
 * The data is the real derivation (`toGlobeTrips`, `summariseCountries`) over fixture rows; only
 * the live queries are replaced.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import ProfileScreen from '@/app/(tabs)/profile';
import { useSessionStore } from '@/features/auth/session-store';
import { toGlobeTrips, type GlobeStopRow } from '@/features/globe/globe-data';
import {
  summariseCountries,
  type CountryInfo,
  type CountrySummary,
} from '@/features/passport/country-summary';
import { periodKeys } from '@/features/passport/passport-totals';
import type { PassportData } from '@/features/passport/use-passport';
import { clearRasterCache } from '@/components/profile/raster-stamp';
import { resetLanded } from '@/components/profile/stamp-landing';

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

const hidden = { includeHiddenElements: true };

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

function summary(iso2: string, firstVisit: string): CountrySummary {
  return {
    countryId: iso2.charCodeAt(0) * 100 + iso2.charCodeAt(1),
    iso2,
    name: `Land ${iso2}`,
    continent: 'Europe',
    tripCount: 1,
    firstVisit,
    lastVisit: firstVisit,
    isNow: false,
    planned: false,
    focus: { center: [0, 0], bounds: null },
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

describe('<ProfileScreen> - the pictured order', () => {
  test('identity, period, passport, recap, stamps, then Account, App and the set-apart block', async () => {
    await render(<ProfileScreen />);
    const ids = [
      'profile-identity',
      'passport-period',
      'passport-card',
      'coming-soon-recap',
      'stamps-page',
      'profile-account-group',
      'profile-app-group',
      'profile-actions',
    ];
    const order = screen
      .getAllByTestId(new RegExp(`^(${ids.join('|')})$`))
      .map((node) => node.props.testID);
    expect(order).toEqual(ids);
  });

  test('every id the flows and the parity test know survives', async () => {
    await render(<ProfileScreen />);
    for (const id of [
      'profile-screen',
      'profile-identity',
      'profile-display-name',
      'profile-email',
      'profile-account-group',
      'profile-app-group',
      'profile-version',
      'profile-actions',
      'profile-sign-out',
      'profile-delete-account',
      'passport-card',
      'passport-period',
      'stamps-page',
    ]) {
      expect(screen.getByTestId(id, hidden)).toBeTruthy();
    }
    expect(screen.getByTestId('profile-sign-out-icon', hidden)).toBeTruthy();
  });

  test('says "Traveller since 2021" from the account and the email in Account', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByText('Traveller since 2021')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-email')).toHaveTextContent('marta@example.com');
  });
});

describe("<ProfileScreen> - the figures are the traveller's own", () => {
  test('All time: the countries, trips, continents and the distance of the local rows', async () => {
    await render(<ProfileScreen />);
    expect(screen.getByTestId('passport-countries')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('passport-trips')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('passport-continents')).toHaveTextContent(/^3$/);
    expect(screen.getByText('Passport \u00b7 all time')).toBeOnTheScreen();
    expect(screen.getByTestId('stamps-count')).toHaveTextContent('3 of 195');
    expect(screen.getByText(/\u00d7 around the Earth/)).toBeOnTheScreen();
  });

  test('the switch offers All time and each year with a trip, newest first', async () => {
    await render(<ProfileScreen />);
    expect(
      screen.getAllByRole('radio').map((node) => node.props.accessibilityLabel),
    ).toEqual(['All time', 'Year 2026', 'Year 2025']);
  });

  test('choosing a year redraws the card, the recap and the stamps for it', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId('passport-period-2026'));
    expect(screen.getByText('Passport \u00b7 2026')).toBeOnTheScreen();
    expect(screen.getByTestId('passport-countries')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('passport-trips')).toHaveTextContent(/^2$/);
    expect(screen.getByText('Your 2026 in 7 slides')).toBeOnTheScreen();
    expect(screen.getByTestId('stamps-count')).toHaveTextContent('2 of 195');
    expect(screen.queryByTestId('stamp-PT')).toBeNull();
    await fireEvent.press(screen.getByTestId('passport-period-all'));
    expect(screen.getByTestId('stamp-PT')).toBeOnTheScreen();
  });

  test('a year that has lost its trips falls back to All time', async () => {
    const view = await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId('passport-period-2025'));
    expect(screen.getByText('Passport \u00b7 2025')).toBeOnTheScreen();
    mockPassport.data = { ...realData(), periods: ['all', '2026'] };
    await view.rerender(<ProfileScreen />);
    expect(screen.getByText('Passport \u00b7 all time')).toBeOnTheScreen();
  });
});

describe('<ProfileScreen> - the pictured controls without a capability (Q-11)', () => {
  test.each([
    'coming-soon-share-passport',
    'coming-soon-profile-settings',
    'coming-soon-recap',
  ])('%s shows one toast and changes nothing', async (id) => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId(id));
    expect(mockToast.show).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('passport-countries')).toHaveTextContent(/^3$/);
    expect(mockSignOut.mutate).not.toHaveBeenCalled();
  });
});

describe('<ProfileScreen> - every state is designed', () => {
  test('while the store has not answered: shapes for the passport, the rest is there', async () => {
    mockPassport.loading = true;
    await render(<ProfileScreen />);
    const skeleton = screen.getByLabelText('Loading your passport');
    expect(skeleton.props.accessibilityRole).toBe('progressbar');
    expect(screen.queryByTestId('passport-card')).toBeNull();
    expect(screen.getByTestId('profile-display-name')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-sign-out')).toBeOnTheScreen();
  });

  test('when the store cannot be read: words and an icon, and Sign out still works', async () => {
    mockPassport.error = new Error('database is locked');
    await render(<ProfileScreen />);
    expect(screen.getByText('Couldn\u2019t read your passport')).toBeOnTheScreen();
    expect(screen.getByText('Your trips are safe on this phone.')).toBeOnTheScreen();
    expect(screen.queryByText('database is locked')).toBeNull();
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockSignOut.mutate).toHaveBeenCalled();
  });

  test('with no country: zeros, no lap line, a ghost stamp and the next step', async () => {
    mockPassport.data = { trips: [], summaries: [], periods: ['all'] };
    await render(<ProfileScreen />);
    expect(screen.getByTestId('passport-countries')).toHaveTextContent(/^0$/);
    expect(screen.queryByText(/around the Earth/)).toBeNull();
    expect(screen.getByTestId('stamps-empty')).toBeOnTheScreen();
    expect(screen.getByText('No stamps yet')).toBeOnTheScreen();
  });

  test('without a session profile there is no identity, but the screen and Sign out remain', async () => {
    useSessionStore.setState({ status: 'signed-in', user: null });
    await render(<ProfileScreen />);
    expect(screen.queryByTestId('profile-identity')).toBeNull();
    expect(screen.queryByTestId('profile-account-group')).toBeNull();
    expect(screen.getByTestId('profile-sign-out')).toBeOnTheScreen();
  });
});

describe('<ProfileScreen> - Sign out and Delete account are unchanged', () => {
  test('Sign out goes through the mutation; the guard warning shows under its row', async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockSignOut.mutate).toHaveBeenCalledWith();
    const actions = screen.getByTestId('profile-actions');
    expect(within(actions).getByTestId('profile-delete-account')).toBeTruthy();
    expect(
      screen.getByTestId('profile-delete-account').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
  });
});

describe('<ProfileScreen> - a 120-stamp passport scrolls (D5-08)', () => {
  beforeEach(() => {
    const codes = Array.from({ length: 120 }, (_, index) => {
      const a = String.fromCharCode(65 + (index % 26));
      const b = String.fromCharCode(65 + Math.floor(index / 26));
      return `${a}${b}`;
    });
    mockPassport.data = {
      trips: [],
      summaries: codes.map((code, index) =>
        summary(
          code,
          `2024-0${(index % 9) + 1}-${String((index % 27) + 1).padStart(2, '0')}`,
        ),
      ),
      periods: ['all'],
    };
  });

  test('the whole page is there, but only a few vector stamps are ever laid out', async () => {
    await render(<ProfileScreen />);
    expect(screen.getAllByTestId(/^stamp-[A-Z]{2}$/)).toHaveLength(120);
    expect(screen.getByTestId('stamps-count')).toHaveTextContent('120 of 195');
    const scroller = screen.getByTestId('profile-screen').children[0] as never;
    for (const y of [0, 400, 1200, 3000, 6000, 9000]) {
      await fireEvent.scroll(scroller, {
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { height: 9000, width: 390 },
          layoutMeasurement: { height: 844, width: 390 },
        },
      });
      expect(screen.queryAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden)).toHaveLength(
        3,
      );
    }
    // Sign out, at the very end, is reachable and still pressable.
    await fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(mockSignOut.mutate).toHaveBeenCalled();
  });

  test('stamps are baked three at a time as they are laid out, and become pictures', async () => {
    await render(<ProfileScreen />);
    for (let round = 0; round < 3; round += 1) {
      const stages = screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden);
      for (const stage of stages) {
        await fireEvent(stage.children[0] as never, 'layout', {
          nativeEvent: { layout: { width: 124, height: 124 } },
        });
      }
      await act(async () => {});
    }
    expect(captureRef).toHaveBeenCalledTimes(9);
    expect(screen.getAllByTestId(/^stamp-art-[A-Z]{2}$/, hidden)).toHaveLength(9);
    expect(screen.getAllByTestId(/^stamp-art-[A-Z]{2}-stage$/, hidden)).toHaveLength(3);
  });
});
