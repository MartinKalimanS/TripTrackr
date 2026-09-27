import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiError, RefreshedTokens } from '@triptrackr/contracts';
import request from 'supertest';

import { bearer, bootTestApp, registerTraveller } from '../support/app';

/**
 * Contract test 2 (rest-api.md §1, FR-005): a rotated refresh token, replayed,
 * revokes the whole family.
 *
 * Through HTTP, end to end. The SQL race underneath — two presentations in the
 * same instant — is proven at the function level in
 * test/integration/refresh-rotation.spec.ts; this file proves the *contract*:
 * what a device holding a retired token is told, and what happens to every
 * other token in the chain when it asks.
 */
describe('contract 2 — refresh rotation and reuse detection', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const refresh = (refreshToken: string) =>
    request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: refreshToken });

  it('rotates: the presented token is retired and a fresh pair comes back without the profile', async () => {
    // Arrange
    const { tokens } = await registerTraveller(app);

    // Act
    const response = await refresh(tokens.refresh_token);

    // Assert
    expect(response.status).toBe(200);
    const rotated = RefreshedTokens.parse(response.body);
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    expect(rotated.access_token).not.toBe(tokens.access_token);
    expect(response.body).not.toHaveProperty('user');
  });

  it('revokes the entire family when a rotated token is presented again (FR-005)', async () => {
    // Arrange — R1 is rotated into R2 legitimately.
    const { tokens } = await registerTraveller(app);
    const r1 = tokens.refresh_token;
    const second = await refresh(r1);
    const r2 = RefreshedTokens.parse(second.body).refresh_token;

    // Act — R1 comes back. Whoever holds it, the chain is compromised.
    const replay = await refresh(r1);

    // Assert — refused, and named for what it is: the holder of this device may
    // be the account owner, and FR-005 requires them to be told.
    expect(replay.status).toBe(401);
    expect(ApiError.safeParse(replay.body).success).toBe(true);
    expect(replay.body).toMatchObject({ error: { code: 'REFRESH_TOKEN_REUSED' } });

    // And R2 — the *legitimate* successor — is dead too. Inconveniencing the
    // owner is the correct trade when the alternative is an attacker holding a
    // live chain.
    const successor = await refresh(r2);
    expect(successor.status).toBe(401);
  });

  it('refuses a token it has never issued, without revoking anything', async () => {
    // Arrange
    const { tokens } = await registerTraveller(app);

    // Act
    const unknown = await refresh('never-issued-'.repeat(3));

    // Assert — a 401 in the envelope, and the real token still works.
    expect(unknown.status).toBe(401);
    expect(ApiError.safeParse(unknown.body).success).toBe(true);
    expect(unknown.body).not.toMatchObject({ error: { code: 'REFRESH_TOKEN_REUSED' } });

    const stillLive = await refresh(tokens.refresh_token);
    expect(stillLive.status).toBe(200);
  });

  it('rejects a malformed body in the validation envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refresh_token: '', extra: true });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  describe('sign out (FR-004)', () => {
    it('POST /auth/logout retires exactly the presented refresh token', async () => {
      // Arrange — two devices: the registration pair, and a second pair from a
      // login.
      const traveller = await registerTraveller(app);
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: traveller.email, password: traveller.password });
      const otherDevice = login.body as { access_token: string; refresh_token: string };

      // Act — sign out the first device only.
      const logout = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set(bearer(traveller.tokens.access_token))
        .send({ refresh_token: traveller.tokens.refresh_token });

      // Assert — the other device is untouched. Checked first: a retired token
      // that is *presented* afterwards is treated as reuse and revokes the
      // family (token.service.ts), which would make the order of these two
      // requests the thing under test rather than the sign-out.
      expect(logout.status).toBe(204);
      expect(logout.body).toEqual({});

      const survivor = await refresh(otherDevice.refresh_token);
      expect(survivor.status).toBe(200);

      const retired = await refresh(traveller.tokens.refresh_token);
      expect(retired.status).toBe(401);
    });

    it('POST /auth/logout-all retires every refresh token for the account', async () => {
      // Arrange
      const traveller = await registerTraveller(app);
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: traveller.email, password: traveller.password });
      const otherDevice = login.body as { refresh_token: string };

      // Act
      const logoutAll = await request(app.getHttpServer())
        .post('/v1/auth/logout-all')
        .set(bearer(traveller.tokens.access_token))
        .send();

      // Assert
      expect(logoutAll.status).toBe(204);

      const first = await refresh(traveller.tokens.refresh_token);
      const second = await refresh(otherDevice.refresh_token);
      expect(first.status).toBe(401);
      expect(second.status).toBe(401);
    });

    it('needs a valid access token — signing someone out is an authenticated act', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refresh_token: 'anything' });

      expect(response.status).toBe(401);
    });
  });
});
