/**
 * Whether the app is in the foreground — so work the traveller cannot see,
 * like the globe's beacon (research D-30), stops while the app is away.
 *
 * `inactive` (iOS, mid-transition: the app switcher, an incoming call) counts
 * as away too. An unknown state at launch counts as foreground: pausing an
 * animation the traveller is looking at would be the worse mistake.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function isForeground(state: AppStateStatus | null | undefined): boolean {
  return state !== 'background' && state !== 'inactive';
}

export function useAppActive(): boolean {
  const [active, setActive] = useState(() => isForeground(AppState.currentState));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(isForeground(state)),
    );
    return () => subscription.remove();
  }, []);

  return active;
}
