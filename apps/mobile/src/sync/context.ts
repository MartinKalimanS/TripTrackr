import type { AppDatabase } from '@/db/client';

/**
 * What one sync cycle runs against (tasks.md T131).
 *
 * `isCurrent()` answers "is this still the database the engine is bound to?".
 * The engine binds one signed-in traveller's database at a time
 * (`startSyncEngine`), and the API client authenticates with WHOEVER is signed
 * in now. A cycle that outlived its binding — the traveller signed out, or
 * another one signed in — must therefore neither send its rows nor apply a
 * response: it would push one traveller's records under another's session, or
 * write another's history into this file. Push and pull check it before every
 * request and again before applying every response, and stop with
 * `SyncAbortedError` the moment it turns false (Constitution I).
 */
export interface SyncContext {
  readonly db: AppDatabase;
  isCurrent: () => boolean;
}

/** The engine was unbound (sign-out, account switch) while a cycle was running. */
export class SyncAbortedError extends Error {
  constructor() {
    super('The sync cycle was abandoned: its database is no longer bound.');
    this.name = 'SyncAbortedError';
  }
}

export function assertCurrent(ctx: SyncContext): void {
  if (!ctx.isCurrent()) throw new SyncAbortedError();
}
