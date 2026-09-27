import { JwtService } from '@nestjs/jwt';
import { EventEmitter } from 'node:events';

import { RlsSessionMiddleware } from '@/common/rls/rls-session.middleware';

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
 */

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

  it('rolls back when the client hangs up before a response is decided', async () => {
    const { sql, events } = fakeSql();
    const res = fakeResponse(events);

    await middleware(sql).use(req, res as never, () => {
      res.emit('close');
    });

    expect(events).toEqual(['begin']);
    expect(res.sent).toEqual([]);
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
