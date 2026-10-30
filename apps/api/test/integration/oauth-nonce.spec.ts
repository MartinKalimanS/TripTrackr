import type { NestExpressApplication } from '@nestjs/platform-express';
import { OAuthNonceResponse } from '@triptrackr/contracts';
import { createHash } from 'node:crypto';
import request from 'supertest';

import { bootTestApp } from '../support/app';
import { apiSql, migrationSql } from '../support/db';

/**
 * Server-issued sign-in nonces against the real database (spec 012; migration 0016).
 *
 * The behaviour that matters is in the database, not the service: a nonce is good exactly once,
 * an expired one is the same answer as an unknown one, the API role cannot read or write the table
 * except through the two keyholes, and only a hash is stored.
 */
describe('oauth nonces', () => {
  let app: NestExpressApplication;
  const owner = migrationSql();
  const api = apiSql();
  const hash = (nonce: string) => createHash('sha256').update(nonce).digest('hex');

  beforeAll(async () => {
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app?.close();
    await owner.end();
    await api.end();
  });

  const issue = async () => {
    const response = await request(app.getHttpServer()).post('/v1/auth/oauth/nonce');
    expect(response.status).toBe(200);
    return OAuthNonceResponse.parse(response.body).nonce;
  };
  const consume = async (nonce: string) => {
    const [row] = await api<{ ok: boolean }[]>`
      SELECT auth_consume_oauth_nonce(${hash(nonce)}) AS ok
    `;
    return row?.ok;
  };

  it('issues a different 256-bit nonce each time, and stores only its hash', async () => {
    const first = await issue();
    const second = await issue();

    expect(first).not.toBe(second);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    const stored = await owner<{ nonce_hash: string }[]>`
      SELECT nonce_hash FROM oauth_nonces WHERE nonce_hash IN (${hash(first)}, ${first})
    `;
    expect(stored.map((row) => row.nonce_hash)).toEqual([hash(first)]);
  });

  it('is good exactly once', async () => {
    const nonce = await issue();

    expect(await consume(nonce)).toBe(true);
    expect(await consume(nonce)).toBe(false);
  });

  it('answers an unknown nonce and an expired one alike', async () => {
    const nonce = await issue();
    await owner`UPDATE oauth_nonces SET expires_at = now() - interval '1 second' WHERE nonce_hash = ${hash(nonce)}`;

    expect(await consume(nonce)).toBe(false);
    expect(await consume('never-issued-nonce-000000000')).toBe(false);
  });

  it('removes expired rows whenever a nonce is issued', async () => {
    const stale = await issue();
    await owner`UPDATE oauth_nonces SET expires_at = now() - interval '1 hour' WHERE nonce_hash = ${hash(stale)}`;

    await issue();

    const left =
      await owner`SELECT 1 FROM oauth_nonces WHERE nonce_hash = ${hash(stale)}`;
    expect(left).toHaveLength(0);
  });

  it('is unreadable and unwritable by the API role except through the keyholes', async () => {
    const nonce = await issue();

    const visible = await api`SELECT nonce_hash FROM oauth_nonces`;
    await expect(
      api`INSERT INTO oauth_nonces (nonce_hash, expires_at) VALUES ('x', now() + interval '1 hour')`,
    ).rejects.toThrow();
    const deleted =
      await api`DELETE FROM oauth_nonces WHERE nonce_hash = ${hash(nonce)} RETURNING 1`;

    // Row-level security hides every row from reads and deletes (nothing to see, nothing to touch).
    expect(visible).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    expect(await consume(nonce)).toBe(true);
  });
});
