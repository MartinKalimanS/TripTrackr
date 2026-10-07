/**
 * Root layout — tasks.md R009, T041, T043, T119; research D-05, D-17.
 *
 * One `Stack` at the root so the `(auth)` group, the `(tabs)` group, the
 * per-trip stack, and the modal group can all mount; the scaffold rendered a
 * tab component directly here and had nowhere to put any of them.
 *
 * The auth gate is `Stack.Protected` (v57 authentication guide,
 * https://docs.expo.dev/router/reference/authentication.md, and
 * https://docs.expo.dev/router/advanced/protected.md): a group whose `guard`
 * is false is unreachable by any navigation, including a deep link, and a
 * traveller standing on it when the guard flips is moved off it and its
 * history is dropped. That is a stronger promise than a `<Redirect>` inside
 * the group, which only runs once the group has already rendered.
 *
 * The local store: once a session exists, the traveller's encrypted database
 * is opened and migrated here (`useOpenDatabase`) and published to the
 * signed-in layouts, which gate on it with `RequireLocalStore`. The native
 * splash stays up until BOTH the session is known AND — for a signed-in
 * traveller — the store is open or has failed, so the first frame is never a
 * half-ready screen. A failure renders a designed error state and is reported
 * (FR-073); a blank screen is not an outcome this layout can produce.
 *
 * The signed-in state is decided here, so this is also where the signed-in
 * shell asks iOS to blur its app-switcher snapshot (`useAppSwitcherProtection`,
 * FR-034): a boarding pass on screen must not stay legible in the switcher.
 * It is lifted on sign-out; Android's FLAG_SECURE covers its recents preview.
 *
 * It is also where the sync runtime is bound (T135, FR-038): `useSyncTriggers`
 * starts the engine, the upload queue and the four triggers once a traveller
 * is signed in AND their database is open, and stops them on sign-out. The
 * conflict notice (T133) is mounted here too, above the navigator, so a
 * traveller who is told their edit was replaced is told wherever they are in
 * the app. The first-sync state (T136) is the `(tabs)` layout's.
 *
 * The UI kit (feature 004, T412; research D4-05) is wired here and nowhere else:
 * `useKitTheme` hands `useAppearance().themeName` to Uniwind, `useKitConfig` feeds
 * reduced motion to `HeroUINativeProvider`, and that provider sits BELOW the query
 * client, the local store and the navigation theme because the portal host it mounts
 * renders Select, Dialog and Toast content inside it.
 */
// The Tailwind/Uniwind entry (feature 004, research D4-02). Imported here, once, and
// never from the package entry: Uniwind documents that a global.css imported at
// the entry turns every edit into a full reload instead of a hot reload.
import '@/global.css';

import Ionicons from '@expo/vector-icons/Ionicons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { HeroUINativeProvider } from 'heroui-native';
import { useEffect, useLayoutEffect, useMemo, type ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Uniwind } from 'uniwind';

import { ConflictNotices } from '@/components/ui/conflict-notice';
import { LocalStoreProvider, useOpenDatabase } from '@/db/client';
import { useSessionStore } from '@/features/auth/session-store';
import { useAppSwitcherProtection } from '@/features/documents/use-screen-capture-guard';
import { useAppearance, type AppearanceContext } from '@/hooks/use-appearance';
import { configureMapbox } from '@/lib/mapbox';
import { Sentry, initSentry } from '@/lib/sentry';
import { useSyncTriggers } from '@/sync/use-sync-triggers';
import type { PaletteName } from '@/theme/palette';

// FR-073. Called at module scope so that a crash during the first render is
// still captured — an init inside a component runs too late to see it.
initSentry();

// Research D-30: hand Mapbox its token and switch its telemetry off while the
// splash is up, so the globe rarely has to wait for it. The globe itself still
// waits on the result (`useMapboxReady`); this only starts the work early.
void configureMapbox();

// The Google and Apple buttons on Sign in and Create account draw Ionicons
// glyphs, and an icon whose font is not loaded yet paints nothing. Loading it
// behind the splash means those round buttons never appear empty.
Ionicons.loadFont().catch((error: unknown) => {
  Sentry.captureException(error);
});

