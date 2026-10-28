/**
 * Delete the account (feature 008; FR-004 to FR-006; rest-api.md `DELETE /me`).
 *
 * The request is the one the server's sweep starts from: `DELETE /me` with the password, and
 * nothing else (an account that signed in with Google or Apple has none to send). It needs the
 * server, so a refusal or a missing connection leaves everything as it was and the sheet says
 * why (`delete-account-copy.ts`).
 *
 * Once the server has answered 202 the account is gone for good, and this device must end up
 * signed out whatever else fails, in this order:
 *
 *   1. the session ends (keychain, then the session store), so the app moves to Welcome and no
 *      screen is still reading the database;
 *   2. this phone's copy goes (`wipeLocalAccount`: staged files, sealed documents, offline maps,
 *      the encrypted database file). It never throws, so it cannot stop the sign-out.
 *
 * The unsynced-changes warning of a plain sign-out is not used: deleting the account makes
 * unsynced changes moot, and the sheet has already said that everything goes.
 */
import { useMutation } from '@tanstack/react-query';
import { DeleteMeResponse } from '@triptrackr/contracts';

import { useLocalStore } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { wipeLocalAccount } from '@/features/auth/wipe-local-account';
import { apiFetch } from '@/lib/api-client';
import { clearSession } from '@/lib/secure-store';

export interface DeleteAccountRequest {
  /** Absent or empty for an account with no password. */
  password?: string;
}

export function useDeleteAccount() {
  const { db } = useLocalStore();

  return useMutation<void, Error, DeleteAccountRequest>({
    // Do not keep the password in the mutation cache once the sheet is gone.
    gcTime: 0,
    mutationFn: async ({ password }) => {
      const user = useSessionStore.getState().user;
      await apiFetch(DeleteMeResponse, '/me', {
        method: 'DELETE',
        body: password ? { password } : {},
      });

      await clearSession();
      useSessionStore.getState().signOut();

      if (db && user) await wipeLocalAccount(db, user.id);
    },
  });
}
