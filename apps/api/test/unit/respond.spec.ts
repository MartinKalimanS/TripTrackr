import { MeResponse, UserProfile } from '@triptrackr/contracts';

import { resetEnvCache } from '@/common/config/env.schema';
import {
  respond,
  ResponseContractViolation,
  violationTelemetry,
} from '@/common/validation/respond';

import { applyUnitTestEnv } from '../support/env';

/**
 * Outbound validation against the shared contracts.
 *
 * `UserProfile` is strict so that "a serialiser that leaks `password_hash` ...
 * fails the contract test rather than the traveller" (contracts/api/auth.ts).
 * That sentence is only true if something actually runs the schema against
 * the body on its way out; this is that something. The failure is loud in
 * every environment — the request 500s — and in production it is also
 * reported to Sentry. Fail-closed is the only posture consistent with
 * Constitution I: a body that carries a field the contract forbids is a
 * disclosure, and a 500 is recoverable where a leak is not.
 */

const profile: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'a@example.test',
  display_name: 'Traveller A',
  avatar_url: null,
  bio: null,
  home_currency: 'CHF',
  is_profile_public: false,
  email_verified_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
};

describe('respond', () => {
  afterEach(() => {
    resetEnvCache();
    jest.restoreAllMocks();
  });

  it('returns a body the contract accepts', () => {
    applyUnitTestEnv();

    const body = respond(UserProfile, profile);

    expect(body).toEqual(profile);
  });

  it('throws outside production when the body leaks a field the contract forbids', () => {
    applyUnitTestEnv();
    const leaking = { ...profile, password_hash: '$argon2id$...' };

    expect(() => respond(UserProfile, leaking as unknown as UserProfile)).toThrow(
      ResponseContractViolation,
    );
  });

  it('throws outside production when a nested field is wrong', () => {
    applyUnitTestEnv();
    const wrong = {
      user: profile,
      stats: { countries_visited: -1, total_distance_km: 0, trips_held: 0 },
    };

    expect(() => respond(MeResponse, wrong)).toThrow(ResponseContractViolation);
  });

  it('names the schema and the paths in the error, never the values', () => {
    applyUnitTestEnv();
    const leaking = { ...profile, password_hash: 'super-secret-hash' };

    let message = '';
    try {
      respond(UserProfile, leaking as unknown as UserProfile);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(/password_hash/);
    expect(message).not.toMatch(/super-secret-hash/);
    expect(message).not.toMatch(/a@example\.test/);
  });

  it('in production, reports to Sentry AND refuses to answer — fail closed (Constitution I)', () => {
    applyUnitTestEnv({ NODE_ENV: 'production' });
    const capture = jest
      .spyOn(violationTelemetry, 'capture')
      .mockImplementation(() => undefined);
    const leaking = { ...profile, password_hash: 'super-secret-hash' };

    expect(() => respond(UserProfile, leaking as unknown as UserProfile)).toThrow(
      ResponseContractViolation,
    );
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0]?.[0]).toBeInstanceOf(ResponseContractViolation);
    expect(capture.mock.calls[0]?.[0].message).toMatch(/password_hash/);
    expect(capture.mock.calls[0]?.[0].message).not.toMatch(/super-secret-hash/);
  });

  it('outside production, does not report to Sentry — the red test suite is the report', () => {
    applyUnitTestEnv();
    const capture = jest
      .spyOn(violationTelemetry, 'capture')
      .mockImplementation(() => undefined);

    expect(() => respond(UserProfile, { ...profile, bio: 'x'.repeat(501) })).toThrow(
      ResponseContractViolation,
    );
    expect(capture).not.toHaveBeenCalled();
  });
});
