import { JwtService } from '@nestjs/jwt';
import type { TransactionSql } from 'postgres';

import { resetEnvCache } from '@/common/config/env.schema';
import { runInRlsContext } from '@/common/rls/rls-context';
import {
  hashToken,
  TokenService,
  toPostgresInterval,
} from '@/modules/auth/token.service';

import { applyUnitTestEnv } from '../support/env';

/**
 * Rotation and reuse detection (FR-005, contracts/rest-api.md §1), against a
 * scripted transaction.
 *
 * What is under test here is the *decision* the service makes from what the
 * database tells it — mint, refuse, or revoke the family. The atomicity of the
 * consume itself is a property of `auth_consume_refresh_token` (0007) and is
 * proven against a real PostgreSQL in test/integration/refresh-rotation.spec.ts;
 * a mock cannot say anything true about a row lock.
 */

interface ConsumeRow {
  readonly id: string;
  readonly user_id: string;
  readonly expired: boolean;
  readonly reused: boolean;
}

interface ScriptedTx {
  readonly tx: TransactionSql;
  /** Every statement issued, in order, with its bound values. */
  readonly calls: { readonly sql: string; readonly values: unknown[] }[];
}

/**
 * A tagged-template stand-in for the request transaction. Routes on the
 * function name in the statement text, because that is the only thing the
 * service is allowed to call (0006: "every statement calls an auth_* function
 * rather than touching a table").
 */
function scriptedTx(consumeResult: ConsumeRow[]): ScriptedTx {
  const calls: ScriptedTx['calls'] = [];

  const tx = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    const sql = strings.join('?');
    calls.push({ sql, values });

    if (sql.includes('auth_consume_refresh_token')) return Promise.resolve(consumeResult);
    if (sql.includes('auth_insert_refresh_token'))
      return Promise.resolve([{ id: 'new-id' }]);
    if (sql.includes('auth_revoke_refresh_tokens')) return Promise.resolve([{ n: 1 }]);

    return Promise.reject(new Error(`Unexpected statement: ${sql}`));
  };

  return { tx: tx as unknown as TransactionSql, calls };
}

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OLD_TOKEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('TokenService.rotate', () => {
  let service: TokenService;

  beforeEach(() => {
    applyUnitTestEnv();
    service = new TokenService(new JwtService({}));
  });

  afterAll(() => resetEnvCache());

  function rotate(script: ScriptedTx, presented = 'presented-token') {
    return runInRlsContext({ tx: script.tx, userId: null }, () =>
      service.rotate(presented),
    );
  }

  it('mints a new pair when the token is consumed for the first time', async () => {
    // Arrange
    const script = scriptedTx([
      { id: OLD_TOKEN_ID, user_id: USER_ID, expired: false, reused: false },
    ]);

    // Act
    const outcome = await rotate(script);

    // Assert — a pair, and the new refresh token is linked to the one it retires.
    expect(outcome.status).toBe('rotated');
    const pair = outcome.status === 'rotated' ? outcome.pair : undefined;
    expect(pair?.accessToken.split('.')).toHaveLength(3);
    expect(pair?.refreshToken).toHaveLength(43); // 32 bytes, base64url

    const insert = script.calls.find((c) => c.sql.includes('auth_insert_refresh_token'));
    expect(insert?.values).toContain(USER_ID);
    expect(insert?.values).toContain(OLD_TOKEN_ID);

    expect(script.calls.some((c) => c.sql.includes('auth_revoke_refresh_tokens'))).toBe(
      false,
    );
  });

  it('consumes with the hash of the presented token, never the token itself', async () => {
    const script = scriptedTx([]);
    await rotate(script, 'the-plaintext');

    const consume = script.calls.find((c) =>
      c.sql.includes('auth_consume_refresh_token'),
    );
    expect(consume?.values).toEqual([hashToken('the-plaintext')]);
    expect(consume?.values).not.toContain('the-plaintext');
  });

  it('revokes the whole family when the token was already retired (FR-005)', async () => {
    // Arrange — the database says: I know this hash, and it was already consumed.
    const script = scriptedTx([
      { id: OLD_TOKEN_ID, user_id: USER_ID, expired: false, reused: true },
    ]);

    // Act
    const outcome = await rotate(script);

    // Assert — nothing minted, everything for this account revoked, and the
    // outcome named so the device can tell its owner why it was signed out.
    expect(outcome).toEqual({ status: 'reused' });

    const revoke = script.calls.find((c) => c.sql.includes('auth_revoke_refresh_tokens'));
    expect(revoke?.values).toEqual([USER_ID]);
    expect(script.calls.some((c) => c.sql.includes('auth_insert_refresh_token'))).toBe(
      false,
    );
  });

  it('refuses an unknown token without revoking anything', async () => {
    // Arrange — no row at all: there is no family to punish.
    const script = scriptedTx([]);

    // Act
    const outcome = await rotate(script);

    // Assert
    expect(outcome).toEqual({ status: 'rejected' });
    expect(script.calls).toHaveLength(1);
    expect(script.calls[0]?.sql).toContain('auth_consume_refresh_token');
  });

  it('refuses an expired token without minting', async () => {
    // Arrange — consumed (so it cannot be replayed) but past its lifetime.
    const script = scriptedTx([
      { id: OLD_TOKEN_ID, user_id: USER_ID, expired: true, reused: false },
    ]);

    // Act
    const outcome = await rotate(script);

    // Assert
    expect(outcome).toEqual({ status: 'rejected' });
    expect(script.calls.some((c) => c.sql.includes('auth_insert_refresh_token'))).toBe(
      false,
    );
    expect(script.calls.some((c) => c.sql.includes('auth_revoke_refresh_tokens'))).toBe(
      false,
    );
  });

  it('refuses unknown and expired tokens identically', async () => {
    // FR-072: the caller must not be able to tell which of these two refusals it
    // received. Reuse is the deliberate exception — see the rotate() comment.
    const results = await Promise.all([
      rotate(scriptedTx([])),
      rotate(
        scriptedTx([
          { id: OLD_TOKEN_ID, user_id: USER_ID, expired: true, reused: false },
        ]),
      ),
    ]);

    expect(results).toEqual([{ status: 'rejected' }, { status: 'rejected' }]);
  });
});

