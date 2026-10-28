/**
 * A small gate for stamp captures (feature 005, F13; research D5-08): a long passport bakes each
 * stamp to a bitmap once, but never lays out more than a few vector stamps at the same time,
 * which is the whole point of baking them. `acquireSlot` resolves, first come first served, with
 * a function that gives the slot back; at most `RASTER_CONCURRENCY` are out at once.
 */
export const RASTER_CONCURRENCY = 3;

let active = 0;
const waiting: (() => void)[] = [];

function release(): void {
  active -= 1;
  const next = waiting.shift();
  if (next) next();
}

export function acquireSlot(): Promise<() => void> {
  return new Promise((resolve) => {
    const grant = () => {
      active += 1;
      let given = false;
      resolve(() => {
        if (given) return;
        given = true;
        release();
      });
    };
    if (active < RASTER_CONCURRENCY) grant();
    else waiting.push(grant);
  });
}

/** For tests: how many slots are out and how many callers wait. */
export function queueState(): { active: number; waiting: number } {
  return { active, waiting: waiting.length };
}
