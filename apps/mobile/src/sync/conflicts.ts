import type { SyncTable } from '@triptrackr/contracts';
import { compareAmounts } from '@triptrackr/contracts';
import { create } from 'zustand';

import type { SyncRow } from '@/db/repositories/sync';

import { contentKeys, describeRecord, tripIdOf, type WireRecord } from './records';
import type { ConflictNotice } from './types';

/**
 * Conflict notices waiting for the traveller (FR-040). In memory on purpose:
 * a notice is informational, the local row already holds the winning content,
 * and a notice that outlived the session it was raised in would describe a
 * change the traveller has long since seen.
 *
 * The store is the seam the conflict-notice component reads. The engine fills
 * it through `noticeForOverwrite` (decide whether there is anything to say)
 * and `raiseConflicts` (say it): "the server won" is not news when the
 * traveller's edit and the winning version say the same thing, and a lost
 * acknowledgement re-delivering our own row must not look like a conflict.
 */
interface ConflictState {
  notices: readonly ConflictNotice[];
  raise: (notice: ConflictNotice) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useConflictStore = create<ConflictState>((set) => ({
  notices: [],
  raise: (notice) =>
    set((state) =>
      state.notices.some((existing) => existing.id === notice.id)
        ? state
        : { notices: [...state.notices, notice] },
    ),
  dismiss: (id) =>
    set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) })),
  clear: () => set({ notices: [] }),
}));

export function useConflictNotices(): readonly ConflictNotice[] {
  return useConflictStore((state) => state.notices);
}

// ---------------------------------------------------------------------------
// Deciding whether there is anything to tell
// ---------------------------------------------------------------------------

/** Deterministic text for an object, so key order never makes two equal values differ. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, inner]) => `${JSON.stringify(key)}:${stable(inner)}`);
  return `{${entries.join(',')}}`;
}

function sameAmount(a: string, b: string): boolean {
  try {
    return compareAmounts(a, b) === 0;
  } catch {
    return a.trim() === b.trim();
  }
}

/**
 * Two values as the traveller would see them: surrounding whitespace is not
 * content (the wire trims titles), `12.5` and `12.50` are one amount, and an
 * object compares by content.
 */
function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    return key === 'amount' ? sameAmount(a, b) : a.trim() === b.trim();
  }
  return stable(a) === stable(b);
}

/**
 * Did the traveller's content actually differ? Compares the columns they
 * author (the push record's own fields, minus identity and the derived FX
 * columns) and whether the row is deleted. Timestamps, `is_dirty`, `synced_at`,
 * `local_file_uri` and every server-owned column are ignored on purpose: two
 * versions that read the same to the traveller are not a conflict.
 */
export function contentDiffers(
  table: SyncTable,
  local: SyncRow,
  incoming: WireRecord,
): boolean {
  if ((local.deleted_at !== null) !== (incoming.deleted_at !== null)) return true;
  return contentKeys(table).some((key) => !sameValue(key, local[key], incoming[key]));
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function summarise(table: SyncTable, local: SyncRow, incoming: WireRecord): string {
  const localDeleted = local.deleted_at !== null;
  const incomingDeleted = incoming.deleted_at !== null;
  if (localDeleted) {
    return `You deleted ${describeRecord(table, incoming)}, but a newer edit made on another device kept it.`;
  }
  if (incomingDeleted) {
    return `${capitalise(describeRecord(table, local))} was deleted on another device after your change, so it was removed here.`;
  }
  return `Your change to ${describeRecord(table, local)} was replaced by a newer version saved on another device.`;
}

/**
 * The notice to raise when `incoming` (the server's winning version) replaces
 * the traveller's local `local`, or `null` when their content did not differ.
 * The id is derived from the record and the winning version, so raising the
 * same overwrite twice (a push verdict, then the pull that re-delivers it) is
 * one notice.
 */
export function noticeForOverwrite(
  table: SyncTable,
  local: SyncRow,
  incoming: WireRecord,
  detectedAt: string,
): ConflictNotice | null {
  if (!contentDiffers(table, local, incoming)) return null;
  return {
    id: `${table}:${local.id}:${String(incoming.updated_at)}`,
    table,
    recordId: local.id,
    tripId: tripIdOf(table, incoming),
    summary: summarise(table, local, incoming),
    detectedAt,
  };
}

/** Tell the traveller. Called AFTER the transaction that applied the overwrite committed. */
export function raiseConflicts(notices: readonly ConflictNotice[]): void {
  const { raise } = useConflictStore.getState();
  for (const notice of notices) raise(notice);
}