describe('TokenService access tokens', () => {
  beforeEach(() => applyUnitTestEnv());
  afterAll(() => resetEnvCache());

  it('signs with HS256 and nothing else', async () => {
    // Arrange
    const service = new TokenService(new JwtService({}));

    // Act
    const token = await service.issueAccessToken(USER_ID);
    const header = JSON.parse(
      Buffer.from(token.split('.')[0] ?? '', 'base64url').toString('utf8'),
    ) as { alg: string };

    // Assert — a pinned algorithm on both sides is what closes the
    // `alg: none` / RS-to-HS confusion family of attacks.
    expect(header.alg).toBe('HS256');
  });

  it('is verifiable with the access secret and carries the subject', async () => {
    const jwt = new JwtService({});
    const service = new TokenService(jwt);
    const token = await service.issueAccessToken(USER_ID);

    const claims = await jwt.verifyAsync<{ sub: string }>(token, {
      secret: 'x'.repeat(32),
      algorithms: ['HS256'],
    });

    expect(claims.sub).toBe(USER_ID);
  });
});

describe('toPostgresInterval', () => {
  it.each([
    ['30d', '30 days'],
    ['12h', '12 hours'],
    ['15m', '15 minutes'],
    ['45s', '45 seconds'],
  ])('converts %s to %s', (input, expected) => {
    expect(toPostgresInterval(input)).toBe(expected);
  });

  it('rejects a value PostgreSQL would silently misread', () => {
    expect(() => toPostgresInterval('30 days')).toThrow(/Token TTL/);
    expect(() => toPostgresInterval('1w')).toThrow(/Token TTL/);
  });
});