// Keep the native splash up until the session has been read (v57 SplashScreen
// reference: call in global scope, without awaiting). A rejection here means
// the splash may hide early — cosmetic, but not something to lose silently.
SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  Sentry.captureException(error);
});

/**
 * Deep links into `trip/[id]` or `modal/*` need the tabs mounted beneath them,
 * or dismissing the modal would leave the traveller on nothing
 * (https://docs.expo.dev/router/advanced/modals.md, "Handle deep-linked modals").
 * It is also where `Stack.Protected` sends a traveller it has turned away.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

// One client for the app's lifetime (T043). Geography lookups tune their own
// staleTime; nothing else is cached server-side because the trip data is local.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
});

/**
 * What `Uniwind.setTheme` is given for an appearance theme (research D4-05, contract C4-4).
 *
 * `light` and `dark` become `'system'`, NOT themselves. `setTheme('light' | 'dark')` PINS
 * the scheme: Uniwind turns adaptive themes off and calls
 * `Appearance.setColorScheme('light' | 'dark')`, which is
 * `AppCompatDelegate.setDefaultNightMode` on Android and `overrideUserInterfaceStyle` on
 * every iOS window. The app would then stop following the OS, and `useColorScheme()`, the
 * input of `useAppearance()`, would keep reporting the value it was pinned to. `'system'`
 * switches adaptive mode back on and hands the scheme back (`setColorScheme('unspecified')`).
 *
 * The contrast themes are custom names: adaptive mode goes off, but the scheme is handed
 * back to the OS as well, so `useAppearance()` still chooses between `light-contrast` and
 * `dark-contrast` from the system scheme and the more-contrast flag.
 */
function kitThemeFor(themeName: PaletteName) {
  return themeName === 'light' || themeName === 'dark' ? 'system' : themeName;
}

/**
 * Keeps the kit's theme, and with it every className colour, equal to the one
 * `useAppearance()` resolved; nothing else sets it (contract C4-4). Called on EVERY change,
 * including the way back from a contrast theme to `light` or `dark`.
 *
 * A layout effect, on purpose: it runs before the commit is painted, so the classes switch
 * in the same frame as the legacy tokens that changed with `themeName`. It also runs while
 * this layout still renders nothing under the splash, so the first visible frame already
 * has the right theme. Uniwind starts adaptive on the device scheme, so for `light` and
 * `dark` that call is a no-op; a contrast theme arrives when the accessibility flag has
 * been read, which the splash covers (device check: research item 5, T406).
 */
function useKitTheme(themeName: PaletteName) {
  useLayoutEffect(() => {
    Uniwind.setTheme(kitThemeFor(themeName));
  }, [themeName]);
}

type KitConfig = NonNullable<ComponentProps<typeof HeroUINativeProvider>['config']>;

/**
 * The kit provider's settings (research D4-05).
 *
 * - `animation` follows `useAppearance().prefersLessMotion`: the kit reads Reanimated's
 *   reduce-motion flag once, at launch, so only this keeps it live (research item 6).
 * - `textProps` and `textInputProps` stay unset: the largest platform font size must work
 *   (002 FR-016), so there is no `maxFontSizeMultiplier`.
 * - The development banner is off: this codebase ships no debug output.
 *
 * Memoised on the one input, so the provider's context values stay stable across renders.
 */
function useKitConfig(prefersLessMotion: boolean): KitConfig {
  return useMemo(
    () => ({
      devInfo: { stylingPrinciples: false },
      animation: prefersLessMotion ? 'disable-all' : undefined,
    }),
    [prefersLessMotion],
  );
}

/**
 * React Navigation paints its own background behind every screen; left at the default it
 * is white, which is the "half-converted" flash Acceptance Scenario 3.2 forbids. Every
 * value below is a token (contract C1).
 */
function navigationThemeFor(isDark: boolean, tokens: AppearanceContext['tokens']) {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: tokens.accent,
      background: tokens.canvas,
      card: tokens.surface,
      text: tokens.textPrimary,
      border: tokens.border,
      notification: tokens.accent,
    },
  };
}

