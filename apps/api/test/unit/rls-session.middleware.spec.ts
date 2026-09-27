import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter } from 'node:events';

import { ACCESS_TOKEN_ALGORITHM } from '@/common/auth/token-algorithm';
import { loadEnv, resetEnvCache } from '@/common/config/env.schema';
import { getCurrentUserId, requireRlsTransaction } from '@/common/rls/rls-context';
import { HeldResponse, RlsSessionMiddleware } from '@/common/rls/rls-session.middleware';

import { applyUnitTestEnv } from '../support/env';

/**
 * The request transaction and the response — the ordering guarantee behind
 * every read-your-writes in the API (contracts/data-access-policy.md §1).
 *
 * The bug this pins: the transaction used to COMMIT on the response's
 * `finish` event, i.e. after the bytes had left. A client that received its
 * 201 and immediately asked for the row could arrive before the COMMIT and be
 * told it did not exist — which is exactly what the integration suites did
 * under load. Now the final write is held until PostgreSQL has answered the
 * COMMIT; a 5xx still rolls back; a client that hangs up before a response is
 * decided still rolls back; and a COMMIT that fails after a success was
 * decided becomes a 500, because nothing has been sent yet.
 *
 * Around that ordering, the rest of the middleware's promises (§1; research
 * D-03; FR-072): who is asking comes from a verified access token alone and is
 * set with `set_config(..., true)` as a bind parameter, while an empty subject
 * or an unverifiable token sets nothing at all, so the policies fail closed. A
 * hang-up is final even if the handler answers afterwards. A response decided
 * before the pipeline ran still settles the transaction rather than leaving it
 * open. A COMMIT that fails once the head has left destroys the connection
 * rather than let a success stand, and one that fails with a non-Error is still
 * a generic 500. The held write goes out exactly once, whatever else is called.
 */

/** Nest's logger, captured rather than printed — a failed COMMIT logs by design. */
let loggedErrors: jest.SpiedFunction<Logger['error']>;

beforeEach(() => {
  loggedErrors = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
});

afterEach(() => {
  loggedErrors.mockRestore();
});

/** A `sql.begin` whose COMMIT the test controls. */
function fakeSql() {
  const events: string[] = [];
  let finishCommit: (() => void) | null = null;
  const sql = {
    begin: async (fn: (tx: unknown) => Promise<void>) => {
      // The tagged template `tx\`…\`` for set_config.
      const tx = () => Promise.resolve(undefined);
      events.push('begin');
      await fn(tx);
      events.push('commit:start');
      await new Promise<void>((resolve) => {
        finishCommit = resolve;
      });
      events.push('commit:done');
    },
  };
  return {
    sql,
    events,
    releaseCommit: () => finishCommit?.(),
  } as unknown as {
    sql: { begin: unknown };
    events: string[];
    releaseCommit: () => void;
  };
}

