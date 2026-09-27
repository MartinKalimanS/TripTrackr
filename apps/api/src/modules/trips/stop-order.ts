/**
 * Stop ordering as list arithmetic (FR-010, FR-012).
 *
 * `sort_order` is stored contiguous from 0 so that the device mirror and the
 * server agree on what "the second stop" means, and so that inserting a stop
 * mid-trip needs no arc maintenance (FR-016 — arcs are derived from the order,
 * never stored). Every function here returns a new list; the repository then
 * writes only the rows whose position changed, so `updated_at` — the sync
 * cursor — moves only on rows a device actually needs to pull again.
 */

/** A persisted stop's identity and its current position. */
export interface OrderedStop {
  readonly id: string;
  readonly sortOrder: number;
}

/**
 * The order with `id` inserted at `position`, clamped to the list; omitted
 * means append (contracts: "Omitted means 'append after the current last stop'").
 */
export function insertAt(
  order: readonly string[],
  id: string,
  position?: number,
): readonly string[] {
  const at = clamp(position ?? order.length, order.length);

  return [...order.slice(0, at), id, ...order.slice(at)];
}

/** The order with `id` moved to `position`, clamped; unchanged if `id` is absent. */
export function moveTo(
  order: readonly string[],
  id: string,
  position: number,
): readonly string[] {
  if (!order.includes(id)) return order;

  const remaining = without(order, id);
  const at = clamp(position, remaining.length);

  return [...remaining.slice(0, at), id, ...remaining.slice(at)];
}

/** The order with `id` removed. */
export function without(order: readonly string[], id: string): readonly string[] {
  return order.filter((existing) => existing !== id);
}

/**
 * The rows to write so that `next` becomes the persisted order: each id paired
 * with its index in `next`, for those whose stored position differs (or that
 * have none yet). Positions are contiguous from 0 by construction.
 */
export function renumber(
  previous: readonly OrderedStop[],
  next: readonly string[],
): readonly OrderedStop[] {
  const current = new Map(previous.map((stop) => [stop.id, stop.sortOrder]));

  return next
    .map((id, index) => ({ id, sortOrder: index }))
    .filter((stop) => current.get(stop.id) !== stop.sortOrder);
}

function clamp(position: number, max: number): number {
  return Math.min(Math.max(0, position), max);
}
