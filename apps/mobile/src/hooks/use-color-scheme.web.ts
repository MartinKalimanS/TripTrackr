import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/** Never fires: hydration is a one-way transition, so there is nothing to subscribe to. */
const subscribe = () => () => {};

/**
 * To support static rendering, this value needs to be re-calculated on the client side
 * for web.
 *
 * `useSyncExternalStore` is the hydration-safe way to ask "am I on the client yet?".
 * The server snapshot is `false` and the client snapshot is `true`, so React resolves
 * the difference during hydration itself rather than through a second render pass
 * triggered by setState inside an effect.
 */
export function useColorScheme() {
  const hasHydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const colorScheme = useRNColorScheme();

  return hasHydrated ? colorScheme : 'light';
}