/**
 * The session, the traveller's local store and the splash (T041, T119, T135).
 *
 * The status is `loading` until the session has been read; for a signed-in traveller the
 * gate is settled only once the encrypted database has opened (migrations included) or
 * failed with something to show, and the native splash comes down then, not before.
 *
 * `appearanceReady` is the same kind of condition (`useAppearance().ready`): the splash
 * also stays up until the first read of the accessibility flags has settled, so the first
 * frame already has the contrast theme and the motion setting the OS asked for.
 */
function useSessionGate(appearanceReady: boolean) {
  const status = useSessionStore((session) => session.status);
  const userId = useSessionStore((session) => session.user?.id ?? null);
  const hydrate = useSessionStore((session) => session.hydrate);
  const store = useOpenDatabase(status === 'signed-in' ? userId : null);
  useAppSwitcherProtection(status === 'signed-in');
  // T135: nothing is bound until there is a traveller AND their open database.
  const signedIn = status === 'signed-in';
  useSyncTriggers(signedIn ? store.db : null, signedIn ? userId : null);

  useEffect(() => {
    // The store fails closed on its own; reporting is this layer's job.
    hydrate().catch((error: unknown) => {
      Sentry.captureException(error);
    });
  }, [hydrate]);

  // Settled: the appearance has been read AND the gate can decide AND, for a signed-in
  // traveller, the store has either opened (migrations included) or failed with
  // something to show.
  const settled =
    appearanceReady &&
    (status === 'signed-out' ||
      (status === 'signed-in' && (store.db !== null || store.error !== null)));

  useEffect(() => {
    if (settled) SplashScreen.hide();
  }, [settled]);

  useEffect(() => {
    if (store.error) Sentry.captureException(store.error);
  }, [store.error]);

  return { status, signedIn, store };
}

function RootStack({
  status,
  canvas,
}: {
  status: ReturnType<typeof useSessionGate>['status'];
  canvas: string;
}) {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: canvas },
      }}>
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed-in'}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      {/* Reachable in either state: a bad link is not a reason to sign in. */}
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

function RootLayout() {
  const { theme, themeName, prefersLessMotion, tokens, ready } = useAppearance();
  useKitTheme(themeName);
  const kitConfig = useKitConfig(prefersLessMotion);
  const { status, signedIn, store } = useSessionGate(ready);

  // Nothing is rendered beneath the splash until the gate can decide — a flash of the
  // welcome screen before the tabs is exactly the wrong first impression for a returning
  // traveller — and until the accessibility flags have been read, so the app never
  // appears on the base theme and then flips to the contrast one.
  if (status === 'loading' || !ready) return null;

  const isDark = theme === 'dark';

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* Keyboard frames for every form's KeyboardAwareScrollView (research D-24). Above
          the kit's provider, so what it portals (a toast wrapped in the library's
          KeyboardAvoidingView, a sheet with a field) can read them too. */}
      <KeyboardProvider>
        {/* testID is the anchor for the Maestro flows (e2e/00-smoke.yaml). */}
        <View testID="app-root" style={[styles.root, { backgroundColor: tokens.canvas }]}>
          <QueryClientProvider client={queryClient}>
            <LocalStoreProvider value={store}>
              <ThemeProvider value={navigationThemeFor(isDark, tokens)}>
                {/* The kit's provider (feature 004): text and input defaults, toasts and the
                    portal host. The host renders what Select, Dialog and Toast portal, and it
                    sits INSIDE this provider, so the provider goes below every context that
                    portalled content may read: the query client, the local store and the
                    navigation theme (research D4-05). Gesture handling is above it. */}
                <HeroUINativeProvider config={kitConfig}>
                  {/* FR-023: the status bar follows the theme with the rest of the UI. */}
                  <StatusBar style={isDark ? 'light' : 'dark'} />
                  {/* FR-040: told wherever the traveller is; nothing while there is nothing to tell. */}
                  {signedIn && store.db ? <ConflictNotices /> : null}
                  <RootStack status={status} canvas={tokens.canvas} />
                </HeroUINativeProvider>
              </ThemeProvider>
            </LocalStoreProvider>
          </QueryClientProvider>
        </View>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

// Sentry.wrap adds the error boundary and touch/navigation breadcrumbs that make
// a stack trace reproducible.
export default Sentry.wrap(RootLayout);
