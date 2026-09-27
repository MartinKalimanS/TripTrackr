import type { TransactionSql } from 'postgres';

import {
  asAuthenticated,
  getCurrentUserId,
  getRlsContext,
  requireCurrentUserId,
  requireRlsTransaction,
  runInRlsContext,
} from '@/common/rls/rls-context';

/**
 * Who is asking, and on which transaction — the JavaScript half of session
 * establishment (contracts/data-access-policy.md §1, research D-03).
 *
 * `app.current_user_id` is set with SET LOCAL, so it exists only inside the
 * request's transaction, and the policies fail closed without it. These pin the
 * same posture on this side of the driver: code that runs outside the request's
 * transaction, or that assumes a traveller nobody established, gets a named
 * error at the line that made the mistake. It never falls back to the pool and
 * never defaults an identity. Concurrent requests never see each other's
 * transaction or traveller. `asAuthenticated` (login, registration, OAuth) may
 * change who the request is, but only on the *same* transaction, through a bind
 * parameter, after PostgreSQL has accepted it, and only for its callback.
 */

const TRAVELLER_A = '11111111-1111-4111-8111-111111111111';
const TRAVELLER_B = '22222222-2222-4222-8222-222222222222';

interface Statement {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A request transaction that records each tagged-template statement it runs. */
function fakeTransaction(answer: () => Promise<unknown> = () => Promise.resolve([])) {
  const statements: Statement[] = [];
  const tx = (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> => {
    statements.push({ text: strings.join('$'), values });
    return answer();
  };
  return { tx: tx as unknown as TransactionSql, statements };
}

/** Lets other queued work run, so two request contexts genuinely interleave. */
const yieldToOthers = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('rls-context outside a request', () => {
  it('has no context and no traveller, and refuses to hand out a transaction or an identity', () => {
    expect(getRlsContext()).toBeNull();
    expect(getCurrentUserId()).toBeNull();
    expect(() => requireRlsTransaction()).toThrow(/No RLS transaction is open/);
    expect(() => requireCurrentUserId()).toThrow(/No authenticated traveller/);
  });

  it('will not become a traveller without the request transaction — it never opens one of its own', async () => {
    const readProfile = jest.fn(() => Promise.resolve('profile'));

    await expect(asAuthenticated(TRAVELLER_A, readProfile)).rejects.toThrow(
      /No RLS transaction is open/,
    );
    expect(readProfile).not.toHaveBeenCalled();
  });
});

describe('rls-context inside a request', () => {
  it('yields the transaction and traveller the middleware established — and nothing once the request settles', async () => {
    const { tx } = fakeTransaction();

    await runInRlsContext({ tx, userId: TRAVELLER_A }, () => {
      expect(getRlsContext()).toEqual({ tx, userId: TRAVELLER_A });
      expect(requireRlsTransaction()).toBe(tx);
      expect(requireCurrentUserId()).toBe(TRAVELLER_A);
      return Promise.resolve();
    });

    expect(getRlsContext()).toBeNull();
  });

  it('gives an anonymous request its transaction but no traveller — null, never a default', () => {
    const { tx } = fakeTransaction();

    return runInRlsContext({ tx, userId: null }, () => {
      expect(requireRlsTransaction()).toBe(tx);
      expect(getCurrentUserId()).toBeNull();
      expect(() => requireCurrentUserId()).toThrow(/No authenticated traveller/);
      return Promise.resolve();
    });
  });

  it('keeps concurrent requests apart — each sees only its own transaction and traveller', async () => {
    const a = fakeTransaction();
    const b = fakeTransaction();
    const observe = async () => {
      await yieldToOthers();
      return { tx: requireRlsTransaction(), traveller: getCurrentUserId() };
    };

    const [seenA, seenB] = await Promise.all([
      runInRlsContext({ tx: a.tx, userId: TRAVELLER_A }, observe),
      runInRlsContext({ tx: b.tx, userId: TRAVELLER_B }, observe),
    ]);

    expect(seenA.tx).toBe(a.tx);
    expect(seenA.traveller).toBe(TRAVELLER_A);
    expect(seenB.tx).toBe(b.tx);
    expect(seenB.traveller).toBe(TRAVELLER_B);
  });
});

describe('asAuthenticated', () => {
  it('becomes the verified traveller on the same transaction, through a bind parameter, for its callback only', async () => {
    const { tx, statements } = fakeTransaction();

    const outcome = await runInRlsContext({ tx, userId: null }, async () => {
      const inside = await asAuthenticated(TRAVELLER_A, () =>
        Promise.resolve({
          transaction: requireRlsTransaction(),
          traveller: requireCurrentUserId(),
        }),
      );
      return { inside, afterwards: getCurrentUserId() };
    });

    // The id travels as a value, never as SQL text; `true` is SET LOCAL's scope.
    expect(statements).toEqual([
      {
        text: "SELECT set_config('app.current_user_id', $, true)",
        values: [TRAVELLER_A],
      },
    ]);
    expect(outcome.inside.transaction).toBe(tx);
    expect(outcome.inside.traveller).toBe(TRAVELLER_A);
    expect(outcome.afterwards).toBeNull();
  });

  it('does not run as a traveller PostgreSQL refused to accept', async () => {
    const { tx } = fakeTransaction(() =>
      Promise.reject(new Error('invalid input syntax for type uuid')),
    );
    const readProfile = jest.fn(() => Promise.resolve(requireCurrentUserId()));

    await expect(
      runInRlsContext({ tx, userId: null }, () =>
        asAuthenticated('not-a-uuid', readProfile),
      ),
    ).rejects.toThrow('invalid input syntax for type uuid');
    expect(readProfile).not.toHaveBeenCalled();
  });
});
