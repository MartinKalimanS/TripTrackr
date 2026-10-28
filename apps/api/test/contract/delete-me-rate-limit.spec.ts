import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { DELETE_ME_RATE_LIMIT } from '@/modules/users/deletion.service';

import { bearer, bootTestApp, registerTraveller } from '../support/app';
import { InMemoryRedis } from '../support/redis-stub';

/**
 * `DELETE /me` is a place to guess a password with a valid access token (feature 008;
 * FR-071), so it has its own small ceiling. Redis is the `InMemoryRedis` stand-in, as in the
 * login suite: a limiter with nothing to count in cannot be shown to engage.
 */
describe('DELETE /me rate limiting', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await bootTestApp({ redis: new InMemoryRedis().asClient() });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('stops wrong-password guesses after a handful, and never deletes anything', async () => {
    const traveller = await registerTraveller(app);
    const attempt = () =>
      request(app.getHttpServer())
        .delete('/v1/me')
        .set(bearer(traveller.tokens.access_token))
        .send({ password: 'not the password at all' });

    for (let tried = 0; tried < DELETE_ME_RATE_LIMIT.limit; tried += 1) {
      expect((await attempt()).status).toBe(403);
    }
    const limited = await attempt();
    expect(limited.status).toBe(429);

    // Even the right password is refused while the ceiling holds: the guess cannot be
    // retried through it.
    const correct = await request(app.getHttpServer())
      .delete('/v1/me')
      .set(bearer(traveller.tokens.access_token))
      .send({ password: traveller.password });
    expect(correct.status).toBe(429);
  });
});
