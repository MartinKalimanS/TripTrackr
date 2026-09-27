/**
 * Gate for the signed-in groups — tasks.md T041 (FR-027, FR-042; Constitution II).
 *
 * The root layout opens and migrates the traveller's encrypted database and
 * publishes the outcome through `LocalStoreProvider`. Each signed-in layout
 * wraps its navigator in this component so that no screen can mount before
 * the store it reads from exists:
 *
 *   - still opening  → a designed loading state ("Opening your trips"), which
 *                      on a cold start sits invisibly beneath the native splash;
 *   - failed         → a designed error state with "Try again", never a blank
 *                      screen or a crash;
 *   - ready          → the children, with `useDatabase()` guaranteed to answer.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { DatabaseProvider, useLocalStore } from '@/db/client';

export function RequireLocalStore({ children }: PropsWithChildren) {
  const { db, error, retry } = useLocalStore();

  if (error) {
    return (
      <Screen testID="local-store-error" style={styles.centred}>
        <ErrorState
          title="Couldn’t open your trips"
          detail="The encrypted store on this device did not open. Nothing has been lost — try again, or reinstall if it keeps happening."
          onRetry={retry}
        />
      </Screen>
    );
  }

  if (!db) {
    return (
      <Screen testID="local-store-opening" style={styles.centred}>
        <LoadingState title="Opening your trips" />
      </Screen>
    );
  }

  return <DatabaseProvider value={db}>{children}</DatabaseProvider>;
}

const styles = StyleSheet.create({
  centred: { justifyContent: 'center' },
});
