/**
 * T039 — the API client with automatic token refresh.
 *
 * `global.fetch` is replaced with a recorder so every property under test is
 * observable: the URL and headers a call produces, that a response is
 * validated against the contract before anyone sees it, that a 401 triggers
 * exactly one refresh no matter how many requests hit it at once, and that a
 * refresh the server refuses signs the device out (FR-003, FR-005).
 */
import { AuthTokens, CountriesResponse } from '@triptrackr/contracts';
import { z } from 'zod';

import { useSessionStore } from '@/features/auth/session-store';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { SECURE_KEYS, getSession, setSession } from '@/lib/secure-store';
import { Sentry } from '@/lib/sentry';

jest.mock('@/lib/sentry', () => ({
  Sentry: { captureException: jest.fn(), captureMessage: jest.fn() },
  initSentry: jest.fn(),
}));

const secureStore = jest.requireMock('expo-secure-store') as {
  getItemAsync: jest.Mock;
  __reset: () => void;
};

const profile = {
  id: '6f1c2c4e-8b3a-4d1e-9f2a-0b7e1c2d3e4f',
  email: 'ana@example.com',
  display_name: 'Ana',
  avatar_url: null,
  bio: null,
  home_currency: 'EUR',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-09-01T10:00:00.000Z',
};

type FetchMock = jest.Mock<
  Promise<Response>,
  [RequestInfo | URL, RequestInit | undefined]
>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });
}

const fetchMock = jest.fn() as FetchMock;

function requestUrl(call: number): string {
  return String(fetchMock.mock.calls[call]?.[0]);
}

function requestInit(call: number): RequestInit {
  return fetchMock.mock.calls[call]?.[1] ?? {};
}

function requestHeader(call: number, name: string): string | null {
  return new Headers(requestInit(call).headers).get(name);
}

beforeEach(async () => {
  secureStore.__reset();
  useSessionStore.setState({ status: 'signed-in', user: profile });
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
  await setSession({ accessToken: 'access-1', refreshToken: 'refresh-1', user: profile });
});

describe('apiFetch — happy path', () => {
  test('prefixes the path with the base URL and /v1, sends JSON, and returns the validated body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        countries: [{ id: 1, iso_code: 'IT', name: 'Italy', continent: 'Europe' }],
      }),
    );

    const result = await apiFetch(CountriesResponse, '/countries');

    expect(requestUrl(0)).toBe('https://api.test/v1/countries');
    expect(requestHeader(0, 'Accept')).toBe('application/json');
    expect(result.countries[0]?.name).toBe('Italy');
  });

  test('sends the bearer token from the keychain', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { countries: [] }));

    await apiFetch(CountriesResponse, '/countries');

    expect(requestHeader(0, 'Authorization')).toBe('Bearer access-1');
  });

  test('omits the bearer token on public endpoints (auth: false), even when signed in', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { countries: [] }));

    await apiFetch(CountriesResponse, '/countries', { auth: false });

    expect(requestHeader(0, 'Authorization')).toBeNull();
  });

  test('serialises a body as JSON with the matching content type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { countries: [] }));

    await apiFetch(CountriesResponse, '/countries', {
      method: 'POST',
      body: { q: 'ro' },
      auth: false,
    });

    expect(requestInit(0).method).toBe('POST');
    expect(requestInit(0).body).toBe('{"q":"ro"}');
    expect(requestHeader(0, 'Content-Type')).toBe('application/json');
  });

  test('accepts an empty 204 body when the schema allows nothing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204, undefined));

    await expect(
      apiFetch(z.undefined(), '/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });

  test('tolerates a base URL with a trailing slash', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.test/';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { countries: [] }));

    await apiFetch(CountriesResponse, '/countries');

    expect(requestUrl(0)).toBe('https://api.test/v1/countries');
  });
});

