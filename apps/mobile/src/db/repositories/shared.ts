/**
 * Helpers shared by the local repositories.
 *
 * Every local write stamps `updated_at` with the device clock in ISO-8601 UTC.
 * The server compares that value under last-write-wins (research D-02) and
 * clamps anything implausibly far in the future (sync-protocol.md §2), so a
 * wrong device clock cannot win every conflict — but it is still what the
 * traveller's own device shows them, so it is generated in one place.
 */

/** Current instant as the wire's `IsoDateTime` (UTC, with offset). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Split `items` into runs of at most `size` — SQLite bounds bound-parameter counts per statement. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const runs: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    runs.push(items.slice(start, start + size));
  }
  return runs;
}
