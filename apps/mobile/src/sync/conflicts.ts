import { create } from 'zustand';

import type { ConflictNotice } from './types';

/**
 * Conflict notices waiting for the traveller (FR-040). In memory on purpose:
 * a notice is informational, the local row already holds the winning content,
 * and a notice that outlived the session it was raised in would describe a
 * change the traveller has long since seen.
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
