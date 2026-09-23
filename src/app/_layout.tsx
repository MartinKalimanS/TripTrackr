import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { Colors } from '@/constants/theme';
import { Sentry, initSentry } from '@/lib/sentry';

// FR-073. Called at module scope so that a crash during the first render is
// still captured — an init inside a component runs too late to see it.
initSentry();

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // The canvas is painted at the root so that no gap between screens ever
  // exposes a default platform background — the "half-converted" state
  // Acceptance Scenario 3.2 forbids.
  const canvas = isDark ? Colors.dark.canvas : Colors.light.canvas;

  return (
    // testID is the anchor for the Maestro smoke flow (e2e/00-smoke.yaml).
    <View testID="app-root" style={{ flex: 1, backgroundColor: canvas }}>
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        {/* FR-023: the status bar follows the theme with the rest of the UI. */}
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </View>
  );
}

// Sentry.wrap adds the error boundary and touch/navigation breadcrumbs that make
// a stack trace reproducible.
export default Sentry.wrap(RootLayout);