describe('apiFetch — failures', () => {
  test('a body that does not match the contract is a thrown INVALID_RESPONSE, reported to Sentry, never returned', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { countries: [{ id: 'nope' }] }));

    const failure = apiFetch(CountriesResponse, '/countries');

    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({
      status: 200,
      error: { code: 'INVALID_RESPONSE' },
    });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  test('a non-2xx with the contract error shape surfaces its code and message', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: { code: 'EMAIL_TAKEN', message: 'That email already has an account.' },
      }),
    );

    await expect(
      apiFetch(AuthTokens, '/auth/register', { method: 'POST' }),
    ).rejects.toMatchObject({
      status: 409,
      error: { code: 'EMAIL_TAKEN', message: 'That email already has an account.' },
    });
  });

  test('a non-2xx with an unrecognised body becomes UNKNOWN with a human message', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    );

    const failure = apiFetch(CountriesResponse, '/countries');

    await expect(failure).rejects.toMatchObject({
      status: 502,
      error: { code: 'UNKNOWN' },
    });
    await expect(failure).rejects.toHaveProperty('message', expect.stringMatching(/\w+/));
  });

  test('a network failure becomes status 0 / NETWORK, not a raw TypeError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 0,
      error: { code: 'NETWORK' },
    });
  });

  test('a missing EXPO_PUBLIC_API_URL fails loudly before any request is made', async () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 0,
      error: { code: 'CONFIG' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('ApiRequestError is a real Error with the server message as its message', () => {
    const error = new ApiRequestError(404, {
      code: 'TRIP_NOT_FOUND',
      message: 'Trip does not exist or you do not have access.',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiRequestError');
    expect(error.message).toBe('Trip does not exist or you do not have access.');
    expect(error.code).toBe('TRIP_NOT_FOUND');
  });
});

describe('apiFetch — refresh on 401 (FR-003)', () => {
  const unauthorised = () =>
    jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in again.' } });

  test('refreshes once, persists the new pair, and retries with the new access token', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { countries: [] }));

    await apiFetch(CountriesResponse, '/countries');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestUrl(1)).toBe('https://api.test/v1/auth/refresh');
    expect(requestInit(1).body).toBe('{"refresh_token":"refresh-1"}');
    expect(requestHeader(1, 'Authorization')).toBeNull();
    expect(requestHeader(2, 'Authorization')).toBe('Bearer access-2');
    await expect(getSession()).resolves.toMatchObject({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  test('concurrent 401s share a single refresh call', async () => {
    let releaseRefresh: (response: Response) => void = () => undefined;
    const refresh = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) return refresh;
      const token = new Headers(init?.headers).get('Authorization');
      return token === 'Bearer access-2'
        ? jsonResponse(200, { countries: [] })
        : unauthorised();
    });

    const first = apiFetch(CountriesResponse, '/countries');
    const second = apiFetch(CountriesResponse, '/countries');
    // Let both first attempts reach their 401 before the refresh resolves.
    await new Promise((resolve) => setTimeout(resolve, 0));
    releaseRefresh(
      jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2' }),
    );

    await Promise.all([first, second]);

    const refreshCalls = fetchMock.mock.calls.filter(([input]) =>
      String(input).endsWith('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
  });

  test('a refresh the server refuses clears the keychain, signs the session out, and throws SESSION_EXPIRED', async () => {
    fetchMock.mockResolvedValueOnce(unauthorised()).mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: 'REFRESH_REUSED', message: 'Token reused.' },
      }),
    );

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 401,
      error: { code: 'SESSION_EXPIRED' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(getSession()).resolves.toBeNull();
    expect(useSessionStore.getState()).toMatchObject({
      status: 'signed-out',
      user: null,
    });
  });

  test('a refresh that fails on the network does NOT sign out — offline is not revoked', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockRejectedValueOnce(new TypeError('Network request failed'));

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 0,
      error: { code: 'NETWORK' },
    });
    await expect(getSession()).resolves.not.toBeNull();
    expect(useSessionStore.getState().status).toBe('signed-in');
  });

  test('a 401 with no stored session is surfaced as-is with no refresh attempt', async () => {
    secureStore.__reset();
    fetchMock.mockResolvedValueOnce(unauthorised());

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 401,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a 401 on a public endpoint is not a refresh trigger', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: "That email and password don't match.",
        },
      }),
    );

    await expect(
      apiFetch(AuthTokens, '/auth/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('a second 401 after a successful refresh is surfaced, not retried forever', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'access-2', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(unauthorised());

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('a refresh response that violates the contract signs out rather than storing garbage', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorised())
      .mockResolvedValueOnce(jsonResponse(200, { access_token: '' }));

    await expect(apiFetch(CountriesResponse, '/countries')).rejects.toMatchObject({
      error: { code: 'SESSION_EXPIRED' },
    });
    await expect(getSession()).resolves.toBeNull();
    expect(secureStore.getItemAsync).toHaveBeenCalledWith(
      SECURE_KEYS.refreshToken,
      expect.anything(),
    );
  });
});
