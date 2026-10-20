import type { SyncTable } from '@triptrackr/contracts';
import { create } from 'zustand';

import type { ParkReason } from '@/db/repositories/sync';

/**
 * What the sync engine tells the rest of the app that is neither a conflict nor
 * a status: two small in-memory lists (tasks.md T132; Constitution V).
 *
 * - `overAllowanceTripIds`: trips the server applied with the
 *   `over_allowance` warning. The trip is KEPT — pushed, applied, readable and
 *   editable; the commercial question is asked afterwards by the entitlement
 *   flow, which reads this list and calls `acknowledgeOverAllowance` once it
 *   has asked. Nothing here touches, hides or restricts the trip. In memory on
 *   purpose: it is a hint about a moment, and the entitlement flow can always
 *   re-derive "over the allowance" from the trip count.
 * - `parked`: records the server refused as `invalid` (or could not
 *   re-identify). They stay on the device, dirty and readable, and are not
 *   retried every cycle; the list is the repair surface's input. It mirrors the
 *   persisted `sync_parked` table, refreshed after every push.
 *
 * Both are cleared when the engine unbinds, so one traveller's titles and ids
 * are never shown to the next (Constitution I).
 */
export interface ParkedRecord {
  table: SyncTable;
  recordId: string;
  reason: ParkReason;
  /** ISO instant the record was parked. */
  parkedAt: string;
}

interface WarningsState {
  overAllowanceTripIds: readonly string[];
  parked: readonly ParkedRecord[];
  flagOverAllowance: (tripId: string) => void;
  acknowledgeOverAllowance: (tripId: string) => void;
  setParked: (parked: readonly ParkedRecord[]) => void;
  reset: () => void;
}

export const useSyncWarningsStore = create<WarningsState>((set) => ({
  overAllowanceTripIds: [],
  parked: [],
  flagOverAllowance: (tripId) =>
    set((state) =>
      state.overAllowanceTripIds.includes(tripId)
        ? state
        : { overAllowanceTripIds: [...state.overAllowanceTripIds, tripId] },
    ),
  acknowledgeOverAllowance: (tripId) =>
    set((state) => ({
      overAllowanceTripIds: state.overAllowanceTripIds.filter((id) => id !== tripId),
    })),
  setParked: (parked) => set({ parked }),
  reset: () => set({ overAllowanceTripIds: [], parked: [] }),
}));

/** Trips the server kept although the account is over its allowance. */
export function useOverAllowanceTripIds(): readonly string[] {
  return useSyncWarningsStore((state) => state.overAllowanceTripIds);
}

/** Records the server refused as invalid and that wait for the traveller to edit them. */
export function useParkedRecords(): readonly ParkedRecord[] {
  return useSyncWarningsStore((state) => state.parked);
}