function fakeResponse(events: string[]) {
  const res = new EventEmitter() as EventEmitter & {
    statusCode: number;
    writableEnded: boolean;
    headersSent: boolean;
    end: (...args: unknown[]) => unknown;
    status: (code: number) => unknown;
    setHeader: (name: string, value: string) => void;
    removeHeader: (name: string) => void;
    destroy: () => void;
    sent: unknown[][];
  };
  res.statusCode = 200;
  res.writableEnded = false;
  res.headersSent = false;
  res.sent = [];
  res.end = (...args: unknown[]) => {
    res.writableEnded = true;
    res.headersSent = true;
    res.sent.push(args);
    events.push('end');
    return res;
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = () => undefined;
  res.removeHeader = () => undefined;
  res.destroy = () => undefined;
  return res;
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('RlsSessionMiddleware — the response waits for COMMIT', () => {
  const req = { headers: {} } as never;

  function middleware(sql: unknown) {
    return new RlsSessionMiddleware(
      sql as never,
      { verifyAsync: jest.fn() } as unknown as JwtService,
    );
  }

  it('holds a 2xx until the COMMIT has returned, then sends exactly what the handler decided', async () => {
    const { sql, events, releaseCommit } = fakeSql();
    const res = fakeResponse(events);

    const pending = middleware(sql).use(req, res as never, () => {
      // The handler answers while the transaction is open.
      res.statusCode = 201;
      res.end('{"trip":{}}');
    });
    await flush();

    // Decided, COMMIT in flight — and NOTHING has gone out.
    expect(events).toEqual(['begin', 'commit:start']);
    expect(res.sent).toEqual([]);

    releaseCommit();
    await pending;

    expect(events).toEqual(['begin', 'commit:start', 'commit:done', 'end']);
    expect(res.sent).toEqual([['{"trip":{}}']]);
    expect(res.statusCode).toBe(201);
  });

  it('rolls back on a 5xx and still sends the response the filter decided', async () => {
    const { sql, events } = fakeSql();
    const res = fakeResponse(events);

    await middleware(sql).use(req, res as never, () => {
      res.statusCode = 500;
      res.end('{"error":{}}');
    });

    // No commit events: `begin` rejected before COMMIT started.
    expect(events).toEqual(['begin', 'end']);
    expect(res.sent).toEqual([['{"error":{}}']]);
  });

  it('rolls back when the client hangs up before a response is decided — once the handler has answered, never while it can still query', async () => {
    const events: string[] = [];
    const tx = () => {
      events.push('query');
      return Promise.resolve([]);
    };
    const sql = {
      begin: async (fn: (t: unknown) => Promise<void>) => {
        events.push('begin');
        try {
          await fn(tx);
        } catch (error) {
          events.push('rollback');
          throw error;
        }
        events.push('commit');
      },
    };
    const res = fakeResponse(events);
    let handlerDone: Promise<void> = Promise.resolve();

    await middleware(sql).use(req, res as never, () => {
      handlerDone = (async () => {
        res.emit('close'); // the client gives up mid-handler...
        await flush(); // ...while the handler is still awaiting something...
        await requireRlsTransaction()`SELECT 1`; // ...and then queries
        res.statusCode = 201;
        res.end('{"trip":{}}'); // Nest answers even when nobody is listening
      })();
    });
    await handlerDone;

    // A query after the ROLLBACK would run on whichever request borrowed the
    // connection next; it has to land inside the transaction or not at all.
    expect(events).toEqual(['begin', 'query', 'rollback', 'end']);
  });

  it('turns a failed COMMIT into a 500 rather than confirming a write that did not happen', async () => {
    const events: string[] = [];
    const sql = {
      begin: async (fn: (tx: unknown) => Promise<void>) => {
        await fn(() => Promise.resolve(undefined));
        events.push('commit:failed');
        throw new Error('could not serialize access');
      },
    };
    const res = fakeResponse(events);

    await middleware(sql).use(req, res as never, () => {
      res.statusCode = 201;
      res.end('{"trip":{}}');
    });

    expect(events).toEqual(['commit:failed', 'end']);
    expect(res.statusCode).toBe(500);
    expect(String(res.sent[0]?.[0])).toMatch(/INTERNAL_ERROR/);
    expect(String(res.sent[0]?.[0])).not.toMatch(/serialize/);
  });
});

const TRAVELLER = '11111111-1111-4111-8111-111111111111';

/** A `sql.begin` that commits at once, recording each statement run on its transaction. */
function recordingSql() {
  const statements: { text: string; values: unknown[] }[] = [];
  const tx = (strings: TemplateStringsArray, ...values: unknown[]) => {
    statements.push({ text: strings.join('$'), values });
    return Promise.resolve([]);
  };
  return { sql: { begin: (fn: (t: typeof tx) => Promise<void>) => fn(tx) }, statements };
}

/** A `sql.begin` whose COMMIT fails with `reason` once the handler has answered. */
function failingCommit(reason: unknown) {
  return {
    begin: async (fn: (tx: unknown) => Promise<void>) => {
      await fn(() => Promise.resolve(undefined));
      throw reason;
    },
  };
}

function middlewareWith(sql: unknown, verifyAsync: jest.Mock = jest.fn()) {
  return new RlsSessionMiddleware(sql as never, { verifyAsync } as unknown as JwtService);
}

describe('RlsSessionMiddleware — who is asking', () => {
  const bearer = (token: string) =>
    ({ headers: { authorization: `Bearer ${token}` } }) as never;

  beforeEach(() => {
    applyUnitTestEnv();
  });

  afterEach(() => {
    resetEnvCache();
  });

  it('sets the verified subject on the request transaction as a bind parameter, verified with the access secret and one algorithm', async () => {
    const { sql, statements } = recordingSql();
    const verifyAsync = jest.fn().mockResolvedValue({ sub: TRAVELLER });
    const res = fakeResponse([]);
    const seen: { traveller?: string | null } = {};

    await middlewareWith(sql, verifyAsync).use(
      bearer('access-token'),
      res as never,
      () => {
        seen.traveller = getCurrentUserId();
        res.end('{}');
      },
    );

    expect(verifyAsync).toHaveBeenCalledWith('access-token', {
      secret: loadEnv().JWT_ACCESS_SECRET,
      algorithms: [ACCESS_TOKEN_ALGORITHM],
    });
    expect(statements).toEqual([
      { text: "SELECT set_config('app.current_user_id', $, true)", values: [TRAVELLER] },
    ]);
    expect(seen.traveller).toBe(TRAVELLER);
  });

  const unverified: ReadonlyArray<{
    readonly token: string;
    readonly verify: () => Promise<unknown>;
  }> = [
    {
      token: 'a verified token with an empty subject',
      verify: () => Promise.resolve({ sub: '' }),
    },
    {
      token: 'a token that fails verification',
      verify: () => Promise.reject(new Error('jwt expired')),
    },
  ];

  it.each(unverified)(
    'gives $token no identity: nothing is set — not even an empty string',
    async ({ verify }) => {
      const { sql, statements } = recordingSql();
      const res = fakeResponse([]);
      const seen: { traveller?: string | null } = {};

      await middlewareWith(sql, jest.fn(verify)).use(
        bearer('token'),
        res as never,
        () => {
          seen.traveller = getCurrentUserId();
          res.end('{}');
        },
      );

      expect(statements).toEqual([]);
      expect(seen.traveller).toBeNull();
      // Not rejected here: turning "no identity" into a 401 is the guard's job.
      expect(res.sent).toEqual([['{}']]);
    },
  );
});

describe('RlsSessionMiddleware — when the response and the transaction disagree', () => {
  const req = { headers: {} } as never;

  it('treats a hang-up as final: an answer the handler decides afterwards does not resurrect the transaction', async () => {
    const { sql, events } = fakeSql();
    const res = fakeResponse(events);

    await middlewareWith(sql).use(req, res as never, () => {
      res.emit('close'); // the client gives up...
      res.statusCode = 201; // ...and the handler answers anyway
      res.end('{"trip":{}}');
    });

    // Rolled back — COMMIT never started — and only then was the late answer let go.
    expect(events).toEqual(['begin', 'end']);
  });

  it('parks nothing once the transaction has settled: a late write through a captured reference goes straight out', async () => {
    const { sql, events } = fakeSql();
    const res = fakeResponse(events);
    const captured: { end?: (...args: unknown[]) => unknown } = {};

    await middlewareWith(sql).use(req, res as never, () => {
      captured.end = res.end; // what a downstream wrapper (compression, say) keeps
      res.emit('close');
      res.end('{"answer":true}');
    });
    expect(res.sent).toEqual([['{"answer":true}']]);

    const returned = captured.end?.('{"late":true}');

    expect(res.sent).toEqual([['{"answer":true}'], ['{"late":true}']]);
    expect(returned).toBe(res);
  });

  it('settles at once on a response decided before the pipeline ran, rather than wait for a decision already made', async () => {
    const events: string[] = [];
    const res = fakeResponse(events);
    const sql = {
      begin: async (fn: (tx: unknown) => Promise<void>) => {
        events.push('begin');
        // Nothing in this API answers this early today. Were anything to — a
        // gateway timeout while BEGIN waits for a pooled connection, say — the
        // transaction must settle on that answer instead of staying open.
        res.statusCode = 503;
        res.end('{"error":{}}');
        await fn(() => Promise.resolve(undefined));
        events.push('commit');
      },
    };

    const handler = jest.fn();
    await middlewareWith(sql).use(req, res as never, handler);

    // A 5xx: rolled back, then released exactly as decided — and the handler
    // never ran against a transaction that was already settling.
    expect(events).toEqual(['begin', 'end']);
    expect(res.sent).toEqual([['{"error":{}}']]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('destroys the connection when the COMMIT fails after the head has gone out, rather than let a success stand', async () => {
    const res = fakeResponse([]);
    const destroy = jest.fn();
    res.destroy = destroy;

    await middlewareWith(failingCommit(new Error('could not serialize access'))).use(
      req,
      res as never,
      () => {
        res.headersSent = true; // a streamed write already sent the status line
        res.end('{"tail":true}');
      },
    );

    expect(destroy).toHaveBeenCalledTimes(1);
    // Neither the rest of the success nor a 500 body: the client sees a broken response.
    expect(res.sent).toEqual([]);
    expect(loggedErrors).toHaveBeenCalledWith(
      'Request transaction failed to commit: could not serialize access',
      expect.stringContaining('could not serialize access'),
    );
  });

  it('still answers a generic 500 when the COMMIT fails with something that is not an Error, logged without a stack', async () => {
    const res = fakeResponse([]);

    await middlewareWith(failingCommit('connection reset by peer')).use(
      req,
      res as never,
      () => {
        res.statusCode = 201;
        res.end('{"trip":{}}');
      },
    );

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(String(res.sent[0]?.[0]))).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong on our side. Please try again.',
      },
    });
    expect(loggedErrors).toHaveBeenCalledWith(
      'Request transaction failed to commit: connection reset by peer',
      undefined,
    );
  });
});

describe('HeldResponse', () => {
  it('sends the decided response once — a second release, or a fail after it, changes nothing', () => {
    const res = fakeResponse([]);
    const destroy = jest.fn();
    res.destroy = destroy;
    const held = new HeldResponse(res as never);
    res.statusCode = 201;
    res.end('{"trip":{}}');

    held.release();
    held.release();
    held.fail();

    expect(res.sent).toEqual([['{"trip":{}}']]);
    expect(res.statusCode).toBe(201);
    // A response that has already gone out is not torn down after the fact.
    expect(destroy).not.toHaveBeenCalled();
  });

  it('never follows the 500 of a failed COMMIT with the success it replaced', () => {
    const res = fakeResponse([]);
    const held = new HeldResponse(res as never);
    res.statusCode = 201;
    res.end('{"trip":{}}');

    held.fail();
    held.release();

    expect(res.statusCode).toBe(500);
    expect(res.sent).toHaveLength(1);
    expect(String(res.sent[0]?.[0])).toMatch(/INTERNAL_ERROR/);
  });
});
