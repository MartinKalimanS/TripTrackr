import { z } from 'zod';

/**
 * The seven mirrored tables, in **dependency order**.
 *
 * This list is the sync protocol's scope and the on-device schema's mirror list
 * at the same time (data-model.md §10); a table added to one must be added here.
 * The order is load-bearing: the client pushes in this order so that every
 * foreign key a record carries already exists server-side when it arrives
 * (sync-protocol.md §2, "parents before children").
 */
export const SYNC_TABLES = [
  'trips',
  'trip_stops',
  'expense_categories',
  'notes',
  'expenses',
  'photos',
  'documents',
] as const;

export const SyncTable = z.enum(SYNC_TABLES);
export type SyncTable = z.infer<typeof SyncTable>;

/** Position of a table in the push order. Lower pushes first. */
export function syncTableIndex(table: SyncTable): number {
  return SYNC_TABLES.indexOf(table);
}
