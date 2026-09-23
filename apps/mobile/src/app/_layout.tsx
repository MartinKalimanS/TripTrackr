/**
 * Root layout — tasks.md R009, research D-17.
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
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useSessionStore } from '@/features/auth/session-store';
import { useAppearance } from '@/hooks/use-appearance';
import { Sentry, initSentry } from '@/lib/sentry';

// FR-073. Called at module scope so that a crash during the first render is
// still captured — an init inside a component runs too late to see it.
initSentry();

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

// One client for the app's lifetime (T043). Query defaults are tuned when the
// first query lands with US1; the provider exists now so screens can assume it.
const queryClient = new QueryClient();

function RootLayout() {
  const { theme, tokens } = useAppearance();
  const status = useSessionStore((session) => session.status);
  const hydrate = useSessionStore((session) => session.hydrate);

  useEffect(() => {
    // The store fails closed on its own; reporting is this layer's job.
    hydrate().catch((error: unknown) => {
      Sentry.captureException(error);
    });
  }, [hydrate]);

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  // Nothing is rendered beneath the splash until the gate can decide — a
  // flash of the welcome screen before the tabs is exactly the wrong first
  // impression for a returning traveller.
  if (status === 'loading') return null;

  const isDark = theme === 'dark';
  const base = isDark ? DarkTheme : DefaultTheme;

  // React Navigation paints its own background behind every screen; left at
  // the default it is white, which is the "half-converted" flash Acceptance
  // Scenario 3.2 forbids. Every value below is a token (contract C1).
  const navigationTheme = {
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

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* testID is the anchor for the Maestro flows (e2e/00-smoke.yaml). */}
      <View testID="app-root" style={[styles.root, { backgroundColor: tokens.canvas }]}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider value={navigationTheme}>
            {/* FR-023: the status bar follows the theme with the rest of the UI. */}
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: tokens.canvas },
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
          </ThemeProvider>
        </QueryClientProvider>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

// Sentry.wrap adds the error boundary and touch/navigation breadcrumbs that make
// a stack trace reproducible.
export default Sentry.wrap(RootLayout);
