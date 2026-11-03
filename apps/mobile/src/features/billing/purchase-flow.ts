/**
 * After the store confirms a purchase, wait for the SERVER to confirm it (spec 014, D14-08). The
 * webhook is what grants a credit or opens a year; the app never marks anything as bought on the
 * strength of the store's own answer. Polls the entitlement a few times; if nothing changes it is
 * `pending`, not a failure: a webhook can be late, and the entitlement catches up on its own.
 */
import type { EntitlementResponse } from '@triptrackr/contracts';

export type GrantResult = 'granted' | 'pending';

export interface WaitOptions {
  readonly attempts: number;
  readonly delayMs: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Something the traveller can spend that they could not spend before. */
function gained(before: EntitlementResponse, now: EntitlementResponse): boolean {
  return (
    now.credits > before.credits ||
    now.year_uses_left > before.year_uses_left ||
    (now.is_active && !before.is_active) ||
    (now.tier === 'unlimited' && before.tier !== 'unlimited')
  );
}

export async function waitForGrant(
  read: () => Promise<EntitlementResponse>,
  before: EntitlementResponse,
  { attempts, delayMs, sleep = realSleep }: WaitOptions,
): Promise<GrantResult> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if (gained(before, await read())) return 'granted';
    } catch {
      // A failed read is the same as no news yet; the next attempt may succeed.
    }
    if (attempt < attempts - 1) await sleep(delayMs);
  }
  return 'pending';
}
