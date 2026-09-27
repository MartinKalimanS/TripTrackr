/**
 * REST DTO contracts for User Story 1 (contracts/rest-api.md §1–3, §11).
 *
 * Same posture as the sync tests: the shapes are strict, so a field the contract
 * does not name is a refusal — and the one field FR-013 forbids a client to set,
 * `trips.status`, is proven refused on every write shape that touches a trip.
 */
import {
  ArcsResponse,
  AuthTokens,
  CitiesQuery,
  CreateStopRequest,
  CreateTripRequest,
  LoginRequest,
  PatchMeRequest,
  PatchStopRequest,
  PatchTripRequest,
  RegisterRequest,
  Trip,
  UserProfile,
} from '../src';

const UUID = '0b7e0d2e-2d8c-4a2c-9f9c-3a3d9c0f1a11';
const NOW = '2026-09-23T10:12:03.000Z';

const profile = {
  id: UUID,
  email: 'ada@example.com',
  display_name: 'Ada',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: NOW,
};

describe('auth', () => {
  it('registers with an email, a password of real length, and a display name (FR-001)', () => {
    const ok = {
      email: 'ada@example.com',
      password: 'a-long-enough-passphrase',
      display_name: 'Ada',
    };
    expect(RegisterRequest.safeParse(ok).success).toBe(true);
    expect(RegisterRequest.safeParse({ ...ok, password: 'short' }).success).toBe(false);
    expect(RegisterRequest.safeParse({ ...ok, email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(RegisterRequest.safeParse({ ...ok, display_name: '  ' }).success).toBe(false);
  });

  it('normalises the email so two spellings of one address are one account', () => {
    const parsed = RegisterRequest.parse({
      email: '  Ada@Example.COM ',
      password: 'a-long-enough-passphrase',
      display_name: 'Ada',
    });
    expect(parsed.email).toBe('ada@example.com');
    expect(
      LoginRequest.parse({ email: 'ADA@example.com', password: 'x'.repeat(12) }).email,
    ).toBe('ada@example.com');
  });

  it('returns both tokens and the profile, and never the password hash', () => {
    const tokens = {
      access_token: 'a.b.c',
      refresh_token: 'r'.repeat(43),
      user: profile,
    };
    expect(AuthTokens.safeParse(tokens).success).toBe(true);
    expect(
      UserProfile.safeParse({ ...profile, password_hash: '$argon2id$…' }).success,
    ).toBe(false);
  });
});

describe('profile', () => {
  it('lets a traveller change what FR-008 lists and nothing else', () => {
    expect(
      PatchMeRequest.safeParse({
        display_name: 'Ada L.',
        bio: 'Wanderer',
        home_currency: 'GBP',
        is_profile_public: true,
      }).success,
    ).toBe(true);
    expect(PatchMeRequest.safeParse({ email: 'new@example.com' }).success).toBe(false);
    expect(PatchMeRequest.safeParse({}).success).toBe(false);
  });
});

describe('trips', () => {
  it("creates with a title and a home currency; the id is the client's to choose (D-15)", () => {
    expect(
      CreateTripRequest.safeParse({ title: 'Italy', home_currency: 'EUR' }).success,
    ).toBe(true);
    expect(
      CreateTripRequest.safeParse({ id: UUID, title: 'Italy', home_currency: 'EUR' })
        .success,
    ).toBe(true);
    expect(CreateTripRequest.safeParse({ title: '', home_currency: 'EUR' }).success).toBe(
      false,
    );
  });

  it('refuses a client-supplied status on create and on patch (FR-013)', () => {
    expect(
      CreateTripRequest.safeParse({
        title: 'Italy',
        home_currency: 'EUR',
        status: 'active',
      }).success,
    ).toBe(false);
    expect(PatchTripRequest.safeParse({ status: 'past' }).success).toBe(false);
    expect(PatchTripRequest.safeParse({ title: 'Italy, spring' }).success).toBe(true);
    expect(PatchTripRequest.safeParse({}).success).toBe(false);
  });

  it('rejects a stop whose departure precedes its arrival (FR-011)', () => {
    const stop = {
      city_id: 3169070,
      arrive_date: '2026-05-10',
      depart_date: '2026-05-12',
    };
    expect(CreateStopRequest.safeParse(stop).success).toBe(true);
    expect(
      CreateStopRequest.safeParse({ ...stop, depart_date: '2026-05-01' }).success,
    ).toBe(false);
    // A patch of one date alone is legitimate; the server checks the pair it ends up with.
    expect(PatchStopRequest.safeParse({ depart_date: '2026-05-20' }).success).toBe(true);
    expect(PatchStopRequest.safeParse({ sort_order: 2 }).success).toBe(true);
    expect(PatchStopRequest.safeParse({}).success).toBe(false);
  });

  it("describes a trip with its ordered stops and each stop's city", () => {
    const trip = {
      id: UUID,
      title: 'Italy',
      home_currency: 'EUR',
      is_public: false,
      cover_photo_id: null,
      status: 'planning',
      created_at: NOW,
      updated_at: NOW,
      stops: [
        {
          id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
          trip_id: UUID,
          city_id: 3169070,
          sort_order: 0,
          arrive_date: '2026-05-10',
          depart_date: '2026-05-12',
          created_at: NOW,
          updated_at: NOW,
          city: {
            id: 3169070,
            country_id: 105,
            name: 'Rome',
            ascii_name: 'Rome',
            lat: 41.89,
            lng: 12.51,
            timezone: 'Europe/Rome',
            population: 2318895,
          },
        },
      ],
    };
    expect(Trip.safeParse(trip).success).toBe(true);
    // Tombstones never cross the REST read boundary; that is the sync feed's job.
    expect(Trip.safeParse({ ...trip, deleted_at: null }).success).toBe(false);
  });

  it('serves arcs as GeoJSON LineStrings between consecutive stops (FR-016)', () => {
    const arcs = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [12.51, 41.89],
              [11.25, 43.77],
            ],
          },
          properties: {
            trip_id: UUID,
            from_city_id: 3169070,
            to_city_id: 3176959,
            status: 'planning',
          },
        },
      ],
    };
    expect(ArcsResponse.safeParse(arcs).success).toBe(true);
    // A single-stop trip yields zero arcs, not an error (spec edge case).
    expect(
      ArcsResponse.safeParse({ type: 'FeatureCollection', features: [] }).success,
    ).toBe(true);
  });
});

describe('lookups', () => {
  it('bounds the autocomplete query so it cannot become a table scan', () => {
    expect(CitiesQuery.safeParse({ q: 'Flor' }).success).toBe(true);
    expect(CitiesQuery.safeParse({ q: 'Flor', limit: 10 }).success).toBe(true);
    expect(CitiesQuery.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    expect(CitiesQuery.safeParse({ q: 'Flor', limit: 500 }).success).toBe(false);
    expect(CitiesQuery.parse({}).limit).toBe(20);
  });
});
